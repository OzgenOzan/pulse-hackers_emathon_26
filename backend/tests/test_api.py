from concurrent.futures import ThreadPoolExecutor

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
        step(client)
        step(client)
        step(client)
        before = state(client, 'nurse')['alerts'][0]
        response = client.post(f"/api/alerts/{before['id']}/ack", json={'action': 'vitals_entered'})
        assert response.status_code == 422
        assert state(client, 'nurse')['alerts'][0]['id'] == before['id']
        assert before['title_key'] == 'yellow_monitor_and_vitals'
        assert client.post('/api/patients/Y03/vitals', json={'hr': 96, 'sbp': 125, 'dbp': 78, 'temp': 36.9, 'spo2': 94, 'rr': 20}).status_code == 204
        after = state(client, 'nurse')['alerts'][0]
        assert (after['id'], after['title_key']) == (before['id'], 'yellow_monitor_gap')
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
