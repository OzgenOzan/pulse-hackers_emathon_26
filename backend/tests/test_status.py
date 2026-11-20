from datetime import datetime, timedelta
from importlib import import_module

import pytest
from pydantic import ValidationError

from app.domain.models import Alert, AlertCandidate, EngineResult, PatientProfile, PatientSnapshot
from app.engine.config import EngineConfig, load_config


NOW = datetime(2026, 11, 20, 3, 30)


def subject():
    return PatientSnapshot(profile=PatientProfile(id='Z1', bed='S-01', label='Z.Z.', age=42, sex='F',
                                                  arrived_at=NOW - timedelta(hours=1), monitored=True, working_dx=[]))


def assessment(score=0, *, gap=False, discharge=False, map_age=30):
    candidates = []
    if gap:
        candidates.append(AlertCandidate(level='YELLOW', target_role='nurse', title_key='yellow_monitor_gap',
                                         params={'monitor_minutes': 15}))
    if discharge:
        candidates.append(AlertCandidate(level='GREEN', target_role='physician', title_key='green_results_ready',
                                         params={'minutes': 35}))
    return EngineResult(score=score, candidates=candidates, current_vital_evidence={
        'hr': (94, NOW), **({'map': (79, NOW - timedelta(minutes=map_age))} if map_age is not None else {}),
    })


@pytest.mark.parametrize('score,gap,discharge,map_age,expected', [
    (0, False, False, 30, 'stabil'),
    (0, False, True, 30, 'stabil'),
    (0, True, False, 30, 'siniflandirilmamis'),
    (1, False, False, 30, 'yakin_takip'),
    (2, True, False, 30, 'yakin_takip'),
    (2, False, False, 31, 'siniflandirilmamis'),
    (2, False, False, None, 'siniflandirilmamis'),
    (3, False, False, None, 'kritik'),
    (3, True, False, 31, 'kritik'),
])
def test_classifies_risk_and_independent_data_issues(score, gap, discharge, map_age, expected):
    classify = import_module('app.engine.status').classify
    status = classify(subject(), assessment(score, gap=gap, discharge=discharge, map_age=map_age), [], NOW, load_config())
    assert status.key == expected
    if gap:
        assert any(item.key == 'monitor_gap' and item.params['minutes'] == 15 for item in status.data_issues)
    if map_age is None or map_age > 30:
        assert any(item.key == 'insufficient_data' for item in status.data_issues)


def test_no_assessment_is_unclassified_and_latched_critical_wins():
    classify = import_module('app.engine.status').classify
    config = load_config()
    waiting = classify(subject(), None, [], NOW, config)
    assert waiting.key == 'siniflandirilmamis'
    assert waiting.reasons[0].key == 'awaiting_evaluation'
    alarm = Alert(id='A1', patient_id='Z1', score=2, level='RED', target_role='physician', title_key='red_deterioration',
                  criteria_met=False, created_at=NOW, updated_at=NOW)
    assert classify(subject(), assessment(2), [alarm], NOW, config).key == 'kritik'
    alarm.status = 'acknowledged'
    assert classify(subject(), assessment(2), [alarm], NOW, config).key == 'yakin_takip'
    assert classify(subject(), assessment(3), [alarm], NOW, config).key == 'kritik'


def test_worsened_expires_at_the_next_scheduled_evaluation():
    status = import_module('app.engine.status')
    config = load_config()
    patient = subject()
    stable = status.classify(patient, assessment(), [], NOW, config)
    watch = status.classify(patient, assessment(2, map_age=0), [], NOW + timedelta(minutes=1), config)
    first = status.update_status(watch, stable, scheduled=True)
    assert (first.worsened, first.since) == (True, NOW + timedelta(minutes=1))
    assert status.update_status(watch, first, scheduled=False).worsened
    expired = status.update_status(watch, first, scheduled=True)
    assert (expired.worsened, expired.since) == (False, first.since)
    unclassified = status.classify(patient, assessment(2, map_age=None), [], NOW, config)
    assert not status.update_status(unclassified, stable, scheduled=True).worsened
    critical = status.classify(patient, assessment(3), [], NOW, config)
    assert status.update_status(critical, watch, scheduled=True).worsened
    assert not status.update_status(watch, critical, scheduled=True).worsened


def test_status_config_rejects_invalid_mapping_and_fractional_gcs_bounds():
    config = load_config().model_dump()
    assert config['status'] == {'watch_min_score': 1, 'required_fresh_vitals': ['hr', 'map']}
    assert config['display']['gcs_fresh_minutes'] == 120
    assert config['manual_entry']['limits']['gcs'] == {'min': 3, 'max': 15}
    bad = {**config, 'status': {**config['status'], 'watch_min_score': 3}}
    with pytest.raises(ValidationError, match='watch_min_score'):
        EngineConfig.model_validate(bad)
    bad = {**config, 'status': {**config['status'], 'required_fresh_vitals': ['hr', 'hr']}}
    with pytest.raises(ValidationError, match='required_fresh_vitals'):
        EngineConfig.model_validate(bad)
    config['manual_entry']['limits']['gcs']['min'] = 3.2
    with pytest.raises(ValidationError, match='GCS'):
        EngineConfig.model_validate(config)
