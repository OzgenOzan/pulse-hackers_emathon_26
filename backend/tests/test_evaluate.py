from datetime import datetime, timedelta

import pytest

from app.domain.models import Diagnosis, LabOrder, PatientProfile, PatientSnapshot, PhysicianAction, VitalReading
from app.engine.config import load_config

NOW = datetime(2026, 11, 20, 3, 30)
CONFIG = load_config()


def reading(age=0, source='monitor', **values):
    return VitalReading(time=NOW - timedelta(minutes=age), source=source, **values)


def patient(*, dx='R56.8', vitals=(), labs=(), actions=(), monitored=True, active_red=False):
    profile = PatientProfile(id='Y00', bed='S-00', label='Z.Z.', age=60, sex='F',
                             arrived_at=NOW - timedelta(hours=2), monitored=monitored,
                             working_dx=[Diagnosis(code=dx, text='Synthetic')])
    return PatientSnapshot(profile=profile, vitals=list(vitals), labs=list(labs), actions=list(actions), active_red=active_red)


def run(snapshot, config=CONFIG):
    from app.engine.evaluate import evaluate

    return evaluate(snapshot, NOW, config)


@pytest.mark.parametrize(('values', 'score'), [({'map': 65}, 3), ({'map': 66}, 0), ({'hr': 100}, 0),
                                              ({'hr': 101}, 1), ({'temp': 37.9}, 0), ({'temp': 38.0}, 1),
                                              ({'spo2': 82, 'rr': 30}, 0), ({'sbp': 91, 'dbp': 52}, 3)])
def test_vital_cutoff_boundaries(values, score):
    assert run(patient(vitals=[reading(**values)])).score == score


def test_trends_use_the_first_sample_and_the_latest_fresh_values():
    p = patient(vitals=[reading(45, map=92, hr=71), reading(15, map=88, hr=89), reading(map=77, hr=91)])
    result = run(p)
    assert result.score == 2
    assert [(c.key, c.value) for c in result.components] == [('map_drop', 15), ('hr_rise', 20)]
    assert run(patient(vitals=[reading(30, map=64)])).score == 3
    assert run(patient(vitals=[reading(31, map=64)])).score == 0
    assert run(patient(vitals=[reading(4, map=64), reading(hr=88)])).score == 3


def test_partial_readings_keep_each_fields_own_freshness_and_baseline():
    vitals = [reading(50, hr=94), reading(45, map=92), reading(5, map=74, temp=38.4), reading(hr=95)]
    result = run(patient(vitals=vitals))
    assert result.score == 2
    assert [(c.key, c.observed_at) for c in result.components] == [
        ('temp_high', NOW - timedelta(minutes=5)), ('map_drop', NOW - timedelta(minutes=5)),
    ]
    expired_map = run(patient(vitals=[reading(31, map=64), reading(hr=108)]))
    assert [(c.key, c.observed_at) for c in expired_map.components] == [('hr_high', NOW)]


def lab(test, value, unit, age=0):
    return LabOrder(test=test, ordered_at=NOW - timedelta(minutes=age + 3),
                    resulted_at=NOW - timedelta(minutes=age), value=value, unit=unit)


def test_diagnosis_filters_critical_lab_and_explains_suppression():
    lactate = lab('lactate', 4.2, 'mmol/L')
    assert run(patient(dx='A41.9', labs=[lactate])).score == 3
    unrelated = run(patient(labs=[lactate]))
    assert unrelated.score == 0
    assert [(x.test, x.reason_key) for x in unrelated.suppressed_labs] == [('lactate', 'unrelated_diagnosis')]
    mismatch = run(patient(dx='A41.9', labs=[lab('lactate', 4.2, 'mg/dL')]))
    assert mismatch.score == 0 and mismatch.suppressed_labs[0].reason_key == 'unit_mismatch'


def test_panic_is_switchable_and_does_not_double_count_related_lab():
    high_k = lab('potassium', 6.5, 'mmol/L')
    assert run(patient(labs=[high_k])).score == 3
    assert run(patient(dx='N18.2', labs=[high_k])).score == 3
    config = CONFIG.model_copy(update={'universal_panic': CONFIG.universal_panic.model_copy(update={'enabled': False})})
    assert run(patient(labs=[high_k]), config).score == 0


def test_latest_result_supersedes_an_older_critical_value():
    p = patient(dx='R07.4', labs=[lab('troponin', 68, 'ng/L', age=15), lab('troponin', 13, 'ng/L')])
    assert run(p).score == 0
    assert run(p).suppressed_labs == []


@pytest.mark.parametrize(('age', 'monitored', 'key', 'escalated'), [
    (14, True, None, False), (15, True, 'yellow_monitor_gap', False),
    (29, False, None, False), (30, False, 'yellow_vitals_overdue', False),
    (59, False, 'yellow_vitals_overdue', False), (60, False, 'yellow_vitals_overdue', True),
    (30, True, 'yellow_monitor_and_vitals', False),
])
def test_data_gap_boundaries(age, monitored, key, escalated):
    result = run(patient(vitals=[reading(age, hr=96)], monitored=monitored))
    assert [(a.title_key, a.escalated) for a in result.candidates] == ([(key, escalated)] if key else [])


def test_manual_vitals_do_not_treat_a_monitor_as_reconnected():
    result = run(patient(vitals=[reading(60, hr=96), reading(source='manual', hr=96)]))
    assert [(a.title_key, a.params['monitor_minutes']) for a in result.candidates] == [('yellow_monitor_gap', 60)]


def test_green_requires_all_orders_ready_and_no_physician_action_or_red():
    v = [reading(hr=80)]
    early, ready = lab('cbc', 7.2, '10^9/L', 29), lab('cbc', 7.2, '10^9/L', 30)
    assert run(patient(vitals=v, labs=[early])).candidates == []
    assert [a.level for a in run(patient(vitals=v, labs=[ready])).candidates] == ['GREEN']
    repeat = LabOrder(test='cbc', ordered_at=NOW - timedelta(minutes=10))
    assert run(patient(vitals=v, labs=[ready, repeat])).candidates == []
    action = PhysicianAction(time=NOW - timedelta(minutes=5), type='prescription_written')
    assert run(patient(vitals=v, labs=[ready], actions=[action])).candidates == []
    assert run(patient(vitals=v, labs=[ready], active_red=True)).candidates == []
    assert [a.level for a in run(patient(vitals=[reading(map=65)], labs=[ready])).candidates] == ['RED']


def test_green_snooze_expires_only_with_no_later_action():
    p = patient(vitals=[reading(hr=88)], labs=[lab('cbc', 7.2, '10^9/L', 45)],
                actions=[PhysicianAction(time=NOW - timedelta(minutes=30), type='wait_justified')])
    assert [a.level for a in run(p).candidates] == ['GREEN']
    p.actions.append(PhysicianAction(time=NOW, type='reassessing'))
    assert run(p).candidates == []


def test_same_minute_lab_order_and_result_can_start_idle_waiting():
    ready = lab('cbc', 7.2, '10^9/L', 30)
    ready.ordered_at = ready.resulted_at
    alerts = run(patient(vitals=[reading(hr=80)], labs=[ready])).candidates
    assert [(a.level, a.params['minutes']) for a in alerts] == [('GREEN', 30)]
