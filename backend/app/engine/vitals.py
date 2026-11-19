from datetime import datetime, timedelta
from operator import ge, gt, le, lt

from app.domain.models import Component, PatientSnapshot, VitalReading
from app.engine.config import RedRules

OPERATORS = {'<': lt, '<=': le, '>': gt, '>=': ge}
DISPLAY_OPERATORS = {'<=': '≤', '>=': '≥'}
LABELS = {
    'hr': ('Heart rate', 'bpm'), 'sbp': ('Systolic BP', 'mmHg'), 'dbp': ('Diastolic BP', 'mmHg'),
    'map': ('MAP', 'mmHg'), 'temp': ('Temperature', '°C'), 'spo2': ('SpO₂', '%'), 'rr': ('Respiratory rate', '/min'),
}


def observed_vitals(patient: PatientSnapshot, now: datetime) -> list[VitalReading]:
    return [r for r in patient.vitals if patient.profile.arrived_at <= r.time <= now]


def latest_vital(readings: list[VitalReading]) -> VitalReading | None:
    return max(reversed(readings), key=lambda reading: reading.time, default=None)


def vital_evidence(
    readings: list[VitalReading], now: datetime, rules: RedRules,
) -> tuple[dict[str, tuple[float, datetime]], dict[str, tuple[float, datetime]]]:
    fresh: dict[str, tuple[float, datetime]] = {}
    baseline: dict[str, tuple[float, datetime]] = {}
    cutoff = now - timedelta(minutes=rules.vital_max_age_minutes)
    for reading in readings:
        is_fresh = cutoff <= reading.time <= now
        for param in LABELS:
            value = getattr(reading, param)
            if value is None:
                continue
            if param not in baseline or reading.time < baseline[param][1]:
                baseline[param] = (value, reading.time)
            if is_fresh and (param not in fresh or reading.time >= fresh[param][1]):
                fresh[param] = (value, reading.time)
    return fresh, baseline


def score_vitals(fresh: dict[str, tuple[float, datetime]], baseline: dict[str, tuple[float, datetime]],
                 rules: RedRules) -> list[Component]:
    components: list[Component] = []
    for rule in rules.vital_rules:
        if not rule.enabled or rule.param not in fresh:
            continue
        value, observed_at = fresh[rule.param]
        if OPERATORS[rule.op](value, rule.value):
            label, unit = LABELS[rule.param]
            digits = 1 if rule.param == 'temp' else 0
            op = DISPLAY_OPERATORS.get(rule.op, rule.op)
            components.append(Component(key=rule.key, label=label, value=value, unit=unit,
                                        rule=f'{op} {rule.value:.{digits}f} {unit}', points=rule.points, observed_at=observed_at))
    for rule in rules.trend_rules:
        if rule.param not in fresh:
            continue
        first, _ = baseline[rule.param]
        current, observed_at = fresh[rule.param]
        drop = rule.direction == 'down'
        change = first - current if drop else current - first
        if change >= rule.delta:
            label, unit = LABELS[rule.param]
            digits = 1 if rule.param == 'temp' else 0
            components.append(Component(key=rule.key, label=f"{label} {'drop' if drop else 'rise'} from baseline",
                                        value=change, unit=unit,
                                        rule=f'≥ {rule.delta:.{digits}f} {unit} from baseline; '
                                             f'{label} now {current:.{digits}f} {unit}',
                                        points=rule.points, observed_at=observed_at))
    return components
