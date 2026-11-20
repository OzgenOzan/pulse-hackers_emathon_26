SYNTHETIC: no real patients; all names and protocol numbers are invented.

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

Six patients (Y04, Y07, Y09, Y10, Y11, Y12) have background vitals generated by `scripts/generate_noise.py` with seed
20261120. Their rows are marked `vitals seeded, seed 20261120` in `patients.csv`; the generated samples are committed in the
scenario file. The other six patients are scripted.

## Y03: delivery rule

Y03's monitor disconnects at 03:00 (`monitor_disconnect`; it resumes only on nurse acknowledgement). From the disconnect onward, each Y03 monitor sample that the replay does not deliver stays in `vitals.csv`, marked `delivered_unattended = no` with the note "monitor disconnected 03:00; samples resume from the first cycle after the nurse confirms reconnection". The export replays the real player with no user actions, so no acknowledgement is sent and the disconnect stays in effect.

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

On Windows, run `.venv\Scripts\python.exe scripts/export_raw_data.py` from the repository root.

## Opening the CSV files in Excel

The CSV files are UTF-8 with a byte-order mark, so Excel keeps ş, ğ and İ. In a Turkish-locale Excel, use
Veri → Metinden/CSV'den with a comma delimiter.

# Türkçe özet

SYNTHETIC: no real patients; all names and protocol numbers are invented.

- Açılacak dosyalar: `night_shift_0245/patients.csv` (hasta bilgileri), `vitals.csv` (tüm vital bulgular), `labs.csv`
  (tetkikler), `events.csv` (zaman çizelgesi), `expected_alerts.csv` (beklenen ilk uyarılar) ve
  `night_shift_0245/patients/Y01.md` ile `Y12.md` (hasta sayfaları).
- Zaman: 20 Kasım 2026, simüle yerel saat, `YYYY-MM-DD HH:MM`. Vardiya 02:45 ile 04:30 arasındadır; 01:55'ten başlayan
  ön geçmiş vardır.
- MAP = DBP + (SBP − DBP) / 3.
- Y04, Y07, Y09, Y10, Y11, Y12 hastalarının arka plan vitalleri `scripts/generate_noise.py` ile,
  tohum 20261120 kullanılarak üretilir.
- Y03: monitör 03:00'te bağlantısını kaybeder. Sonraki monitör örnekleri `vitals.csv` içinde kalır, ancak
  `delivered_unattended = no` ile işaretlidir; motora ulaşmazlar.
- Yeniden üretme: `python scripts/export_raw_data.py`. Denetim: `python scripts/export_raw_data.py --check`.
- Excel: Türkçe yerel ayarlı Excel'de Veri → Metinden/CSV'den seçeneğini kullanın ve ayırıcı olarak virgülü seçin.
- Bilinen iki sınırlama: (1) Y08'in kronik düşük MAP'i yine kritik alarm üretir. (2) Y05'in laktat değeri
  (4,2 mmol/L) bastırılır; konvülsiyon laktat ile eşleştirilmemiştir.
