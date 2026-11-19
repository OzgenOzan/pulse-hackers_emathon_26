from concurrent.futures import ThreadPoolExecutor

import pytest

from test_scenario_night_shift import client_for_night_shift, state, step


def test_physician_red_gate_and_audited_override():
    with client_for_night_shift() as client:
        for _ in range(6):
            step(client)
        alert_id = state(client)['blocking_alert_id']
        assert alert_id
        assert state(client, 'nurse')['blocking_alert_id'] is None
        assert client.get('/api/patients/Y02?role=physician').status_code == 409
        assert client.get('/api/patients/Y02?role=nurse').status_code == 200
        assert client.get('/api/patients/Y01?role=physician').status_code == 200
        URL = f'/api/alerts/{alert_id}/ack'
        assert client.post(URL, json={'action': 'expected_for_patient'}).status_code == 422
        assert client.post(URL, json={'action': 'monitor_reconnected'}).status_code == 422
        assert client.post(URL, json={'action': 'expected_for_patient', 'reason': 'chronic_baseline'}).status_code == 204
        assert state(client)['blocking_alert_id'] != alert_id
        entry = next(x for x in client.get('/api/audit').json() if x['event'] == 'acknowledged')
        assert (entry['patient_id'], entry['action'], entry['reason'], entry['latency_minutes']) == (
            'Y01', 'expected_for_patient', 'chronic_baseline', 45,
        )


def test_duplicate_discharge_cannot_repeat_the_action():
    with client_for_night_shift() as client:
        step(client)
        green = state(client)['alerts'][0]
        url = f"/api/alerts/{green['id']}/ack"
        with ThreadPoolExecutor(max_workers=2) as pool:
            codes = list(pool.map(lambda _: client.post(url, json={'action': 'discharge_decided'}).status_code, range(2)))
        assert sorted(codes) == [204, 409]
        audit = client.get('/api/audit').json()
        assert sum(e['event'] == 'acknowledged' and e['patient_id'] == 'Y06' for e in audit) == 1
        assert sum(e['event'] == 'status_changed' and e['patient_id'] == 'Y06' for e in audit) == 1
        assert not any(p['id'] == 'Y06' for p in state(client)['patients'])


def test_manual_vitals_leave_independent_monitor_gap_open():
    with client_for_night_shift() as client:
        for _ in range(5):
            step(client)
        before = state(client, 'nurse')['alerts'][0]
        response = client.post(f"/api/alerts/{before['id']}/ack", json={'action': 'vitals_entered'})
        assert response.status_code == 422
        assert state(client, 'nurse')['alerts'][0]['id'] == before['id']
        assert before['title_key'] == 'yellow_monitor_and_vitals'
        assert before['escalated']
        assert client.post('/api/patients/Y03/vitals', json={'hr': 96, 'sbp': 125, 'dbp': 78, 'temp': 36.9, 'spo2': 94, 'rr': 20}).status_code == 204
        after = state(client, 'nurse')['alerts'][0]
        assert (after['id'], after['title_key']) == (before['id'], 'yellow_monitor_gap')
        assert not after['escalated']
        assert any(entry['event'] == 'manual_vitals' for entry in client.get('/api/audit').json())


def test_wait_justified_snoozes_then_returns():
    with client_for_night_shift() as client:
        step(client)
        green = state(client)['alerts'][0]
        assert client.post(f"/api/alerts/{green['id']}/ack", json={'action': 'wait_justified', 'reason': 'consult'}).status_code == 204
        step(client)
        assert all(a['level'] != 'GREEN' for a in state(client)['alerts'])
        step(client)
        new = next(a for a in state(client)['alerts'] if a['patient_id'] == 'Y06')
        assert new['id'] != green['id'] and new['level'] == 'GREEN'


def test_unknown_api_path_is_not_an_spa_response():
    with client_for_night_shift() as client:
        assert client.get('/api/no-such-route').status_code == 404
        assert client.get('/assets/no-such-file.js').status_code == 404


def test_reconnect_waits_for_next_boundary_even_when_an_early_sample_arrives(tmp_path):
    import json
    from app.adapters.simulator import SCENARIO_DIR, SimulatorSource

    name = 'night_shift_0245.json'
    data = json.loads((SCENARIO_DIR / name).read_text(encoding='utf-8'))
    sample = next(e for e in data['events'] if e['patient'] == 'Y03' and e['t'] == '03:30')
    data['events'].append({**sample, 't': '03:25'})
    (tmp_path / name).write_text(json.dumps(data), encoding='utf-8')
    wall = [0.0]
    with client_for_night_shift(monotonic=lambda: wall[0], source=SimulatorSource(tmp_path)) as client:
        step(client)
        step(client)
        assert client.post('/api/sim/play', json={'speed': 60}).status_code == 204
        wall[0] = 7.0
        yellow = state(client, 'nurse')['alerts'][0]
        assert client.post(f"/api/alerts/{yellow['id']}/ack", json={'action': 'monitor_reconnected'}).status_code == 204
        wall[0] = 15.0
        readings = client.get('/api/patients/Y03?role=nurse').json()['vitals']
        assert [reading['time'][11:16] for reading in readings] == ['02:45', '03:00', '03:30']


def test_stale_replay_cannot_acknowledge_a_reused_alert_id():
    with client_for_night_shift() as client:
        step(client)
        first = state(client)
        stale = first['sim'].get('replay_id', 'obsolete-run')
        assert client.post('/api/sim/reset', json={}).status_code == 204
        step(client)
        second = state(client)
        alert = second['alerts'][0]
        assert alert['id'] == first['alerts'][0]['id']
        response = client.post(f"/api/alerts/{alert['id']}/ack", headers={'X-Replay-Id': stale},
                               json={'action': 'discharge_decided'})
        assert response.status_code == 409
        assert state(client)['alerts'][0]['id'] == alert['id']


def test_same_timestamp_manual_vitals_are_reported_as_the_latest_sample():
    with client_for_night_shift() as client:
        state(client)
        response = client.post('/api/patients/Y01/vitals', json={'hr': 94, 'sbp': 90, 'dbp': 50, 'map': 64})
        assert response.status_code == 204
        last = next(p for p in state(client)['patients'] if p['id'] == 'Y01')
        assert (last['last_vitals']['map'], last['last_vitals']['source'], last['score']) == (64, 'manual', 4)


def test_finite_extreme_pressure_values_do_not_raise_a_server_error():
    with client_for_night_shift() as client:
        state(client)
        response = client.post('/api/patients/Y01/vitals', json={'sbp': 1.7e308, 'dbp': -1.7e308})
        assert response.status_code == 422
        assert response.json()['detail'] == 'vital_out_of_range'


def test_invalid_scenario_does_not_hide_valid_choices_or_replace_the_session(tmp_path):
    from app.adapters.simulator import SCENARIO_DIR, SimulatorSource

    name = 'night_shift_0245.json'
    (tmp_path / name).write_bytes((SCENARIO_DIR / name).read_bytes())
    (tmp_path / 'incomplete.json').write_text('{"id":"incomplete"}', encoding='utf-8')
    with client_for_night_shift(source=SimulatorSource(tmp_path)) as client:
        step(client)
        before = state(client)
        choices = client.get('/api/scenarios')
        assert choices.status_code == 200
        assert any(c['id'] == 'night_shift_0245' and not c.get('error') for c in choices.json())
        assert any(c['id'] == 'incomplete' and 'incomplete.json' in c['error'] for c in choices.json())
        rejected = client.post('/api/sim/reset', json={'scenario_id': 'incomplete'})
        assert rejected.status_code == 422
        assert 'incomplete.json' in rejected.json()['detail']
        assert state(client) == before


def test_partial_manual_entry_preserves_fresh_red_evidence():
    with client_for_night_shift() as client:
        for _ in range(3):
            step(client)
        before = state(client)
        response = client.post('/api/patients/Y01/vitals', json={'hr': 108, 'sbp': 106, 'dbp': 58})
        assert response.status_code == 204
        after = state(client)
        red = next(a for a in after['alerts'] if a['id'] == before['blocking_alert_id'])
        assert (red['score'], red['criteria_met']) == (3, True)
        assert {c['key'] for c in red['components']} == {'hr_high', 'temp_high', 'map_drop'}
        row = next(p for p in after['patients'] if p['id'] == 'Y01')
        assert row['last_vitals']['temp'] is None
        assert {k: row['current_vitals'][k] for k in ('hr', 'map', 'temp', 'spo2')} == {
            'hr': 108, 'map': 74, 'temp': 38.4, 'spo2': 95,
        }


def test_nurse_reconnect_does_not_clear_physician_idle_time(tmp_path):
    import json

    from app.adapters.simulator import SimulatorSource

    events = [
        {'t': '02:00', 'patient': 'Z1', 'type': 'arrival'},
        {'t': '02:10', 'patient': 'Z1', 'type': 'lab_order', 'test': 'cbc'},
        {'t': '02:40', 'patient': 'Z1', 'type': 'lab_result', 'test': 'cbc', 'value': 7.0, 'unit': '10^9/L'},
        {'t': '02:45', 'patient': 'Z1', 'type': 'monitor_disconnect', 'resume': 'on_nurse_ack'},
    ]
    events.extend({'t': time, 'patient': 'Z1', 'type': 'vitals', 'source': 'monitor', 'hr': 80, 'sbp': 125,
                   'dbp': 80, 'temp': 36.8, 'spo2': 98, 'rr': 16} for time in ('02:45', '03:00', '03:15', '03:30'))
    profile = {'id': 'Z1', 'bed': 'S-01', 'label': 'Z.Z.', 'age': 40, 'sex': 'M', 'monitored': True,
               'arrived_at': '2026-11-20T02:00:00', 'working_dx': [{'code': 'N23', 'text': 'Renal colic'}]}
    scenario = {'id': 'night_shift_0245', 'title': 'Nurse ack vs GREEN', 'start': '2026-11-20T02:45:00',
                'end': '2026-11-20T03:30:00', 'patients': [profile], 'events': events}
    (tmp_path / 'night_shift_0245.json').write_text(json.dumps(scenario), encoding='utf-8')
    with client_for_night_shift(source=SimulatorSource(tmp_path)) as client:
        step(client)
        yellow, = state(client, 'nurse')['alerts']
        assert yellow['level'] == 'YELLOW'
        assert client.post(f"/api/alerts/{yellow['id']}/ack", json={'action': 'monitor_reconnected'}).status_code == 204
        step(client)
        assert [(a['level'], a['patient_id'], a['params']['minutes'])
                for a in state(client)['alerts']] == [('GREEN', 'Z1', 35)]
        assert any(e['event'] == 'acknowledged' and e['role'] == 'nurse' and e['action'] == 'monitor_reconnected'
                   for e in client.get('/api/audit').json())


@pytest.mark.parametrize(('values', 'error'), [
    ({'hr': 108}, 'vital_required_missing'),
    ({'hr': 1000}, 'vital_out_of_range'),
    ({'sbp': 12, 'dbp': 8}, 'vital_out_of_range'),
    ({'temp': -5}, 'vital_out_of_range'),
    ({'sbp': 80, 'dbp': 120}, 'sbp_not_above_dbp'),
    ({'spo2': 150}, 'vital_out_of_range'),
    ({'hr': 80, 'sbp': 120, 'dbp': 80, 'map': 130}, 'map_outside_bp'),
])
def test_bad_manual_vitals_are_rejected_before_mutation(values, error):
    with client_for_night_shift() as client:
        before = state(client)
        response = client.post('/api/patients/Y06/vitals', json=values)
        assert response.status_code == 422
        assert response.json()['detail'] == error
        assert state(client) == before
        assert not any(e['event'] == 'manual_vitals' for e in client.get('/api/audit').json())


@pytest.mark.parametrize('action', ['banana', '', '   ', 'x' * 101])
def test_unknown_physician_action_does_not_suppress_green(action):
    with client_for_night_shift() as client:
        state(client)
        response = client.post('/api/patients/Y06/actions', json={'type': action})
        assert response.status_code == 422
        assert response.json()['detail'] == 'invalid_action_type'
        step(client)
        assert [(a['level'], a['patient_id']) for a in state(client)['alerts']] == [('GREEN', 'Y06')]


def test_board_freshness_tracks_each_vital_between_cycles():
    with client_for_night_shift() as client:
        for _ in range(3):
            step(client)
        state(client)
        assert client.post('/api/patients/Y03/vitals', json={'hr': 90, 'sbp': 120, 'dbp': 70}).status_code == 204
        client.app.state.session.clock.step(1)
        summary = next(p for p in state(client, 'nurse')['patients'] if p['id'] == 'Y03')
        assert summary['current_vitals']['spo2'] == 94
        freshness = summary['current_vital_freshness']
        assert freshness['hr'] == {'observed_at': '2026-11-20T03:30:00', 'stale': False}
        assert freshness['spo2'] == {'observed_at': '2026-11-20T03:00:00', 'stale': True}
