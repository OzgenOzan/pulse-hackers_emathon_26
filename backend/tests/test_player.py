"""Deterministic clock, scenario player, event application, and synthetic data."""

import json
from datetime import datetime, timedelta
from pathlib import Path

import pytest

from app.adapters.simulator import SimulatorSource
from app.domain.models import PatientSnapshot
from app.sim.clock import SimClock
from app.sim.player import Player, Scenario, apply_event

START = datetime(2026, 11, 20, 2, 45)
END = datetime(2026, 11, 20, 4, 30)
NOISE_IDS = ('Y04', 'Y07', 'Y09', 'Y10', 'Y11', 'Y12')


def at(hhmm: str) -> datetime:
    hour, minute = map(int, hhmm.split(':'))
    return datetime(2026, 11, 20, hour, minute)


class WallClock:
    def __init__(self) -> None:
        self.seconds = 0.0

    def __call__(self) -> float:
        return self.seconds


def patient(pid: str, arrived: str) -> dict:
    return {
        'id': pid, 'bed': 'S-01', 'label': 'T.T.', 'age': 50, 'sex': 'M',
        'arrived_at': f'2026-11-20T{arrived}:00', 'monitored': True, 'working_dx': [],
    }


def arrival(pid: str, hhmm: str) -> dict:
    return {'t': hhmm, 'patient': pid, 'type': 'arrival'}


def vitals(pid: str, hhmm: str, hr: float, source: str = 'monitor') -> dict:
    return {'t': hhmm, 'patient': pid, 'type': 'vitals', 'source': source, 'hr': hr, 'sbp': 120, 'dbp': 70}


def write_scenario(tmp_path: Path, patients: list[dict], events: list[dict]) -> Scenario:
    path = tmp_path / 'scenario.json'
    path.write_text(json.dumps({
        'id': 'test_0245', 'title': 'Test', 'start': '2026-11-20T02:45:00', 'end': '2026-11-20T04:30:00',
        'patients': patients, 'events': events,
    }), encoding='utf-8')
    return Scenario.load(path)


def apply_frames(patients: dict[str, PatientSnapshot], frames, disconnected: set[str]) -> None:
    for frame in frames:
        for event in frame.events:
            apply_event(patients, event, frame.time, disconnected)


def replay(scenario: Scenario, until: datetime) -> dict[str, PatientSnapshot]:
    player = Player(scenario, 15)
    patients: dict[str, PatientSnapshot] = {}
    apply_frames(patients, player.reset() + player.advance_to(until), set())
    return patients


# --- SimClock -------------------------------------------------------------

def test_paused_clock_does_not_move_with_wall_time():
    wall = WallClock()
    clock = SimClock(START, END, monotonic=wall)
    wall.seconds = 100.0
    assert clock.now() == START
    assert clock.playing is False


def test_play_advances_by_wall_time_times_speed():
    wall = WallClock()
    clock = SimClock(START, END, speed=2, monotonic=wall)
    clock.play()
    wall.seconds = 30.0
    assert clock.now() == START + timedelta(minutes=1)


def test_pause_freezes_current_time():
    wall = WallClock()
    clock = SimClock(START, END, speed=2, monotonic=wall)
    clock.play()
    wall.seconds = 10.0
    assert clock.pause() == START + timedelta(seconds=20)
    wall.seconds = 50.0
    assert clock.now() == START + timedelta(seconds=20)


def test_speed_change_anchors_at_current_time():
    wall = WallClock()
    clock = SimClock(START, END, speed=1, monotonic=wall)
    clock.play()
    wall.seconds = 60.0
    assert clock.play(speed=60) == START + timedelta(seconds=60)
    wall.seconds = 61.0
    assert clock.now() == START + timedelta(minutes=2)


def test_step_pauses_and_advances_by_minutes():
    wall = WallClock()
    clock = SimClock(START, END, monotonic=wall)
    clock.play()
    wall.seconds = 5.0
    current = clock.now()
    assert clock.step(15) == current + timedelta(minutes=15)
    assert clock.playing is False


def test_end_cap_reached_stops_playing():
    wall = WallClock()
    clock = SimClock(START, END, speed=60, monotonic=wall)
    clock.play()
    wall.seconds = 10_000.0
    assert clock.now() == END
    assert clock.playing is False
    assert clock.play() == END
    assert clock.playing is False


def test_reset_returns_paused_at_start():
    wall = WallClock()
    clock = SimClock(START, END, monotonic=wall)
    clock.step(30)
    assert clock.reset() == START
    assert clock.playing is False


# --- Player ---------------------------------------------------------------

def test_reset_delivers_pre_start_history_then_start_boundary(tmp_path):
    scenario = write_scenario(
        tmp_path,
        [patient('P1', '02:00')],
        [arrival('P1', '02:00'), vitals('P1', '02:30', 80)],
    )
    frames = Player(scenario, 15).reset()
    assert [(f.time, f.evaluate) for f in frames] == [
        (at('02:00'), False), (at('02:30'), False), (START, True),
    ]
    assert frames[-1].events == ()


def test_same_time_events_keep_json_order(tmp_path):
    scenario = write_scenario(
        tmp_path,
        [patient('P1', '02:00'), patient('P2', '02:00')],
        [arrival('P1', '02:00'), arrival('P2', '02:00'),
         vitals('P2', '03:00', 90), vitals('P1', '03:00', 91)],
    )
    player = Player(scenario, 15)
    player.reset()
    (frame,) = player.advance_to(at('03:00'))
    assert [e.patient for e in frame.events] == ['P2', 'P1']


def test_event_at_boundary_is_in_evaluated_frame(tmp_path):
    scenario = write_scenario(
        tmp_path, [patient('P1', '02:00')], [arrival('P1', '02:00'), vitals('P1', '03:00', 90)],
    )
    player = Player(scenario, 15)
    player.reset()
    (frame,) = player.advance_to(at('03:00'))
    assert frame.evaluate is True
    assert [e.type for e in frame.events] == ['vitals']


def test_event_between_boundaries_is_not_evaluated(tmp_path):
    scenario = write_scenario(
        tmp_path, [patient('P1', '02:00')], [arrival('P1', '02:00'), vitals('P1', '03:10', 90)],
    )
    player = Player(scenario, 15)
    player.reset()
    frames = player.advance_to(at('03:15'))
    assert [(f.time, f.evaluate) for f in frames] == [(at('03:00'), True), (at('03:10'), False), (at('03:15'), True)]


def test_advance_to_same_time_yields_nothing(tmp_path):
    scenario = write_scenario(tmp_path, [patient('P1', '02:00')], [arrival('P1', '02:00')])
    player = Player(scenario, 15)
    player.reset()
    assert player.advance_to(at('03:00'))
    assert player.advance_to(at('03:00')) == []


def test_end_cap_stops_frames_and_next_cycle(tmp_path):
    scenario = write_scenario(tmp_path, [patient('P1', '02:00')], [arrival('P1', '02:00')])
    player = Player(scenario, 15)
    player.reset()
    frames = player.advance_to(at('05:00'))
    assert frames[-1].time == END
    assert frames[-1].evaluate is True
    assert player.advance_to(at('05:00')) == []
    assert player.next_cycle_at is None


def test_next_cycle_at_follows_delivered_time(tmp_path):
    scenario = write_scenario(tmp_path, [patient('P1', '02:00')], [arrival('P1', '02:00')])
    player = Player(scenario, 15)
    assert player.next_cycle_at == START
    player.reset()
    assert player.next_cycle_at == at('03:00')
    player.advance_to(at('03:10'))
    assert player.next_cycle_at == at('03:15')


def test_pending_arrival_is_absent_until_its_event(tmp_path):
    scenario = write_scenario(
        tmp_path,
        [patient('P1', '04:05')],
        [arrival('P1', '04:05'), vitals('P1', '04:15', 80)],
    )
    player = Player(scenario, 15)
    patients: dict[str, PatientSnapshot] = {}
    apply_frames(patients, player.reset() + player.advance_to(at('04:00')), set())
    assert patients == {}
    apply_frames(patients, player.advance_to(at('04:05')), set())
    assert list(patients) == ['P1']


def test_disconnect_skips_monitor_until_session_clears(tmp_path):
    scenario = write_scenario(
        tmp_path,
        [patient('P1', '02:00')],
        [
            arrival('P1', '02:00'),
            vitals('P1', '02:45', 90),
            vitals('P1', '03:00', 95),
            {'t': '03:00', 'patient': 'P1', 'type': 'monitor_disconnect', 'resume': 'on_nurse_ack'},
            vitals('P1', '03:15', 97),
            vitals('P1', '03:30', 99, source='manual'),
            vitals('P1', '03:45', 98),
        ],
    )
    player = Player(scenario, 15)
    patients: dict[str, PatientSnapshot] = {}
    disconnected: set[str] = set()
    apply_frames(patients, player.reset() + player.advance_to(at('03:30')), disconnected)
    assert disconnected == {'P1'}
    disconnected.discard('P1')
    apply_frames(patients, player.advance_to(at('03:45')), disconnected)
    assert [v.hr for v in patients['P1'].vitals] == [90, 95, 99, 98]


def test_lab_result_pairs_with_oldest_pending_order(tmp_path):
    scenario = write_scenario(
        tmp_path,
        [patient('P1', '02:00')],
        [
            arrival('P1', '02:00'),
            {'t': '02:50', 'patient': 'P1', 'type': 'lab_order', 'test': 'lactate'},
            {'t': '03:00', 'patient': 'P1', 'type': 'lab_order', 'test': 'lactate'},
            {'t': '03:10', 'patient': 'P1', 'type': 'lab_result', 'test': 'lactate', 'value': 2.0, 'unit': 'mmol/L'},
        ],
    )
    patients = replay(scenario, END)
    first, second = patients['P1'].labs
    assert first.resulted_at == at('03:10')
    assert first.value == 2.0
    assert second.resulted_at is None


def test_lab_result_without_order_is_rejected(tmp_path):
    scenario = write_scenario(
        tmp_path,
        [patient('P1', '02:00')],
        [arrival('P1', '02:00'),
         {'t': '03:00', 'patient': 'P1', 'type': 'lab_result', 'test': 'lactate', 'value': 2.0, 'unit': 'mmol/L'}],
    )
    with pytest.raises(ValueError):
        replay(scenario, END)


def test_event_before_arrival_is_rejected_at_load(tmp_path):
    with pytest.raises(ValueError):
        write_scenario(tmp_path, [patient('P1', '02:10')], [vitals('P1', '02:00', 80), arrival('P1', '02:10')])


def test_arrival_must_match_profile_arrival_time(tmp_path):
    with pytest.raises(ValueError):
        write_scenario(tmp_path, [patient('P1', '02:10')], [arrival('P1', '02:00')])


# --- Synthetic night_shift_0245 data ---------------------------------------

@pytest.fixture(scope='module')
def night_shift() -> Scenario:
    return SimulatorSource().load('night_shift_0245')


@pytest.fixture(scope='module')
def night_shift_patients(night_shift) -> dict[str, PatientSnapshot]:
    return replay(night_shift, END)


def test_source_lists_night_shift_and_rejects_unknown_ids():
    source = SimulatorSource()
    assert 'night_shift_0245' in [info.id for info in source.list_scenarios()]
    with pytest.raises(KeyError):
        source.load('missing_scenario')


def test_night_shift_has_twelve_patients_in_beds(night_shift):
    assert sorted(night_shift.patients) == [f'Y{n:02d}' for n in range(1, 13)]
    assert sorted(p.bed for p in night_shift.patients.values()) == [f'S-{n:02d}' for n in range(1, 13)]


def test_every_patient_arrives_by_explicit_event(night_shift):
    arrivals = {e.event.patient: e.at for e in night_shift.events if e.event.type == 'arrival'}
    assert sorted(arrivals) == sorted(night_shift.patients)
    for pid, profile in night_shift.patients.items():
        assert arrivals[pid] == profile.arrived_at


def test_y01_monitor_map_readings_match_table(night_shift_patients):
    vitals_y01 = night_shift_patients['Y01'].vitals
    assert [v.map for v in vitals_y01] == pytest.approx([92, 87.3, 80, 74, 70, 64.7, 62, 59.3], abs=0.05)
    assert vitals_y01[0].time == at('02:45')


def test_y03_monitor_feed_stops_after_0300_sample(night_shift_patients):
    assert [v.time for v in night_shift_patients['Y03'].vitals] == [at('02:45'), at('03:00')]


def test_y05_lactate_repeat_pending_and_results_at_0310(night_shift_patients):
    lactate = [lab for lab in night_shift_patients['Y05'].labs if lab.test == 'lactate']
    assert lactate[0].resulted_at == at('03:10')
    assert lactate[0].value == 4.2
    assert lactate[1].ordered_at == at('03:20')
    assert lactate[1].resulted_at is None


def test_y08_manual_and_monitor_maps_are_explicit_sbp_dbp(night_shift_patients):
    vitals_y08 = night_shift_patients['Y08'].vitals
    assert [v.source for v in vitals_y08] == ['manual', 'monitor', 'monitor']
    assert [v.map for v in vitals_y08] == pytest.approx([64, 64, 63.67], abs=0.01)


def test_noise_patients_obey_generator_constraints(night_shift_patients):
    for pid in NOISE_IDS:
        snapshot = night_shift_patients[pid]
        assert [v.time for v in snapshot.vitals] == [START + timedelta(minutes=15 * k) for k in range(8)], pid
        assert all(v.source == 'monitor' for v in snapshot.vitals), pid
        first = snapshot.vitals[0]
        for prev, cur in zip(snapshot.vitals, snapshot.vitals[1:]):
            assert abs(cur.hr - prev.hr) <= 4 and abs(cur.map - prev.map) <= 4, pid
            assert abs(cur.temp - prev.temp) <= 0.2 + 1e-9, pid
        for v in snapshot.vitals:
            assert 65 <= v.hr <= 92 and abs(v.hr - first.hr) <= 8, pid
            assert 78 <= v.map <= 100 and abs(v.map - first.map) <= 8, pid
            assert 36.3 <= v.temp <= 37.3, pid
            assert 95 <= v.spo2 <= 99 and 14 <= v.rr <= 20, pid
        results = [lab.resulted_at for lab in snapshot.labs if lab.resulted_at is not None]
        if results:
            last = max(results)
            assert any(last <= a.time <= last + timedelta(minutes=20) for a in snapshot.actions), pid
