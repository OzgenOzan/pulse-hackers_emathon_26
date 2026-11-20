"""Export the synthetic night-shift feed to raw_data/ as CSV and Markdown.

Usage:
  python scripts/export_raw_data.py          rewrite raw_data/ from the scenario and default rules
  python scripts/export_raw_data.py --check  fail unless every committed file matches the export

Values come from the canonical scenario loader, the real Player with apply_event, VitalValues, score_labs
and generate_noise.NOISE_ORDER. Nothing here re-implements delivery, MAP or lab scoring.
"""

import argparse
from codecs import BOM_UTF8
import csv
import io
import json
import sys
from collections import Counter, defaultdict, deque
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'backend'))

from app.adapters.simulator import SimulatorSource  # noqa: E402
from app.domain.models import LabOrder, PatientProfile, PatientSnapshot, VitalValues  # noqa: E402
from app.engine.config import EngineConfig, LabRule, load_config  # noqa: E402
from app.engine.labs import score_labs  # noqa: E402
from app.sim.player import (  # noqa: E402
    VITAL_FIELDS,
    ArrivalEvent,
    ConsultEvent,
    Event,
    GcsEvent,
    LabOrderEvent,
    LabResultEvent,
    MonitorDisconnectEvent,
    PhysicianActionEvent,
    Player,
    Scenario,
    VitalsEvent,
    _at,
    apply_event,
)
from app.state import Session  # noqa: E402
from generate_noise import NOISE_ORDER  # noqa: E402

SCENARIO_PATH = ROOT / 'backend' / 'app' / 'sim' / 'scenarios' / 'night_shift_0245.json'
RAW = ROOT / 'raw_data'
FOLDER = RAW / 'night_shift_0245'
SEED = 20261120
SYNTHETIC = 'SYNTHETIC: no real patients; all names and protocol numbers are invented.'
NOTE_DISCONNECT = ('monitor disconnected 03:00; samples resume from the first cycle after the nurse confirms '
                   'reconnection')
ALERT_TEXT = {
    'RED': 'Kritik alarm (hekim)',
    'YELLOW': 'Veri eksikliği görevi (hemşire)',
    'GREEN': 'Taburculuk değerlendirmesi (hekim)',
}
PATIENT_COLUMNS = ['patient_id', 'bed', 'initials', 'synthetic_name', 'protocol', 'age', 'sex', 'arrived_at',
                   'monitored', 'complaint_tr', 'working_dx', 'nurse', 'physician', 'data_origin',
                   'expected_first_alert']
VITAL_COLUMNS = ['time', 'patient_id', 'bed', 'source', 'hr', 'sbp', 'dbp', 'map', 'map_source', 'temp', 'spo2',
                 'rr', 'delivered_unattended', 'note']
LAB_COLUMNS = ['patient_id', 'bed', 'test', 'label', 'unit', 'ordered_at', 'resulted_at', 'value', 'reference',
               'critical_low', 'critical_high', 'default_rule_reading']
EVENT_COLUMNS = ['time', 'patient_id', 'bed', 'type', 'details']
ALERT_COLUMNS = ['first_at', 'patient_id', 'bed', 'level', 'shown_as']
REPLAY_COLUMNS = ['time', 'patient_id', 'bed', 'score', 'components', 'risk_status']

README = f"""{SYNTHETIC}

# Synthetic raw data: night shift 02:45

This folder shows what the engine receives in the `night_shift_0245` simulation. It is exported from the committed
scenario file and the default rule file, so you can read it without running the app. Every value comes from the same
code the simulator and engine use.

## Which file to open

| To see | Open |
|---|---|
| Who each patient is: bed, diagnosis, arrival, staff | [patients.csv](night_shift_0245/patients.csv) |
| Every vital-sign sample in the feed, including samples never delivered | [vitals.csv](night_shift_0245/vitals.csv) |
| Every lab order, its result and how the default rules read it | [labs.csv](night_shift_0245/labs.csv) |
| The full timeline: arrivals, vitals, GCS, consults, monitor disconnect, physician actions | [events.csv](night_shift_0245/events.csv) |
| The scenario's documented first alerts | [expected_alerts.csv](night_shift_0245/expected_alerts.csv) |
| One readable page per patient | [Patient pages](night_shift_0245/patients/), from `Y01.md` to `Y12.md` |

## Column dictionary

| File | Column | Meaning | Unit or format |
|---|---|---|---|
| patients.csv | patient_id | Scenario patient code | Y01 to Y12 |
| patients.csv | bed | Bed label | S-01 to S-12 |
| patients.csv | initials | Initials used in the scenario | text |
| patients.csv | synthetic_name | Invented patient name | text |
| patients.csv | protocol | Invented protocol number | digits |
| patients.csv | age, sex | Age and sex | years; M or F |
| patients.csv | arrived_at | Arrival time | YYYY-MM-DD HH:MM |
| patients.csv | monitored | Patient has a monitor | yes or no |
| patients.csv | complaint_tr | Chief complaint, in Turkish | text |
| patients.csv | working_dx | Working diagnoses | `ICD-10 text; ICD-10 text` |
| patients.csv | nurse, physician | Invented staff names | text |
| patients.csv | data_origin | How the vitals were made | `scripted`, or `vitals seeded, seed 20261120` |
| patients.csv | expected_first_alert | Documented first alert | level and time; blank if none |
| vitals.csv | time | Sample time | YYYY-MM-DD HH:MM |
| vitals.csv | source | Who recorded the sample | monitor or manual |
| vitals.csv | hr | Heart rate | /min |
| vitals.csv | sbp, dbp | Systolic and diastolic blood pressure | mmHg |
| vitals.csv | map | Mean arterial pressure | mmHg, 2 decimals |
| vitals.csv | map_source | Where MAP came from | derived or measured |
| vitals.csv | temp | Body temperature | °C, 1 decimal |
| vitals.csv | spo2 | Oxygen saturation | % |
| vitals.csv | rr | Respiratory rate | /min |
| vitals.csv | delivered_unattended | Reached the engine during replay with no user action | yes or no |
| vitals.csv | note | Why a sample was not delivered | text |
| labs.csv | test | Lab test code | text |
| labs.csv | label | Display name in the default rules; the test code if not configured | text |
| labs.csv | unit | Unit received with the result; configured unit while pending | unit text |
| labs.csv | ordered_at, resulted_at | Order and result times | YYYY-MM-DD HH:MM |
| labs.csv | value | Result | number in the stated unit |
| labs.csv | reference | Normal range in the default rules | number range |
| labs.csv | critical_low, critical_high | Critical cutoffs in the default rules | number in the stated unit |
| labs.csv | default_rule_reading | How the default rules read the result | `scored (+3)`, `suppressed: <reason_key>`, `within reference`, `not configured` or `pending` |
| events.csv | time, patient_id, bed | When, which patient and bed | as above |
| events.csv | type | Event type | arrival, vitals, gcs, lab_order, lab_result, physician_action, monitor_disconnect, consult_request or consult_result |
| events.csv | details | Event value or description | vital source; GCS 3 to 15; test result with unit; service name; action name |
| expected_alerts.csv | first_at | Documented first alert time | YYYY-MM-DD HH:MM |
| expected_alerts.csv | level | Alert level | RED, YELLOW or GREEN |
| expected_alerts.csv | shown_as | How the screen labels the alert | RED: Kritik alarm (hekim); YELLOW: Veri eksikliği görevi (hemşire); GREEN: Taburculuk değerlendirmesi (hekim) |

Units in the patient pages: HR /min; BP and MAP mmHg; temperature °C; SpO₂ %; RR /min; GCS on the 3 to 15 scale.
`events.csv` follows the canonical event order, including the sample on the 03:00 boundary before the disconnect.
The measurements and delivery status for each vital sample are in `vitals.csv`.

## Time base

All times are simulated local time on 20 Nov 2026, written as `YYYY-MM-DD HH:MM`. The shift runs 02:45 to 04:30,
with pre-start history from 01:55.

## Mean arterial pressure

MAP = DBP + (SBP − DBP) / 3, computed by `VitalValues` as the engine does. The `map` column shows two decimals; the
engine compares the unrounded value. No event in this scenario supplies MAP, so every `map_source` is `derived`.

## Background streams

Six patients ({", ".join(NOISE_ORDER)}) have background vitals generated by `scripts/generate_noise.py` with seed
{SEED}. Their rows are marked `vitals seeded, seed {SEED}` in `patients.csv`; the generated samples are committed in the
scenario file. The other six patients are scripted.

## Y03: delivery rule

Y03's monitor disconnects at 03:00 (`monitor_disconnect`; it resumes only on nurse acknowledgement). From the disconnect onward, each Y03 monitor sample that the replay does not deliver stays in `vitals.csv`, marked `delivered_unattended = no` with the note "{NOTE_DISCONNECT}". The export replays the real player with no user actions, so no acknowledgement is sent and the disconnect stays in effect.

## Two intended limitations visible in the data

- **Y08's chronically low MAP still raises a critical alarm.** All three Y08 samples have MAP at or below 65 mmHg (64.00, 64.00 and 63.67), and the scenario documents a RED alert at 04:15.
- **Y05's lactate of 4.2 mmol/L is suppressed.** It is above the 4.0 critical cutoff, but convulsions (R56.8) are not mapped to lactate in `icd_lab_relevance`, so the lab adds no points and is listed as `unrelated_diagnosis`.

## Derived replay (engine output)

The [derived replay CSV](night_shift_0245/derived/engine_replay_default_rules.csv) is engine output, not a feed.
It records the score, scoring components (JSON), and risk status for each in-zone patient at each evaluation
of the unattended replay under the shipped rules.

## Regenerate and check

```
python scripts/export_raw_data.py          # rewrite raw_data/ from the scenario and default rules
python scripts/export_raw_data.py --check  # fail if any committed file differs
```

On Windows, run `.venv\\Scripts\\python.exe scripts/export_raw_data.py` from the repository root.

## Opening the CSV files in Excel

The CSV files are UTF-8 with a byte-order mark, so Excel keeps ş, ğ and İ. In a Turkish-locale Excel, use
Veri → Metinden/CSV'den with a comma delimiter.

# Türkçe özet

{SYNTHETIC}

- Açılacak dosyalar: `night_shift_0245/patients.csv` (hasta bilgileri), `vitals.csv` (tüm vital bulgular), `labs.csv`
  (tetkikler), `events.csv` (zaman çizelgesi), `expected_alerts.csv` (beklenen ilk uyarılar) ve
  `night_shift_0245/patients/Y01.md` ile `Y12.md` (hasta sayfaları).
- Zaman: 20 Kasım 2026, simüle yerel saat, `YYYY-MM-DD HH:MM`. Vardiya 02:45 ile 04:30 arasındadır; 01:55'ten başlayan
  ön geçmiş vardır.
- MAP = DBP + (SBP − DBP) / 3.
- {", ".join(NOISE_ORDER)} hastalarının arka plan vitalleri `scripts/generate_noise.py` ile,
  tohum {SEED} kullanılarak üretilir.
- Y03: monitör 03:00'te bağlantısını kaybeder. Sonraki monitör örnekleri `vitals.csv` içinde kalır, ancak
  `delivered_unattended = no` ile işaretlidir; motora ulaşmazlar.
- Yeniden üretme: `python scripts/export_raw_data.py`. Denetim: `python scripts/export_raw_data.py --check`.
- Excel: Türkçe yerel ayarlı Excel'de Veri → Metinden/CSV'den seçeneğini kullanın ve ayırıcı olarak virgülü seçin.
- Bilinen iki sınırlama: (1) Y08'in kronik düşük MAP'i yine kritik alarm üretir. (2) Y05'in laktat değeri
  (4,2 mmol/L) bastırılır; konvülsiyon laktat ile eşleştirilmemiştir.
"""


def stamp(moment: datetime) -> str:
    return moment.strftime('%Y-%m-%d %H:%M')


def number(value: float | None, spec: str = 'g') -> str:
    return '' if value is None else format(value, spec)


def replay(scenario: Scenario, config: EngineConfig) -> dict[str, PatientSnapshot]:
    """Deliver the feed exactly as the session does, with no user actions."""
    player = Player(scenario, config.cycle_minutes)
    frames = [*player.reset(), *player.advance_to(scenario.end)]
    patients: dict[str, PatientSnapshot] = {}
    disconnected: set[str] = set()
    for frame in frames:
        for event in frame.events:
            apply_event(patients, event, frame.time, disconnected)
    return patients


def vital_rows(scenario: Scenario, patients: dict[str, PatientSnapshot],
               supplied_map: dict[tuple[str, datetime, str], deque[bool]]) -> list[dict[str, str]]:
    # A sample reached the engine when apply_event appended it; match each scheduled sample against that record.
    delivered = Counter((pid, reading.time, reading.source)
                        for pid, snapshot in patients.items() for reading in snapshot.vitals)
    disconnects = {item.event.patient: item.at.strftime('%H:%M') for item in scenario.events
                   if isinstance(item.event, MonitorDisconnectEvent)}
    if disconnects != {'Y03': '03:00'}:
        raise ValueError(f'the Y03 note and README describe a 03:00 disconnect of Y03 only; scenario has {disconnects}')
    rows = []
    for item in scenario.events:
        event = item.event
        if not isinstance(event, VitalsEvent):
            continue
        reading = VitalValues(**event.model_dump(include=VITAL_FIELDS))
        key = (event.patient, item.at, event.source)
        reached = delivered[key] > 0
        if reached:
            delivered[key] -= 1
        rows.append({
            'time': stamp(item.at),
            'patient_id': event.patient,
            'bed': scenario.patients[event.patient].bed,
            'source': event.source,
            'hr': number(reading.hr),
            'sbp': number(reading.sbp),
            'dbp': number(reading.dbp),
            'map': number(reading.map, '.2f'),
            'map_source': 'measured' if supplied_map[key].popleft() else 'derived' if reading.map is not None else '',
            'temp': number(reading.temp, '.1f'),
            'spo2': number(reading.spo2),
            'rr': number(reading.rr),
            'delivered_unattended': 'yes' if reached else 'no',
            'note': '' if reached else NOTE_DISCONNECT,
        })
    return sorted(rows, key=lambda row: (row['time'], row['patient_id']))


def reference(rule: LabRule | None) -> str:
    if rule is None or (rule.ref_low is None and rule.ref_high is None):
        return ''
    if rule.ref_low is None:
        return f'≤ {number(rule.ref_high)}'
    if rule.ref_high is None:
        return f'≥ {number(rule.ref_low)}'
    return f'{number(rule.ref_low)}–{number(rule.ref_high)}'


def lab_reading(profile: PatientProfile, order: LabOrder, config: EngineConfig) -> str:
    """Score one result on a snapshot that holds only that order, under the default rules."""
    if order.resulted_at is None:
        return 'pending'
    alone = PatientSnapshot(profile=profile, labs=[order])
    components, suppressed = score_labs(alone, alone.labs, order.resulted_at, config)
    if components:
        return f'scored (+{components[0].points})'
    if suppressed:
        return f'suppressed: {suppressed[0].reason_key}'
    if order.test not in config.labs:
        return 'not configured'
    return 'within reference'


def lab_rows(patients: dict[str, PatientSnapshot], config: EngineConfig) -> list[dict[str, str]]:
    rows = []
    for snapshot in patients.values():
        profile = snapshot.profile
        for order in snapshot.labs:
            rule = config.labs.get(order.test)
            rows.append({
                'patient_id': profile.id,
                'bed': profile.bed,
                'test': order.test,
                'label': rule.label if rule is not None else order.test,
                'unit': (order.unit or '') if order.resulted_at is not None else (rule.unit if rule else ''),
                'ordered_at': stamp(order.ordered_at),
                'resulted_at': '' if order.resulted_at is None else stamp(order.resulted_at),
                'value': number(order.value),
                'reference': reference(rule),
                'critical_low': number(rule.critical_low) if rule is not None else '',
                'critical_high': number(rule.critical_high) if rule is not None else '',
                'default_rule_reading': lab_reading(profile, order, config),
            })
    return sorted(rows, key=lambda row: (row['patient_id'], row['ordered_at'], row['test']))


def describe(event: Event) -> str:
    if isinstance(event, ArrivalEvent):
        return f'age {event.profile.age} {event.profile.sex}'
    if isinstance(event, VitalsEvent):
        return f'{event.source} sample (see vitals.csv)'
    if isinstance(event, GcsEvent):
        return f'GCS {event.value}'
    if isinstance(event, LabOrderEvent):
        return event.test
    if isinstance(event, LabResultEvent):
        return ' '.join(filter(None, [event.test, '=', number(event.value), event.unit or '']))
    if isinstance(event, PhysicianActionEvent):
        return event.action
    if isinstance(event, MonitorDisconnectEvent):
        return 'resume on nurse acknowledgement'
    if isinstance(event, ConsultEvent):
        return event.service
    raise TypeError(f'no description for {type(event).__name__}')


def event_rows(scenario: Scenario) -> list[dict[str, str]]:
    rows = []
    for item in scenario.events:
        event = item.event
        profile = scenario.patients[event.patient]
        rows.append({
            'time': stamp(item.at),
            'patient_id': profile.id,
            'bed': profile.bed,
            'type': event.type,
            'details': describe(event),
        })
    return rows  # Scenario.load already puts equal-time events in engine delivery order.


def alert_rows(scenario: Scenario) -> list[dict[str, str]]:
    rows = [{
        'first_at': stamp(item.at),
        'patient_id': item.patient,
        'bed': scenario.patients[item.patient].bed,
        'level': item.level,
        'shown_as': ALERT_TEXT[item.level],
    } for item in scenario.expect]
    return sorted(rows, key=lambda row: (row['first_at'], row['patient_id']))


def patient_rows(scenario: Scenario) -> list[dict[str, str]]:
    expected = {item.patient: item for item in scenario.expect}
    rows = []
    for profile in sorted(scenario.patients.values(), key=lambda item: item.id):
        if profile.display is None:
            raise ValueError(f'{profile.id} has no display block')
        display = profile.display
        alert = expected.get(profile.id)
        rows.append({
            'patient_id': profile.id,
            'bed': profile.bed,
            'initials': profile.label,
            'synthetic_name': display.name,
            'protocol': display.protocol,
            'age': str(profile.age),
            'sex': profile.sex,
            'arrived_at': stamp(profile.arrived_at),
            'monitored': 'yes' if profile.monitored else 'no',
            'complaint_tr': display.complaint,
            'working_dx': '; '.join(f'{dx.code} {dx.text}' for dx in profile.working_dx),
            'nurse': display.nurse,
            'physician': display.physician,
            'data_origin': f'vitals seeded, seed {SEED}' if profile.id in NOISE_ORDER else 'scripted',
            'expected_first_alert': '' if alert is None else f'{alert.level} {stamp(alert.at)}',
        })
    return rows


def _table(headers: list[str], rows: list[list[str]]) -> list[str]:
    def line(cells: list[str]) -> str:
        return '| ' + ' | '.join(cells) + ' |'
    return [line(headers), line(['---'] * len(headers)), *(line(row) for row in rows)]


def _bullets(items: list[str]) -> list[str]:
    return [f'- {item}' for item in items] or ['None.']


def patient_page(row: dict[str, str], vitals: list[dict[str, str]], labs: list[dict[str, str]],
                 events: list[dict[str, str]]) -> str:
    lines = [f"# {row['patient_id']} — {row['synthetic_name']}", '', SYNTHETIC, '', '## Identity', '']
    lines += _table(['Field', 'Value'], [
        ['Bed', row['bed']],
        ['Initials (scenario label)', row['initials']],
        ['Protocol (synthetic)', row['protocol']],
        ['Age, sex', f"{row['age']} {row['sex']}"],
        ['Arrived', row['arrived_at']],
        ['Monitored', row['monitored']],
        ['Complaint (Turkish)', row['complaint_tr']],
        ['Working diagnosis', row['working_dx']],
        ['Nurse', row['nurse']],
        ['Physician', row['physician']],
        ['Data origin', row['data_origin']],
        ['Expected first alert', row['expected_first_alert'] or 'none documented'],
    ])
    lines += ['', '## Vitals (full feed)', '']
    lines += _table(['Time', 'Source', 'HR /min', 'BP mmHg', 'MAP mmHg', 'Temp °C', 'SpO₂ %', 'RR /min',
                     'Delivered to engine'],
                    [[v['time'], v['source'], v['hr'], f"{v['sbp']}/{v['dbp']}", v['map'], v['temp'], v['spo2'],
                      v['rr'], v['delivered_unattended']] for v in vitals])
    lines += ['', 'MAP = DBP + (SBP − DBP) / 3, shown to 2 decimals; the engine compares the unrounded value.']
    for note in sorted({v['note'] for v in vitals if v['note']}):
        lines += ['', f'Not delivered to the engine: {note}.']
    lines += ['', '## Labs', '']
    if labs:
        lines += _table(['Test', 'Label', 'Ordered', 'Resulted', 'Value', 'Reference', 'Default rule reading'],
                        [[lab['test'], lab['label'], lab['ordered_at'], lab['resulted_at'] or '—',
                          ' '.join(filter(None, [lab['value'], lab['unit']])) or '—', lab['reference'],
                          lab['default_rule_reading']] for lab in labs])
    else:
        lines.append('No lab orders.')
    lines += ['', '## GCS', '']
    lines += _bullets([f"{e['time']} — {e['details']}" for e in events if e['type'] == 'gcs'])
    lines += ['', '## Consults', '']
    lines += _bullets([f"{e['time']} — {e['type']}: {e['details']}" for e in events
                       if e['type'].startswith('consult')])
    lines += ['', '## Other events', '']
    lines += _bullets([f"{e['time']} — {e['type']}: {e['details']}" for e in events
                       if e['type'] in ('arrival', 'physician_action', 'monitor_disconnect')])
    return '\n'.join(lines) + '\n'


def _csv(columns: list[str], rows: list[dict[str, str]]) -> str:
    buffer = io.StringIO()
    writer = csv.DictWriter(buffer, fieldnames=columns, lineterminator='\n')
    writer.writeheader()
    writer.writerows(rows)
    return buffer.getvalue()


def evaluation_rows(config: EngineConfig, scenario_path: Path) -> list[dict[str, str]]:
    wall_time = datetime(2026, 11, 20, tzinfo=timezone.utc)
    session = Session(config, SimulatorSource(scenario_path.parent), lambda: 0.0, lambda: wall_time)
    rows = []
    while True:
        for patient_id, patient in sorted(session.patients.items()):
            if patient.status != 'in_zone':
                continue
            assessment = session.assessments[patient_id]
            rows.append({
                'time': stamp(session.now),
                'patient_id': patient_id,
                'bed': patient.profile.bed,
                'score': str(assessment.score),
                'components': json.dumps([c.model_dump(mode='json') for c in assessment.components],
                                         ensure_ascii=False, separators=(',', ':')),
                'risk_status': session.risk_statuses[patient_id].key,
            })
        next_cycle = session.player.next_cycle_at
        if next_cycle is None:
            return rows
        session.advance_to(next_cycle)


def build_files(config: EngineConfig | None = None, scenario_path: Path = SCENARIO_PATH) -> dict[Path, str]:
    config = config if config is not None else load_config()
    scenario = Scenario.load(scenario_path)
    # VitalValues fills MAP during parsing; only the source feed distinguishes explicit from derived MAP.
    supplied_map: dict[tuple[str, datetime, str], deque[bool]] = defaultdict(deque)
    for event in json.loads(scenario_path.read_text(encoding='utf-8'))['events']:
        if event['type'] == 'vitals':
            key = (event['patient'], _at(scenario.start.date(), event['t']), event['source'])
            supplied_map[key].append(event.get('map') is not None)
    patients = replay(scenario, config)
    vitals = vital_rows(scenario, patients, supplied_map)
    labs = lab_rows(patients, config)
    events = event_rows(scenario)
    patient_table = patient_rows(scenario)

    files: dict[Path, str] = {
        RAW / 'README.md': README,
        FOLDER / 'patients.csv': _csv(PATIENT_COLUMNS, patient_table),
        FOLDER / 'vitals.csv': _csv(VITAL_COLUMNS, vitals),
        FOLDER / 'labs.csv': _csv(LAB_COLUMNS, labs),
        FOLDER / 'events.csv': _csv(EVENT_COLUMNS, events),
        FOLDER / 'expected_alerts.csv': _csv(ALERT_COLUMNS, alert_rows(scenario)),
        FOLDER / 'derived' / 'engine_replay_default_rules.csv': _csv(REPLAY_COLUMNS, evaluation_rows(config, scenario_path)),
    }
    for row in patient_table:
        pid = row['patient_id']
        files[FOLDER / 'patients' / f'{pid}.md'] = patient_page(
            row,
            [v for v in vitals if v['patient_id'] == pid],
            [lab for lab in labs if lab['patient_id'] == pid],
            [e for e in events if e['patient_id'] == pid],
        )
    return files


def _encode(path: Path, text: str) -> bytes:
    bom = '\ufeff' if path.suffix == '.csv' else ''
    return (bom + text).encode('utf-8')


def _matches(path: Path, text: str) -> bool:
    if not path.is_file():
        return False
    if path.suffix == '.csv':
        with path.open('rb') as stream:
            if stream.read(len(BOM_UTF8)) != BOM_UTF8:
                return False
    return path.read_text(encoding='utf-8-sig') == text


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--check', action='store_true', help='fail unless every committed file matches the export')
    args = parser.parse_args(argv)

    files = build_files()
    if args.check:
        problems = [f'{path.relative_to(ROOT).as_posix()} differs from the export; regenerate and review'
                    for path, text in files.items() if not _matches(path, text)]
        if RAW.is_dir():
            problems += [f'{path.relative_to(ROOT).as_posix()} is not produced by the export; remove it'
                         for path in sorted(RAW.rglob('*')) if path.is_file() and path not in files]
        for problem in problems:
            print(problem, file=sys.stderr)
        if problems:
            return 1
        print(f'{len(files)} raw_data files match the scenario and default rules.')
        return 0
    for path, text in files.items():
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(_encode(path, text))
    print(f'wrote {len(files)} files under {RAW.relative_to(ROOT).as_posix()}/')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
