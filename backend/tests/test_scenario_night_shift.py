from datetime import datetime, timezone

from fastapi.testclient import TestClient


def client_for_night_shift(monotonic=None, source=None):
    from app.main import create_app

    options = {'monotonic': monotonic} if monotonic is not None else {}
    return TestClient(create_app(source=source, wall_now=lambda: datetime(2026, 11, 20, tzinfo=timezone.utc), **options))


def state(client, role='physician'):
    response = client.get('/api/state', params={'role': role})
    assert response.status_code == 200
    return response.json()


def step(client):
    assert client.post('/api/sim/step', json={'minutes': 15}).status_code == 204


def test_exact_night_shift_timeline():
    with client_for_night_shift() as client:
        assert state(client)['alerts'] == []
        assert state(client, 'nurse')['alerts'] == []
        step(client)
        assert [(a['patient_id'], a['level']) for a in state(client)['alerts']] == [('Y06', 'GREEN')]
        step(client)
        yellow = state(client, 'nurse')['alerts'][0]
        assert (yellow['patient_id'], yellow['escalated']) == ('Y03', False)
        detail = client.get('/api/patients/Y05').json()
        assert [(lab['test'], lab['reason_key']) for lab in detail['assessment']['suppressed_labs']] == [
            ('lactate', 'unrelated_diagnosis'),
        ]
        step(client)
        red = state(client)['alerts'][0]
        assert (red['patient_id'], red['score']) == ('Y01', 3)
        step(client)
        assert [(a['id'], a['score']) for a in state(client)['alerts'] if a['level'] == 'RED'] == [(red['id'], 6)]
        step(client)
        assert [(a['patient_id'], a['score']) for a in state(client)['alerts'] if a['level'] == 'RED'] == [('Y01', 10), ('Y02', 3)]
        assert state(client, 'nurse')['alerts'][0]['escalated']
        step(client)
        assert [a['patient_id'] for a in state(client)['alerts'] if a['level'] == 'RED'] == ['Y01', 'Y02', 'Y08']
        step(client)
        events = client.get('/api/audit').json()
        assert [(entry['sim_time'][11:16], entry['patient_id']) for entry in events if entry['event'] == 'created'] == [
            ('03:00', 'Y06'), ('03:15', 'Y03'), ('03:30', 'Y01'), ('04:00', 'Y02'), ('04:15', 'Y08'),
        ]
        assert [(e['sim_time'][11:16], e['patient_id']) for e in events if e['event'] == 'lab_suppressed'] == [('03:15', 'Y05')]
        assert [(e['sim_time'][11:16], e['patient_id']) for e in events if e['event'] == 'escalated'] == [('04:00', 'Y03')]


def test_scripted_user_replay_has_identical_alerts_and_audit():
    results = []
    with client_for_night_shift() as client:
        for _ in range(2):
            assert client.post('/api/sim/reset', json={}).status_code == 204
            seen = []
            for role, patient, action in [
                ('physician', 'Y06', 'discharge_decided'),
                ('nurse', 'Y03', 'monitor_reconnected'),
                ('physician', 'Y01', 'move_to_red_zone'),
            ]:
                step(client)
                view = state(client, role)
                alert = next(a for a in view['alerts'] if a['patient_id'] == patient)
                seen.append(alert)
                assert client.post(f"/api/alerts/{alert['id']}/ack", json={'action': action}).status_code == 204
            step(client)
            assert all(p['id'] not in {'Y01', 'Y06'} for p in state(client)['patients'])
            assert state(client, 'nurse')['alerts'] == []
            results.append((seen, client.get('/api/audit').json()))
    assert results[0] == results[1]
    assert [x['patient_id'] for x in results[0][1] if x['event'] == 'acknowledged'] == ['Y06', 'Y03', 'Y01']


def test_playback_crosses_every_boundary_before_reporting_the_final_state():
    ticks = [0.0]
    with client_for_night_shift(monotonic=lambda: ticks[0]) as client:
        assert client.post('/api/sim/play', json={'speed': 30}).status_code == 204
        ticks[0] = 150.0
        assert state(client)['sim']['time'][11:16] == '04:00'
        red = [(entry['sim_time'][11:16], entry['score']) for entry in client.get('/api/audit').json()
               if entry['patient_id'] == 'Y01' and entry['event'] in {'created', 'updated'}]
        assert red == [('03:30', 3), ('03:45', 6), ('04:00', 10)]
        assert client.post('/api/sim/pause').status_code == 204
        ticks[0] = 300.0
        assert state(client)['sim']['time'][11:16] == '04:00'
