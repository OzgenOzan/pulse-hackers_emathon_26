from datetime import datetime

from app.domain.models import Component, LabOrder, PatientSnapshot, SuppressedLab
from app.engine.config import CriticalBounds, EngineConfig
from app.engine.display import format_cutoff


def ordered_labs(patient: PatientSnapshot, now: datetime) -> list[LabOrder]:
    return [lab for lab in patient.labs if lab.ordered_at <= now]


def critical_rule(bounds: CriticalBounds, value: float, unit: str, test: str) -> str | None:
    if bounds.critical_low is not None and value <= bounds.critical_low:
        op, bound = '≤', bounds.critical_low
    elif bounds.critical_high is not None and value >= bounds.critical_high:
        op, bound = '≥', bounds.critical_high
    else:
        return None
    number = format_cutoff(bound, 2 if test == 'ph' else 0)
    return f'{op} {number} {unit}'.rstrip()


def score_labs(patient: PatientSnapshot, orders: list[LabOrder], now: datetime, config: EngineConfig
               ) -> tuple[list[Component], list[SuppressedLab]]:
    latest: dict[str, LabOrder] = {}
    for lab in orders:
        stamp = lab.resulted_at
        previous = latest.get(lab.test)
        if stamp is not None and stamp <= now and (previous is None or stamp >= previous.resulted_at):
            latest[lab.test] = lab
    related = {
        lab for group in config.icd_lab_relevance.values()
        if any(diagnosis.code.startswith(tuple(group.icd_prefixes)) for diagnosis in patient.profile.working_dx)
        for lab in group.labs
    }
    components: list[Component] = []
    suppressed: list[SuppressedLab] = []
    for test, lab in latest.items():
        rule = config.labs.get(test)
        value, stamp = lab.value, lab.resulted_at
        if rule is None or value is None or stamp is None:
            continue
        unit = lab.unit if lab.unit is not None else ''
        if unit != rule.unit:
            key = 'unit_mismatch'
            reason = f'Result unit does not match the configured unit ({rule.unit or "unitless"}); not scored.'
        else:
            critical = critical_rule(rule, value, unit, test)
            panic_rule = config.universal_panic.get(test)
            panic = critical_rule(panic_rule, value, unit, test) if panic_rule is not None else None
            if panic is not None or (critical is not None and test in related):
                clause = f'Universal panic cutoff: {panic}' if panic is not None else f'Diagnosis-related critical cutoff: {critical}'
                components.append(Component(key=f'lab_{test}', label=rule.label, value=value, unit=unit,
                                            rule=clause, points=config.red.critical_lab_points, observed_at=stamp))
                continue
            if (rule.ref_low is None or value >= rule.ref_low) and (rule.ref_high is None or value <= rule.ref_high):
                continue
            if critical is not None:
                key = 'unrelated_diagnosis'
                reason = 'Critical value, but this lab is not mapped to the working diagnosis.'
            else:
                key = 'below_critical_cutoff'
                reason = 'Outside the reference range, but the configured critical cutoff was not reached.'
        suppressed.append(SuppressedLab(test=test, value=value, unit=unit, reason=reason, reason_key=key, observed_at=stamp))
    return components, suppressed
