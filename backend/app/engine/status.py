"""Project the latest assessment and latched alarms into GUI status, without scoring."""

from collections.abc import Iterable
from datetime import datetime, timedelta

from app.domain.models import Alert, EngineResult, PatientSnapshot, RiskKey, RiskReason, RiskStatus
from app.engine.config import EngineConfig

RISK_RANK: dict[RiskKey, int] = {'stabil': 0, 'siniflandirilmamis': 1, 'yakin_takip': 2, 'kritik': 3}


def classify(snapshot: PatientSnapshot, result: EngineResult | None, alerts_for_patient: Iterable[Alert],
             now: datetime, config: EngineConfig) -> RiskStatus:
    latched = next((a for a in alerts_for_patient if a.patient_id == snapshot.profile.id
                    and a.level == 'RED' and a.status == 'active'), None)
    issues: list[RiskReason] = []
    fresh_until = None
    if result is None:
        issues.append(RiskReason(key='awaiting_evaluation'))
        fresh = False
    else:
        max_age = timedelta(minutes=config.red.vital_max_age_minutes)
        required = [result.current_vital_evidence.get(param) for param in config.status.required_fresh_vitals]
        observed = [item[1] for item in required if item is not None]
        if len(observed) == len(required) and max(observed) <= now:
            fresh_until = min(observed) + max_age
        fresh = fresh_until is not None and now <= fresh_until
        for candidate in result.candidates:
            if candidate.level == 'YELLOW':
                for parameter, key in (('monitor_minutes', 'monitor_gap'), ('vitals_minutes', 'vitals_overdue')):
                    if parameter in candidate.params:
                        issues.append(RiskReason(key=key, params={'minutes': candidate.params[parameter]}))
        if not fresh:
            issues.append(RiskReason(key='insufficient_data'))

    score = result.score if result is not None else 0
    if latched is not None or score >= config.red.threshold:
        key: RiskKey = 'kritik'
    elif fresh and score >= config.status.watch_min_score:
        key = 'yakin_takip'
    elif issues or score > 0:
        key = 'siniflandirilmamis'
    else:
        key = 'stabil'

    if key in ('kritik', 'yakin_takip'):
        evidence = latched.components if latched is not None else result.components if result is not None else []
        reasons = [RiskReason(key=c.key, params={'value': c.value, 'unit': c.unit})
                   for c in sorted(evidence, key=lambda component: -component.points)]
        if not reasons:
            reasons = [RiskReason(key='score_threshold', params={'score': score})]
    elif key == 'siniflandirilmamis':
        reasons = issues or [RiskReason(key='below_watch_threshold', params={'score': score})]
    else:
        reasons = [RiskReason(key='no_risk_findings')]
    return RiskStatus(key=key, reasons=reasons, data_issues=issues, since=now, required_fresh_until=fresh_until)


def update_status(current: RiskStatus, previous: RiskStatus | None, *, scheduled: bool) -> RiskStatus:
    if previous is None:
        return current
    if current.key == previous.key:
        return current.model_copy(update={'since': previous.since, 'worsened': previous.worsened and not scheduled})
    deadline = previous.required_fresh_until
    if (current.key == 'siniflandirilmamis' and previous.key in ('stabil', 'yakin_takip')
            and deadline is not None and deadline < current.since
            and any(issue.key == 'insufficient_data' for issue in current.data_issues)):
        return current.model_copy(update={'since': deadline})
    worsened = current.key in ('yakin_takip', 'kritik') and RISK_RANK[current.key] > RISK_RANK[previous.key]
    return current.model_copy(update={'worsened': worsened})
