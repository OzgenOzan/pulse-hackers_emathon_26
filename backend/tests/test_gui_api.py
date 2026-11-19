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
