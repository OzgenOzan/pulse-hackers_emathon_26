import json

import pytest

from app.adapters.simulator import SCENARIO_DIR, SimulatorSource
from app.sim.player import Scenario
from test_scenario_night_shift import client_for_night_shift, state, step


NIGHT_SHIFT = 'night_shift_0245.json'
VALID_VITALS = {'hr': 94, 'sbp': 128, 'dbp': 74}


def detail(client, patient):
    response = client.get(f'/api/patients/{patient}', params={'role': 'nurse'})
    assert response.status_code == 200
    return response.json()


def test_synthetic_display_records_do_not_change_clinical_replay(tmp_path):
    sample = json.loads((SCENARIO_DIR / NIGHT_SHIFT).read_text(encoding='utf-8'))
    for profile in sample['patients']:
        profile.pop('display', None)
    sample['events'] = [event for event in sample['events'] if event['type'] not in ('gcs', 'consult_request', 'consult_result')]
    (tmp_path / NIGHT_SHIFT).write_text(json.dumps(sample), encoding='utf-8')
    with client_for_night_shift() as full, client_for_night_shift(source=SimulatorSource(tmp_path)) as original:
        data = detail(full, 'Y05')
        assert data['profile']['display'] == {'name': 'Emre Polat', 'protocol': '26110005', 'complaint': 'Nöbet geçirme',
                                              'nurse': 'Hmş. Elif Kaya', 'physician': 'Dr. Deniz Aksoy'}
        assert data['gcs_history'] == [{'value': 14, 'observed_at': '2026-11-20T02:22:00'}]
        assert data['consultations'] == [{'service': 'Nöroloji', 'requested_at': '2026-11-20T02:40:00', 'resulted_at': None}]
        assert detail(full, 'Y09')['profile']['label'] == 'İ.U.'
        assert detail(full, 'Y11')['profile']['label'] == 'K.Ö.'
        for index in range(7):
            for role in ('physician', 'nurse'):
                assert state(full, role)['alerts'] == state(original, role)['alerts']
            assert detail(full, 'Y05')['assessment'] == detail(original, 'Y05')['assessment']
            if index < 6:
                step(full)
                step(original)
        assert [p['value'] for p in detail(full, 'Y05')['gcs_history']] == [14, 15]
        assert detail(full, 'Y02')['consultations'][0]['service'] == 'Kardiyoloji'
        assert full.get('/api/audit').json() == original.get('/api/audit').json()


def test_consult_result_requires_and_closes_oldest_pending_request(tmp_path):
    sample = json.loads((SCENARIO_DIR / NIGHT_SHIFT).read_text(encoding='utf-8'))
    event = {'t': '03:10', 'type': 'consult_result', 'patient': 'Y06', 'service': 'Üroloji'}
    sample['events'].append(event)
    path = tmp_path / NIGHT_SHIFT
    path.write_text(json.dumps(sample), encoding='utf-8')
    with pytest.raises(ValueError, match='has no pending request'):
        Scenario.load(path)
    sample['events'].extend({**event, 't': time, 'type': 'consult_request'} for time in ('02:40', '02:41'))
    path.write_text(json.dumps(sample), encoding='utf-8')
    with client_for_night_shift(source=SimulatorSource(tmp_path)) as client:
        step(client)
        step(client)
        assert detail(client, 'Y06')['consultations'] == [
            {'service': 'Üroloji', 'requested_at': '2026-11-20T02:40:00', 'resulted_at': '2026-11-20T03:10:00'},
            {'service': 'Üroloji', 'requested_at': '2026-11-20T02:41:00', 'resulted_at': None},
        ]
        assert any(a['level'] == 'GREEN' for a in state(client)['alerts'])


@pytest.mark.parametrize('gcs', [2, 16, 14.5, 14.0, '14', True])
def test_invalid_manual_gcs_rejects_entire_entry(gcs):
    with client_for_night_shift() as client:
        state(client)
        before = detail(client, 'Y01')
        response = client.post('/api/patients/Y01/vitals', json={**VALID_VITALS, 'gcs': gcs})
        assert response.status_code == 422
        assert detail(client, 'Y01') == before
        assert not any(row['event'] == 'manual_vitals' for row in client.get('/api/audit').json())


def test_manual_gcs_is_stored_separately_from_vitals():
    with client_for_night_shift() as client:
        state(client)
        assert client.post('/api/patients/Y01/vitals', json={'gcs': 14}).json()['detail'] == 'vital_required_missing'
        assert client.post('/api/patients/Y01/vitals', json={**VALID_VITALS, 'gcs': 14}).status_code == 204
        data = detail(client, 'Y01')
        assert data['gcs_history'][-1] == {'value': 14, 'observed_at': '2026-11-20T02:45:00'}
        assert 'gcs' not in data['vitals'][-1]
        assert data['assessment']['score'] == 0


def test_seen_is_role_specific_and_does_not_record_an_evaluation():
    with client_for_night_shift() as client:
        for _ in range(3):
            step(client)
        alert = state(client)['alerts'][0]
        url = f"/api/alerts/{alert['id']}/seen"
        client.app.state.session.clock.step(1)
        for role in ('physician', 'physician', 'nurse', 'nurse'):
            assert client.post(url, json={'role': role}).status_code == 204
        current = state(client)
        assert current['blocking_alert_id'] == alert['id']
        assert current['alerts'][0]['status'] == 'active'
        assert client.get('/api/patients/Y02').status_code == 409
        logged = [row for row in client.get('/api/audit').json() if row['event'] == 'seen']
        assert [(row['role'], row['latency_minutes'], row['score']) for row in logged] == [
            ('physician', 1, 3), ('nurse', 1, 3),
        ]
        alarms = client.get('/api/alerts', params={'level': 'RED'}).json()
        assert alarms[0]['seen'] == {role: {'at': '2026-11-20T03:31:00', 'score': 3}
                                     for role in ('physician', 'nurse')}
        assert alarms[0]['initial_score'] == 3


def test_seen_requires_a_current_replay_and_a_critical_alarm():
    with client_for_night_shift() as client:
        assert client.post('/api/alerts/invalid/seen', json={'role': 'nurse'}).status_code == 428
        step(client)
        view = state(client)
        alert = view['alerts'][0]
        assert client.post('/api/alerts/invalid/seen', json={'role': 'nurse'}).status_code == 404
        url = f"/api/alerts/{alert['id']}/seen"
        denied = client.post(url, json={'role': 'physician'})
        assert (denied.status_code, denied.json()['detail']) == (422, 'seen_not_applicable')
        assert client.post('/api/sim/reset', json={}).status_code == 204
        stale = client.post(url, json={'role': 'physician'})
        assert (stale.status_code, stale.json()['detail']) == (409, 'stale_replay')
        assert not client.get('/api/audit').json()


def test_evaluation_note_rejects_overlong_input_and_preserves_alarm_history():
    with client_for_night_shift() as client:
        for _ in range(3):
            step(client)
        alert = state(client)['alerts'][0]
        root = f"/api/alerts/{alert['id']}"
        step(client)
        assert client.post(f'{root}/seen', json={'role': 'physician'}).status_code == 204
        action = {'action': 'expected_for_patient', 'reason': 'chronic_baseline'}
        invalid = client.post(f'{root}/ack', json={**action, 'note': 'a' * 281})
        assert (invalid.status_code, invalid.json()['detail']) == (422, 'note_too_long')
        assert state(client)['blocking_alert_id'] == alert['id']
        assert client.post(f'{root}/ack', json={**action, 'note': '  Bazal değer doğrulandı.  '}).status_code == 204
        assert state(client)['blocking_alert_id'] is None
        [saved] = client.get('/api/alerts?level=RED').json()
        assert (saved['status'], saved['action'], saved['reason'], saved['note']) == (
            'acknowledged', 'expected_for_patient', 'chronic_baseline', 'Bazal değer doğrulandı.',
        )
        assert (saved['initial_score'], saved['score'], saved['seen']['physician']['score']) == (3, 6, 6)
        assert saved['decision_latency_minutes'] == 15
        [decision] = [r for r in client.get('/api/audit').json() if r['event'] == 'acknowledged']
        assert decision['note'] == 'Bazal değer doğrulandı.'
