"""Deterministic alert reconciliation; never performs clinical actions or I/O."""

from collections.abc import Callable
from datetime import datetime, timedelta

from app.domain.models import Alert, AlertCandidate, AlertChange, EngineResult
from app.engine.config import EngineConfig


def reconcile(alerts: list[Alert], patient_id: str, result: EngineResult, now: datetime,
              config: EngineConfig, next_id: Callable[[], str]) -> list[AlertChange]:
    """Update one patient's alert history in place and return its transitions."""
    history = [alert for alert in alerts if alert.patient_id == patient_id]
    active = {alert.level: alert for alert in history if alert.status == 'active'}
    candidates = {candidate.level: candidate for candidate in result.candidates}
    red_conflict = 'RED' in active or 'RED' in candidates
    changes: list[AlertChange] = []

    for level, alert in active.items():
        candidate = candidates.pop(level, None)
        if level == 'GREEN' and red_conflict:
            close(alert, now, 'superseded', 'superseded by RED')
            changes.append(AlertChange(event='superseded', alert=alert))
        elif candidate is not None:
            change = update(alert, candidate, result.score, now)
            if change is not None:
                changes.append(change)
        elif level == 'RED':
            if alert.criteria_met or alert.score != result.score:
                alert.criteria_met = False
                alert.score = result.score
                alert.updated_at = now
                changes.append(AlertChange(event='updated', alert=alert))
        else:
            close(alert, now, 'auto_resolved', None)
            changes.append(AlertChange(event='auto_resolved', alert=alert))

    for level, candidate in candidates.items():
        if level == 'GREEN' and red_conflict:
            continue
        last_ack = next((a for a in reversed(history) if a.level == level and a.status == 'acknowledged'), None)
        escalated_recurrence = False
        if last_ack is not None and last_ack.closed_at is not None:
            if now - last_ack.closed_at < timedelta(minutes=config.alerting.ack_cooldown_minutes):
                escalated_recurrence = result.score - last_ack.score >= config.alerting.realert_score_increase
                if not escalated_recurrence:
                    continue
        properties = candidate.model_dump()
        properties['escalated'] = candidate.escalated or escalated_recurrence
        alert = Alert(**properties, id=next_id(), patient_id=patient_id, score=result.score,
                      created_at=now, updated_at=now)
        alerts.append(alert)
        changes.append(AlertChange(event='escalated' if escalated_recurrence else 'created', alert=alert))

    return changes


def close(alert: Alert, now: datetime, status, reason: str | None) -> None:
    alert.status = status
    alert.closed_at = now
    alert.updated_at = now
    alert.reason = reason


def update(alert: Alert, candidate: AlertCandidate, score: int, now: datetime) -> AlertChange | None:
    escalate = candidate.escalated and not alert.escalated
    if (not escalate and alert.criteria_met and alert.score == score
            and alert.title_key == candidate.title_key and alert.params == candidate.params
            and alert.components == candidate.components and alert.recommended_actions == candidate.recommended_actions):
        return None
    alert.criteria_met = True
    alert.escalated = alert.escalated or candidate.escalated
    alert.score = score
    alert.title_key = candidate.title_key
    alert.params = candidate.params
    alert.components = candidate.components
    alert.recommended_actions = candidate.recommended_actions
    alert.updated_at = now
    return AlertChange(event='escalated' if escalate else 'updated', alert=alert)


def priority_key(alert: Alert) -> tuple[int, bool, float, datetime, str]:
    if alert.level == 'RED':
        return (0, alert.status != 'active', -alert.score, alert.created_at, alert.id)
    if alert.level == 'YELLOW':
        gap = max(alert.params.get(key, 0) for key in ('minutes', 'monitor_minutes', 'vitals_minutes'))
        return (1, not alert.escalated, -gap, alert.created_at, alert.id)
    return (2, False, -alert.params.get('minutes', 0), alert.created_at, alert.id)
