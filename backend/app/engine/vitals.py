from datetime import datetime, timedelta
from operator import ge, gt, le, lt

from app.domain.models import Component, PatientSnapshot, VitalReading
from app.engine.config import RedRules

OPERATORS = {'<': lt, '<=': le, '>': gt, '>=': ge}
LABELS = {
    'hr': ('Heart rate', 'bpm'), 'sbp': ('Systolic BP', 'mmHg'), 'dbp': ('Diastolic BP', 'mmHg'),
    'map': ('MAP', 'mmHg'), 'temp': ('Temperature', '°C'), 'spo2': ('SpO₂', '%'), 'rr': ('Respiratory rate', '/min'),
}


def observed_vitals(patient: PatientSnapshot, now: datetime) -> list[VitalReading]:
    return [r for r in patient.vitals if patient.profile.arrived_at <= r.time <= now]


def latest_vital(readings: list[VitalReading]) -> VitalReading | None:
    return max(reversed(readings), key=lambda reading: reading.time, default=None)


def score_vitals(readings: list[VitalReading], now: datetime, rules: RedRules) -> list[Component]:
    latest = latest_vital(readings)
    if latest is None or now - latest.time > timedelta(minutes=rules.vital_max_age_minutes):
        return []
    components: list[Component] = []
    for rule in rules.vital_rules:
        value = getattr(latest, rule.param)
        if rule.enabled and value is not None and OPERATORS[rule.op](value, rule.value):
            label, unit = LABELS[rule.param]
            components.append(Component(key=rule.key, label=label, value=value, unit=unit,
                                        rule=f'{rule.op} {rule.value:g} {unit}', points=rule.points, observed_at=latest.time))
    baseline = min(readings, key=lambda r: r.time)
    for rule in rules.trend_rules:
        first, current = getattr(baseline, rule.param), getattr(latest, rule.param)
        if first is None or current is None:
            continue
        drop = rule.direction == 'down'
        change = first - current if drop else current - first
        if change >= rule.delta:
            label, unit = LABELS[rule.param]
            components.append(Component(key=rule.key, label=f"{label} {'drop' if drop else 'rise'} from baseline",
                                        value=change, unit=unit,
                                        rule=f'≥ {rule.delta:g} {unit} from baseline; {label} now {current:g} {unit}',
                                        points=rule.points, observed_at=latest.time))
    return components
