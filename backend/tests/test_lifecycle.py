from datetime import datetime, timedelta

from app.domain.models import AlertCandidate, EngineResult
from app.engine.config import load_config

NOW = datetime(2026, 11, 20, 3, 30)
CONFIG = load_config()


def candidate(level, *, minutes=0, escalated=False):
    return AlertCandidate(level=level, target_role='nurse' if level == 'YELLOW' else 'physician',
                          title_key=level, params={'minutes': minutes}, escalated=escalated)


def assess(alerts, score=0, *candidates, minutes=0):
    from app.engine.lifecycle import reconcile

    result = EngineResult(score=score, candidates=list(candidates))
    return reconcile(alerts, 'Y01', result, NOW + timedelta(minutes=minutes), CONFIG, lambda: f'AL-{len(alerts) + 1}')


def test_red_supersedes_green_and_preserves_yellow():
    alerts = []
    assess(alerts, 0, candidate('GREEN'), candidate('YELLOW'))
    changes = assess(alerts, 3, candidate('RED'), candidate('YELLOW'), minutes=15)
    assert {(c.event, c.alert.level) for c in changes} == {
        ('created', 'RED'), ('superseded', 'GREEN'), ('updated', 'YELLOW'),
    }
    assert [(a.level, a.status) for a in alerts] == [('GREEN', 'superseded'), ('YELLOW', 'active'), ('RED', 'active')]


def test_active_red_updates_in_place_and_latches_when_criteria_no_longer_met():
    alerts = []
    created = assess(alerts, 3, candidate('RED'))[0].alert
    assert assess(alerts, 3, candidate('RED'), minutes=15) == []
    updated = assess(alerts, 6, candidate('RED'), minutes=30)[0]
    assert (updated.event, updated.alert.id, updated.alert.score) == ('updated', created.id, 6)
    recovered = assess(alerts, 0, candidate('GREEN'), minutes=45)
    assert [(c.event, c.alert.id, c.alert.criteria_met) for c in recovered] == [('updated', created.id, False)]
    assert len(alerts) == 1 and alerts[0].status == 'active'


def test_cooldown_and_score_based_realert():
    alerts = []
    first = assess(alerts, 3, candidate('RED'))[0].alert
    first.status, first.closed_at = 'acknowledged', NOW
    assert assess(alerts, 4, candidate('RED'), minutes=29) == []
    second = assess(alerts, 5, candidate('RED'), minutes=29)[0]
    assert (second.event, second.alert.escalated) == ('escalated', True)
    assert first.id != second.alert.id
    assert len(alerts) == 2


def test_cooldown_expires_at_exact_boundary():
    alerts = []
    first = assess(alerts, 3, candidate('RED'))[0].alert
    first.status, first.closed_at = 'acknowledged', NOW
    assert assess(alerts, 3, candidate('RED'), minutes=29) == []
    second = assess(alerts, 3, candidate('RED'), minutes=30)[0]
    assert second.event == 'created' and not second.alert.escalated and second.alert.id != first.id


def test_yellow_escalates_live_and_resolves_without_repeating():
    alerts = []
    first = assess(alerts, 0, candidate('YELLOW', minutes=15))[0].alert
    changes = assess(alerts, 0, candidate('YELLOW', minutes=60, escalated=True), minutes=45)
    assert [(c.event, c.alert.id) for c in changes] == [('escalated', first.id)]
    assert assess(alerts, 0, minutes=60)[0].event == 'auto_resolved'
    assert assess(alerts, 0, minutes=75) == []


def test_priority_uses_alert_severity_then_score_or_gap():
    from app.engine.lifecycle import priority_key

    alerts = []
    assess(alerts, 0, candidate('GREEN', minutes=35), candidate('YELLOW', minutes=60, escalated=True))
    assess(alerts, 3, candidate('RED'), candidate('YELLOW', minutes=60, escalated=True))
    assert [a.level for a in sorted(alerts, key=priority_key)] == ['RED', 'YELLOW', 'GREEN']
