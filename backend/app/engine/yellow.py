from datetime import datetime, timedelta

from app.domain.models import AlertCandidate, Component, PatientSnapshot, VitalReading
from app.engine.config import YellowRules


def yellow_candidate(patient: PatientSnapshot, readings: list[VitalReading], now: datetime,
                     rules: YellowRules) -> AlertCandidate | None:
    arrival = patient.profile.arrived_at
    last_vitals = max((r.time for r in readings), default=arrival)
    last_monitor = max((r.time for r in readings if r.source == 'monitor'), default=arrival)
    monitor_gap = now - last_monitor
    vitals_gap = now - last_vitals
    monitor_due = patient.profile.monitored and monitor_gap >= timedelta(minutes=rules.monitor_gap_minutes)
    vitals_due = vitals_gap >= timedelta(minutes=rules.vitals_overdue_minutes)
    if not (monitor_due or vitals_due):
        return None
    escalated = vitals_due and vitals_gap >= timedelta(minutes=rules.vitals_overdue_escalate_minutes)
    components: list[Component] = []
    params: dict[str, int] = {}
    if monitor_due:
        params['monitor_minutes'] = int(monitor_gap.total_seconds() // 60)
        components.append(Component(key='monitor_gap', label='Time since monitor reading', value=params['monitor_minutes'],
                                    unit='min', rule=f'≥ {rules.monitor_gap_minutes} min', points=0, observed_at=last_monitor))
    if vitals_due:
        params['vitals_minutes'] = int(vitals_gap.total_seconds() // 60)
        limit = rules.vitals_overdue_escalate_minutes if escalated else rules.vitals_overdue_minutes
        components.append(Component(key='vitals_overdue', label='Time since any vital reading', value=params['vitals_minutes'],
                                    unit='min', rule=f'≥ {limit} min', points=0, observed_at=last_vitals))
    params['minutes'] = max(params.values())
    title = 'yellow_monitor_and_vitals' if monitor_due and vitals_due else (
        'yellow_monitor_gap' if monitor_due else 'yellow_vitals_overdue'
    )
    actions = ['monitor_reconnected'] if monitor_due else []
    actions.extend(('vitals_entered', 'not_at_bed'))
    return AlertCandidate(level='YELLOW', target_role='nurse', title_key=title, params=params,
                          recommended_actions=actions, components=components, escalated=escalated)
