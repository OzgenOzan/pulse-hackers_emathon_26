from datetime import datetime, timedelta

from app.domain.models import AlertCandidate, Component, LabOrder, PatientSnapshot
from app.engine.config import EngineConfig


def green_candidate(patient: PatientSnapshot, orders: list[LabOrder], now: datetime, score: int,
                    config: EngineConfig) -> AlertCandidate | None:
    if score >= config.red.threshold or patient.active_red or not orders:
        return None
    result_times = [lab.resulted_at for lab in orders if lab.resulted_at is not None and lab.resulted_at <= now]
    if len(result_times) != len(orders):
        return None
    last_result = max(result_times)
    idle_gap = now - last_result
    limit = config.green.idle_after_results_minutes
    if idle_gap < timedelta(minutes=limit):
        return None
    latest_order = max(lab.ordered_at for lab in orders)
    action = max((a for a in reversed(patient.actions) if last_result <= a.time <= now),
                 key=lambda a: a.time, default=None)
    if latest_order >= last_result and (action is None or latest_order > action.time):
        return None
    if action and (action.type != 'wait_justified' or now - action.time < timedelta(minutes=config.alerting.ack_cooldown_minutes)):
        return None
    minutes = int(idle_gap.total_seconds() // 60)
    evidence = Component(key='results_idle', label='Time since all ordered labs resulted', value=minutes,
                         unit='min', rule=f'≥ {limit} min without a new physician action', points=0, observed_at=last_result)
    return AlertCandidate(level='GREEN', target_role='physician', title_key='green_results_ready',
                          params={'minutes': minutes}, components=[evidence],
                          recommended_actions=['discharge_decided', 'prescription_written', 'wait_justified'])
