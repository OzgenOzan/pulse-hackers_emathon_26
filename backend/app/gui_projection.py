"""View-only summaries; nothing from here enters the clinical evaluator."""

from datetime import datetime

from app.domain.models import Component, DisplayMeasurement, VitalFlag, VitalReading, VitalValues
from app.engine.config import RedRules
from app.engine.display import format_rule_value

UNSCORED_LAB_LABELS = {'cbc': 'Tam kan sayımı', 'creatinine': 'Kreatinin', 'urinalysis': 'İdrar tahlili'}


def latest_measurements(readings: list[VitalReading], cutoff: datetime) -> dict[str, DisplayMeasurement]:
    latest: dict[str, DisplayMeasurement] = {}
    for reading in reversed(readings):
        for param in VitalValues.model_fields:
            value = getattr(reading, param)
            if value is not None and (param not in latest or reading.time > latest[param].observed_at):
                latest[param] = DisplayMeasurement(value=value, observed_at=reading.time, stale=reading.time < cutoff,
                                                    source=reading.source)
    return latest


def vital_flags(components: list[Component], rules: RedRules) -> dict[str, VitalFlag]:
    flags: dict[str, VitalFlag] = {}
    for component in sorted(components, key=lambda c: -c.points):
        trend = next((r for r in rules.trend_rules if r.key == component.key), None)
        if trend is not None:
            symbol = '−' if trend.direction == 'down' else '+'
            delta = format_rule_value(component.value, int(trend.param == 'temp')).replace('.', ',')
            note = f'bazale göre {symbol}{delta}'
            param = trend.param
        else:
            rule = next((r for r in rules.vital_rules if r.key == component.key), None)
            if rule is None:
                continue
            param = rule.param
            if rule.op in ('>', '>='):
                note = 'Yüksek'
            else:
                op = '≤' if rule.op == '<=' else '<'
                cutoff = format_rule_value(rule.value, int(param == 'temp')).replace('.', ',')
                note = f'{op} {cutoff}'
        level = 'kritik' if component.points >= 3 else 'yakin_takip'
        if param not in flags:
            flags[param] = VitalFlag(level=level, note=note)
        elif note not in flags[param].note.split(' · '):
            flags[param].note += f' · {note}'
    return flags
