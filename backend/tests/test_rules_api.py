import copy
import json
import shutil
from datetime import datetime, timedelta

import pytest
from test_scenario_night_shift import client_for_night_shift, state, step

from app.engine.config import CriticalBounds, load_config
from app.engine.labs import critical_rule
from app.adapters.simulator import SCENARIO_DIR, SimulatorSource


def put_rules(client, config, role='physician'):
    return client.put('/api/config', json={'role': role, 'config': config})


def put_non_finite(client, config):
    body = json.dumps({'role': 'physician', 'config': config})
    return client.put('/api/config', content=body, headers={'Content-Type': 'application/json'})


def _row(rows, key):
    return next(row for row in rows if row['key'] == key)


def _get(config, path):
    node = config
    for part in path.split('.'):
        node = _row(node, part) if isinstance(node, list) else node[part]
    return node


def edit(config, path, value):
    edited = copy.deepcopy(config)
    *parents, leaf = path.split('.')
    node = edited
    for part in parents:
        node = _row(node, part) if isinstance(node, list) else node[part]
    node[leaf] = value
    return edited


def run_shift(client, steps=8):
    for _ in range(steps):
        step(client)
    return [(e['sim_time'][11:16], e['patient_id'], e['event']) for e in client.get('/api/audit').json()]


def test_defaults_match_config_yaml_at_start():
    with client_for_night_shift() as client:
        state(client)
        defaults = client.get('/api/config/defaults').json()
        assert defaults == load_config().model_dump(mode='json')
        assert client.get('/api/config').json() == defaults
        assert state(client)['sim']['rules_custom'] is False


def test_physician_applies_threshold_and_restarts_shift_at_0245():
    with client_for_night_shift() as client:
        before = state(client)['sim']
        config = client.get('/api/config').json()
        assert put_rules(client, edit(config, 'red.threshold', 2)).status_code == 204
        sim = state(client)['sim']
        assert sim['replay_id'] != before['replay_id']
        assert sim['time'][11:16] == '02:45'
        assert sim['rules_custom'] is True
        step(client)
        step(client)
        red = [a for a in state(client)['alerts'] if a['patient_id'] == 'Y01' and a['level'] == 'RED']
        assert [(a['status'], a['score'], a['created_at'][11:16]) for a in red] == [('active', 2, '03:15')]


def test_threshold_below_watch_score_is_rules_invalid_and_changes_nothing():
    with client_for_night_shift() as client:
        before = state(client)['sim']
        config = client.get('/api/config').json()
        response = put_rules(client, edit(config, 'red.threshold', 1))
        assert response.status_code == 422
        assert response.json()['detail'] == 'rules_invalid'
        assert [e['loc'] for e in response.json()['errors']] == ['status.watch_min_score']
        assert client.get('/api/config').json() == config
        assert client.get('/api/config/history').json() == []
        assert state(client)['sim']['replay_id'] == before['replay_id']


@pytest.mark.parametrize(('path', 'value'), [
    ('cycle_minutes', 10),
    ('alerting.red_blocks_navigation', False),
    ('red.vital_rules.map_low.param', 'hr'),
])
def test_read_only_fields_are_rule_not_editable(path, value):
    with client_for_night_shift() as client:
        before = state(client)['sim']
        config = client.get('/api/config').json()
        response = put_rules(client, edit(config, path, value))
        assert response.status_code == 422
        assert response.json() == {'detail': 'rule_not_editable', 'paths': [path]}
        assert client.get('/api/config').json() == config
        assert state(client)['sim']['replay_id'] == before['replay_id']


def test_nurse_cannot_apply_rules():
    with client_for_night_shift() as client:
        state(client, 'nurse')
        config = client.get('/api/config').json()
        response = put_rules(client, edit(config, 'red.threshold', 2), role='nurse')
        assert response.status_code == 403
        assert response.json() == {'detail': 'physician_role_required'}
        assert client.get('/api/config').json() == config


def test_apply_without_replay_id_is_428():
    with client_for_night_shift() as client:
        config = client.get('/api/config').json()
        response = put_rules(client, edit(config, 'red.threshold', 2))
        assert response.status_code == 428
        assert response.json() == {'detail': 'replay_id_required'}


def test_apply_with_stale_replay_id_is_409():
    with client_for_night_shift() as client:
        state(client)
        config = client.get('/api/config').json()
        assert client.post('/api/sim/reset', json={}).status_code == 204
        response = put_rules(client, edit(config, 'red.threshold', 2))
        assert response.status_code == 409
        assert response.json() == {'detail': 'stale_replay'}


def test_defaults_reset_restores_defaults_with_new_replay_and_unattended_timeline():
    with client_for_night_shift() as client:
        state(client)
        default_timeline = run_shift(client)
        assert default_timeline
    with client_for_night_shift() as client:
        state(client)
        config = client.get('/api/config').json()
        assert put_rules(client, edit(config, 'red.threshold', 2)).status_code == 204
        custom = state(client)['sim']['replay_id']
        assert client.post('/api/config/reset', json={'role': 'physician'}).status_code == 204
        sim = state(client)['sim']
        assert sim['replay_id'] != custom
        assert sim['rules_custom'] is False
        assert client.get('/api/config').json() == client.get('/api/config/defaults').json()
        assert run_shift(client) == default_timeline


def test_custom_cutoffs_keep_exact_decimals_in_evidence():
    with client_for_night_shift() as client:
        state(client)
        config = client.get('/api/config').json()
        config = edit(config, 'red.vital_rules.hr_high.value', 100.5)
        config = edit(config, 'red.vital_rules.spo2_low.value', 90.5)
        config = edit(config, 'red.vital_rules.spo2_low.enabled', True)
        config = edit(config, 'red.trend_rules.hr_rise.delta', 20.5)
        assert put_rules(client, config).status_code == 204
        state(client)
        vitals = {'sbp': 120, 'dbp': 80, 'spo2': 90}
        assert client.post('/api/patients/Y12/vitals', json={'hr': 101, **vitals}).status_code == 204
        components = {c['key']: c for c in client.get('/api/patients/Y12').json()['assessment']['components']}
        assert components['hr_high']['rule'] == '> 100.5 bpm'
        assert components['spo2_low']['rule'] == '≤ 90.5 %'
        assert client.post('/api/patients/Y12/vitals', json={'hr': 200, **vitals}).status_code == 204
        components = {c['key']: c for c in client.get('/api/patients/Y12').json()['assessment']['components']}
        assert components['hr_rise']['rule'].startswith('≥ 20.5 bpm from baseline')
        summary = next(p for p in state(client)['patients'] if p['id'] == 'Y12')
        assert summary['vital_flags']['spo2']['note'] == '≤ 90,5'


def test_configured_lab_cutoffs_keep_exact_decimals():
    assert critical_rule(CriticalBounds(critical_high=6.125), 6.2, 'mmol/L', 'potassium') == '≥ 6.125 mmol/L'
    assert critical_rule(CriticalBounds(critical_low=7.125), 7.0, '', 'ph') == '≤ 7.125'
    assert critical_rule(CriticalBounds(critical_low=7.1), 7.0, '', 'ph') == '≤ 7.10'
    assert critical_rule(CriticalBounds(critical_high=52), 60, 'ng/L', 'troponin') == '≥ 52 ng/L'


@pytest.mark.parametrize('param', ['hr', 'map'])
def test_trend_param_range_overflowing_float_is_rules_invalid_and_changes_nothing(param):
    with client_for_night_shift() as client:
        state(client)
        before = state(client)['sim']['replay_id']
        config = client.get('/api/config').json()
        response = put_rules(client, edit(config, f'manual_entry.limits.{param}', {'min': -1.7e308, 'max': 1.7e308}))
        assert response.status_code == 422
        assert response.json()['detail'] == 'rules_invalid'
        assert [error['loc'] for error in response.json()['errors']] == [f'manual_entry.limits.{param}.max']
        assert client.get('/api/config').json() == config
        assert state(client)['sim']['replay_id'] == before


def test_enabled_spo2_rule_scores_manual_spo2_88_for_y12():
    with client_for_night_shift() as client:
        state(client)
        config = client.get('/api/config').json()
        assert put_rules(client, edit(config, 'red.vital_rules.spo2_low.enabled', True)).status_code == 204
        state(client)
        response = client.post('/api/patients/Y12/vitals', json={'hr': 90, 'sbp': 120, 'dbp': 80, 'spo2': 88})
        assert response.status_code == 204
        detail = client.get('/api/patients/Y12').json()
        assert 'spo2_low' in {component['key'] for component in detail['assessment']['components']}
        summary = next(p for p in state(client)['patients'] if p['id'] == 'Y12')
        assert 'spo2' in summary['vital_flags']


def test_history_records_apply_and_reset_across_replays():
    with client_for_night_shift() as client:
        state(client)
        config = client.get('/api/config').json()
        assert put_rules(client, edit(config, 'red.threshold', 2)).status_code == 204
        state(client)
        assert client.post('/api/config/reset', json={'role': 'physician'}).status_code == 204
        state(client)
        history = client.get('/api/config/history').json()
        assert [(h['action'], h['role']) for h in history] == [('apply', 'physician'), ('reset_defaults', 'physician')]
        assert [h['changes'] for h in history] == [
            [{'path': 'red.threshold', 'before': 3, 'after': 2}],
            [{'path': 'red.threshold', 'before': 2, 'after': 3}],
        ]
        assert all('wall_time' in h for h in history)


def test_normal_sim_reset_keeps_active_rules_and_history():
    with client_for_night_shift() as client:
        state(client)
        config = client.get('/api/config').json()
        assert put_rules(client, edit(config, 'red.threshold', 2)).status_code == 204
        state(client)
        assert client.post('/api/sim/reset', json={}).status_code == 204
        sim = state(client)['sim']
        assert sim['rules_custom'] is True
        assert client.get('/api/config').json()['red']['threshold'] == 2
        assert len(client.get('/api/config/history').json()) == 1


def test_get_config_and_defaults_round_trip_is_accepted():
    with client_for_night_shift() as client:
        state(client)
        for path in ('/api/config', '/api/config/defaults'):
            assert put_rules(client, client.get(path).json()).status_code == 204
            state(client)
        assert state(client)['sim']['rules_custom'] is False
        assert client.get('/api/config').json() == client.get('/api/config/defaults').json()


def test_reordered_rule_rows_keep_default_order_and_are_not_a_change():
    with client_for_night_shift() as client:
        state(client)
        defaults = client.get('/api/config/defaults').json()
        config = copy.deepcopy(defaults)
        config['red']['vital_rules'].reverse()
        config['red']['trend_rules'].reverse()
        assert put_rules(client, config).status_code == 204
        state(client)
        assert state(client)['sim']['rules_custom'] is False
        assert client.get('/api/config').json() == defaults


def test_added_rule_row_is_rule_not_editable():
    with client_for_night_shift() as client:
        state(client)
        config = client.get('/api/config').json()
        config['red']['vital_rules'].append(
            {'key': 'extra_rule', 'param': 'map', 'op': '<', 'value': 50.0, 'points': 1, 'enabled': True})
        response = put_rules(client, config)
        assert response.status_code == 422
        assert response.json() == {'detail': 'rule_not_editable', 'paths': ['red.vital_rules.extra_rule']}


def test_removed_field_is_rule_not_editable():
    with client_for_night_shift() as client:
        state(client)
        config = client.get('/api/config').json()
        del config['yellow']['monitor_gap_minutes']
        response = put_rules(client, config)
        assert response.status_code == 422
        assert response.json() == {'detail': 'rule_not_editable', 'paths': ['yellow.monitor_gap_minutes']}


def test_changed_null_is_rule_not_editable():
    with client_for_night_shift() as client:
        state(client)
        config = client.get('/api/config').json()
        assert config['labs']['troponin']['ref_low'] is None
        config['labs']['troponin']['ref_low'] = 3.0
        response = put_rules(client, config)
        assert response.status_code == 422
        assert response.json() == {'detail': 'rule_not_editable', 'paths': ['labs.troponin.ref_low']}


@pytest.mark.parametrize(('path', 'value'), [
    ('red.threshold', 2.0),
    ('red.threshold', '2'),
    ('red.vital_rules.spo2_low.enabled', 'true'),
    ('red.vital_rules.spo2_low.enabled', 0),
])
def test_wrong_json_type_for_setting_is_rules_invalid(path, value):
    with client_for_night_shift() as client:
        state(client)
        config = client.get('/api/config').json()
        response = put_rules(client, edit(config, path, value))
        assert response.status_code == 422
        assert response.json()['detail'] == 'rules_invalid'
        assert path in [e['loc'] for e in response.json()['errors']]
        assert client.get('/api/config').json() == config


def test_float_measures_accept_integer_or_decimal_json():
    with client_for_night_shift() as client:
        state(client)
        config = client.get('/api/config').json()
        assert put_rules(client, edit(config, 'red.vital_rules.map_low.value', 62)).status_code == 204
        state(client)
        config = client.get('/api/config').json()
        assert put_rules(client, edit(config, 'red.vital_rules.map_low.value', 62.5)).status_code == 204
        state(client)
        assert _get(client.get('/api/config').json(), 'red.vital_rules.map_low.value') == 62.5


def test_non_finite_numbers_are_rejected_without_change():
    with client_for_night_shift() as client:
        state(client)
        config = client.get('/api/config').json()
        response = put_non_finite(client, edit(config, 'red.vital_rules.map_low.value', float('nan')))
        assert response.status_code == 422
        assert response.json()['detail'] == 'rules_invalid'
        assert 'red.vital_rules.map_low.value' in [e['loc'] for e in response.json()['errors']]
        assert client.get('/api/config').json() == config


def test_gcs_limits_must_be_integers():
    with client_for_night_shift() as client:
        state(client)
        config = client.get('/api/config').json()
        response = put_rules(client, edit(config, 'manual_entry.limits.gcs.min', 3.5))
        assert response.status_code == 422
        assert response.json()['detail'] == 'rules_invalid'
        assert [e['loc'] for e in response.json()['errors']] == ['manual_entry.limits.gcs.min']


@pytest.mark.parametrize(('path', 'value', 'loc'), [
    ('universal_panic.potassium.critical_low', 7.0, 'universal_panic.potassium.critical_low'),
    ('yellow.vitals_overdue_escalate_minutes', 20, 'yellow.vitals_overdue_escalate_minutes'),
])
def test_model_validator_errors_point_to_editable_fields(path, value, loc):
    with client_for_night_shift() as client:
        state(client)
        config = client.get('/api/config').json()
        response = put_rules(client, edit(config, path, value))
        assert response.status_code == 422
        assert response.json()['detail'] == 'rules_invalid'
        assert [e['loc'] for e in response.json()['errors']] == [loc]
        assert client.get('/api/config').json() == config


@pytest.mark.parametrize(('path', 'value'), [
    ('red.vital_max_age_minutes', 10**12),
    ('green.idle_after_results_minutes', 10**13),
    ('yellow.vitals_overdue_escalate_minutes', 10**13),
    ('alerting.ack_cooldown_minutes', 10**13),
    ('display.gcs_fresh_minutes', 10**13),
])
def test_unrepresentable_minutes_are_rules_invalid_and_change_nothing(path, value):
    with client_for_night_shift() as client:
        before = state(client)['sim']
        config = client.get('/api/config').json()
        response = put_rules(client, edit(config, path, value))
        assert response.status_code == 422
        assert response.json()['detail'] == 'rules_invalid'
        assert [e['loc'] for e in response.json()['errors']] == [path]
        assert client.get('/api/config').json() == config
        assert state(client)['sim']['replay_id'] == before['replay_id']


@pytest.mark.parametrize('bad_key', [['map_low'], {'name': 'map_low'}])
def test_non_string_rule_key_is_rule_not_editable(bad_key):
    with client_for_night_shift() as client:
        state(client)
        original = client.get('/api/config').json()
        config = copy.deepcopy(original)
        config['red']['vital_rules'][0]['key'] = bad_key
        response = put_rules(client, config)
        assert response.status_code == 422
        assert response.json() == {'detail': 'rule_not_editable', 'paths': ['red.vital_rules']}
        assert client.get('/api/config').json() == original


@pytest.mark.parametrize(('path', 'value', 'loc'), [
    ('labs.troponin.ref_high', 52.0, 'labs.troponin.ref_high'),
    ('labs.potassium.critical_high', 5.0, 'labs.potassium.critical_high'),
])
def test_reference_limit_errors_point_to_the_edited_bound(path, value, loc):
    with client_for_night_shift() as client:
        state(client)
        config = client.get('/api/config').json()
        response = put_rules(client, edit(config, path, value))
        assert response.status_code == 422
        assert response.json()['detail'] == 'rules_invalid'
        assert [e['loc'] for e in response.json()['errors']] == [loc]
        assert client.get('/api/config').json() == config


def test_scenario_invalid_after_startup_rejects_put_without_changes(tmp_path):
    scenario = tmp_path / 'night_shift_0245.json'
    shutil.copy(SCENARIO_DIR / 'night_shift_0245.json', scenario)
    with client_for_night_shift(source=SimulatorSource(tmp_path)) as client:
        before = state(client)['sim']
        config = client.get('/api/config').json()
        scenario.write_text('{not json', encoding='utf-8')
        response = put_rules(client, edit(config, 'red.threshold', 2))
        assert response.status_code == 422
        assert response.json()['detail'].startswith('night_shift_0245.json')
        assert client.get('/api/config').json() == config
        assert state(client)['sim']['replay_id'] == before['replay_id']
        assert client.get('/api/config/history').json() == []


def test_accepted_no_change_put_restarts_the_replay():
    with client_for_night_shift() as client:
        before = state(client)['sim']['replay_id']
        assert put_rules(client, client.get('/api/config').json()).status_code == 204
        assert state(client)['sim']['replay_id'] != before


def test_clock_range_is_checked_against_scenario_start_not_current_time():
    with client_for_night_shift() as client:
        start = datetime.fromisoformat(state(client)['sim']['time']).replace(tzinfo=None)
        step(client)
        before = state(client)['sim']
        current = datetime.fromisoformat(before['time']).replace(tzinfo=None)
        minutes = (start - datetime.min) // timedelta(minutes=1) + 1
        assert current - datetime.min >= timedelta(minutes=minutes)
        assert start - datetime.min < timedelta(minutes=minutes)
        config = client.get('/api/config').json()
        response = put_rules(client, edit(config, 'yellow.vitals_overdue_escalate_minutes', minutes))
        assert response.status_code == 422
        assert response.json()['errors'] == [{'loc': 'yellow.vitals_overdue_escalate_minutes', 'msg': 'duration exceeds the clock range'}]
        assert client.get('/api/config').json() == config
        assert state(client)['sim']['replay_id'] == before['replay_id']


def test_vital_max_age_overflowing_scenario_end_is_rules_invalid_and_changes_nothing(tmp_path):
    late = (SCENARIO_DIR / 'night_shift_0245.json').read_text(encoding='utf-8').replace('2026-11-20', '7000-11-20')
    (tmp_path / 'night_shift_0245.json').write_text(late, encoding='utf-8')
    start = datetime(7000, 11, 20, 2, 45)
    end = datetime(7000, 11, 20, 4, 30)
    minutes = (datetime.max - end) // timedelta(minutes=1) + 1
    with pytest.raises(OverflowError):
        end + timedelta(minutes=minutes)
    assert start + timedelta(minutes=minutes) < datetime.max
    assert start - timedelta(minutes=minutes) > datetime.min
    with client_for_night_shift(source=SimulatorSource(tmp_path)) as client:
        before = state(client)['sim']
        config = client.get('/api/config').json()
        response = put_rules(client, edit(config, 'red.vital_max_age_minutes', minutes))
        assert response.status_code == 422
        assert response.json()['errors'] == [{'loc': 'red.vital_max_age_minutes', 'msg': 'duration exceeds the clock range'}]
        assert client.get('/api/config').json() == config
        assert state(client)['sim']['replay_id'] == before['replay_id']


def test_in_process_active_mutation_does_not_change_defaults():
    with client_for_night_shift() as client:
        defaults = client.get('/api/config/defaults').json()
        client.app.state.session.config.red.threshold = 9
        assert client.get('/api/config/defaults').json() == defaults


def test_in_process_active_mutation_after_reset_does_not_change_defaults():
    with client_for_night_shift() as client:
        state(client)
        defaults = client.get('/api/config/defaults').json()
        assert put_rules(client, edit(client.get('/api/config').json(), 'red.threshold', 2)).status_code == 204
        state(client)
        assert client.post('/api/config/reset', json={'role': 'physician'}).status_code == 204
        client.app.state.session.config.red.threshold = 9
        assert client.get('/api/config/defaults').json() == defaults


def test_reset_without_replay_id_is_428():
    with client_for_night_shift() as client:
        response = client.post('/api/config/reset', json={'role': 'physician'})
        assert response.status_code == 428
        assert response.json() == {'detail': 'replay_id_required'}


def test_reset_with_stale_replay_id_is_409():
    with client_for_night_shift() as client:
        state(client)
        assert client.post('/api/sim/reset', json={}).status_code == 204
        response = client.post('/api/config/reset', json={'role': 'physician'})
        assert response.status_code == 409
        assert response.json() == {'detail': 'stale_replay'}
        assert client.get('/api/config/history').json() == []


def test_nurse_cannot_reset_rules():
    with client_for_night_shift() as client:
        state(client, 'nurse')
        response = client.post('/api/config/reset', json={'role': 'nurse'})
        assert response.status_code == 403
        assert response.json() == {'detail': 'physician_role_required'}
        assert client.get('/api/config/history').json() == []


def test_active_config_names_the_replay_it_describes():
    with client_for_night_shift() as client:
        previous = state(client)['sim']['replay_id']
        first = client.get('/api/config')
        assert first.headers.get('X-Replay-Id') == previous
        assert first.json()['red']['threshold'] == 3
        changed = edit(first.json(), 'red.threshold', 2)
        assert put_rules(client, changed).status_code == 204

        # A caller whose state poll preceded the apply can detect that this newer config is not for it.
        second = client.get('/api/config')
        assert second.json() == changed
        assert second.headers.get('X-Replay-Id') != previous
        assert second.headers.get('X-Replay-Id') == state(client)['sim']['replay_id']
