"""The in-memory session. The HTTP adapter holds its lock across each operation."""

from asyncio import Lock
from collections.abc import Callable, Iterable
from datetime import datetime, timedelta

from app.adapters.simulator import DataSource
from app.domain.models import (
    Alert, AuditEntry, AuditEvent, EngineResult, PatientDetail, PatientSnapshot,
    PatientSummary, PhysicianAction, Role, SimStatus, StateView, VitalReading, VitalValues,
)
from app.engine.config import EngineConfig
from app.engine.evaluate import evaluate
from app.engine.lifecycle import priority_key, reconcile
from app.sim.clock import SimClock
from app.sim.player import Frame, Player, apply_event

ACK_REASONS: dict[str, dict[str, frozenset[str] | None]] = {
    'RED': {
        'reassessing': None, 'move_to_red_zone': None, 'start_intervention': None,
        'expected_for_patient': frozenset({'chronic_baseline', 'artifact', 'already_managed'}),
    },
    'YELLOW': {'monitor_reconnected': None, 'vitals_entered': None, 'not_at_bed': frozenset()},
    'GREEN': {
        'discharge_decided': None, 'prescription_written': None,
        'wait_justified': frozenset({'consult', 'imaging', 'other'}),
    },
}


class SessionError(Exception):
    def __init__(self, status_code: int, key: str):
        super().__init__(key)
        self.status_code = status_code
        self.key = key


class Session:
    def __init__(self, config: EngineConfig, source: DataSource,
                 monotonic: Callable[[], float], wall_now: Callable[[], datetime]):
        self.config = config
        self.source = source
        self.monotonic = monotonic
        self.wall_now = wall_now
        self.lock = Lock()
        self.reset('night_shift_0245')

    def reset(self, scenario_id: str) -> None:
        try:
            scenario = self.source.load(scenario_id)
        except KeyError as exc:
            raise SessionError(404, 'unknown_scenario') from exc
        self.scenario_id = scenario.id
        self.player = Player(scenario, self.config.cycle_minutes)
        self.clock = SimClock(scenario.start, scenario.end, monotonic=self.monotonic)
        self.now = scenario.start
        self.patients: dict[str, PatientSnapshot] = {}
        self.disconnected: set[str] = set()
        self.alerts: list[Alert] = []
        self.audit: list[AuditEntry] = []
        self.assessments: dict[str, EngineResult] = {}
        self.score_trends: dict[str, str] = {}
        self.suppressions: set[tuple[str, str, datetime, str]] = set()
        self.next_alert = 0
        self.consume(self.player.reset())

    def catch_up(self) -> None:
        self.advance_to(self.clock.now())

    def advance_to(self, target: datetime) -> None:
        self.consume(self.player.advance_to(target))
        self.now = target

    def consume(self, frames: Iterable[Frame]) -> None:
        for frame in frames:
            self.apply_frame(frame)

    def apply_frame(self, frame: Frame) -> None:
        self.now = frame.time
        for event in frame.events:
            apply_event(self.patients, event, frame.time, self.disconnected)
        if frame.evaluate:
            for patient in self.patients.values():
                if patient.status == 'in_zone':
                    self.evaluate_patient(patient, update_trend=True)

    def evaluate_patient(self, patient: PatientSnapshot, *, update_trend: bool = False) -> None:
        patient_id = patient.profile.id
        patient.active_red = any(a.patient_id == patient_id and a.level == 'RED' and a.status == 'active' for a in self.alerts)
        result = evaluate(patient, self.now, self.config)
        previous = self.assessments.get(patient_id)
        self.assessments[patient_id] = result
        if update_trend:
            delta = result.score - (previous.score if previous else result.score)
            self.score_trends[patient_id] = 'up' if delta > 0 else 'down' if delta < 0 else 'steady'
        for lab in result.suppressed_labs:
            key = (patient_id, lab.test, lab.observed_at, lab.reason_key)
            if key not in self.suppressions:
                self.suppressions.add(key)
                self.record('lab_suppressed', patient_id, reason=lab.reason)
        for change in reconcile(self.alerts, patient_id, result, self.now, self.config, self.alert_id):
            alert = change.alert
            self.record(change.event, patient_id, alert=alert, reason=alert.reason)
        patient.active_red = any(a.patient_id == patient_id and a.level == 'RED' and a.status == 'active' for a in self.alerts)

    def alert_id(self) -> str:
        self.next_alert += 1
        return f'AL-{self.next_alert:04d}'

    def record(self, event: AuditEvent, patient_id: str, *, alert: Alert | None = None,
               role: Role | None = None, action: str | None = None, reason: str | None = None,
               latency: float | None = None) -> None:
        self.audit.append(AuditEntry(
            id=f'A-{len(self.audit) + 1:04d}', sim_time=self.now, wall_time=self.wall_now(),
            patient_id=patient_id, alert_id=alert.id if alert else None,
            event=event, role=role or (alert.target_role if alert else None), action=action, reason=reason,
            latency_minutes=latency, score=alert.score if alert else None,
        ))

    def active_alerts(self, role: Role) -> list[Alert]:
        return sorted((a for a in self.alerts if a.status == 'active' and a.target_role == role), key=priority_key)

    def blocking_alert(self) -> Alert | None:
        if not self.config.alerting.red_blocks_navigation:
            return None
        return next((a for a in self.active_alerts('physician') if a.level == 'RED'), None)

    def sim_status(self) -> SimStatus:
        return SimStatus(time=self.now, playing=self.clock.playing, speed=self.clock.speed,
                         scenario_id=self.scenario_id, next_cycle_at=self.player.next_cycle_at)

    def view(self, role: Role) -> StateView:
        patients = [self.summary(p) for p in self.patients.values() if p.status == 'in_zone']
        patients.sort(key=lambda p: p.bed)
        blocking = self.blocking_alert() if role == 'physician' else None
        return StateView(sim=self.sim_status(), patients=patients, alerts=self.active_alerts(role),
                         blocking_alert_id=blocking.id if blocking else None,
                         counters={'suppressed_labs': len(self.suppressions),
                                   'acknowledgements': sum(e.event == 'acknowledged' for e in self.audit)})

    def summary(self, patient: PatientSnapshot) -> PatientSummary:
        last_vitals = max(patient.vitals, key=lambda reading: reading.time, default=None)
        return PatientSummary(**patient.profile.model_dump(), status=patient.status,
                              minutes_in_zone=max(0, int((self.now - patient.profile.arrived_at).total_seconds() // 60)),
                              last_vitals=last_vitals,
                              vitals_stale=(last_vitals is None or self.now - last_vitals.time >
                                            timedelta(minutes=self.config.red.vital_max_age_minutes)),
                              score=self.assessments.get(patient.profile.id, EMPTY_ASSESSMENT).score,
                              score_trend=self.score_trends.get(patient.profile.id, 'steady'),
                              intervention_started=patient.intervention_started)

    def patient(self, patient_id: str, *, in_zone: bool = False) -> PatientSnapshot:
        patient = self.patients.get(patient_id)
        if patient is None or (in_zone and patient.status != 'in_zone'):
            raise SessionError(404, 'unknown_patient')
        return patient

    def require_navigation(self, patient_id: str, role: Role) -> None:
        blocking = self.blocking_alert() if role == 'physician' else None
        if blocking is not None and blocking.patient_id != patient_id:
            raise SessionError(409, 'red_navigation_blocked')

    def detail(self, patient_id: str, role: Role) -> PatientDetail:
        self.require_navigation(patient_id, role)
        patient = self.patient(patient_id)
        return PatientDetail(**patient.model_dump(),
                             assessment=self.assessments.get(patient_id, EMPTY_ASSESSMENT),
                             alert_history=[a for a in self.alerts if a.patient_id == patient_id])

    def add_vitals(self, patient_id: str, values: VitalValues) -> None:
        if not any(value is not None for value in values.model_dump().values()):
            raise SessionError(422, 'no_vitals_entered')
        patient = self.patient(patient_id, in_zone=True)
        patient.vitals.append(VitalReading(time=self.now, source='manual', **values.model_dump()))
        self.record('manual_vitals', patient_id, role='nurse')
        self.evaluate_patient(patient)

    def physician_action(self, patient_id: str, action: str) -> None:
        self.require_navigation(patient_id, 'physician')
        patient = self.patient(patient_id, in_zone=True)
        patient.actions.append(PhysicianAction(time=self.now, type=action))
        self.record('physician_action', patient_id, role='physician', action=action)
        self.evaluate_patient(patient)

    def acknowledge(self, alert_id: str, action: str, reason: str | None) -> None:
        alert = next((a for a in self.alerts if a.id == alert_id), None)
        if alert is None:
            raise SessionError(404, 'unknown_alert')
        if alert.status != 'active':
            raise SessionError(409, 'alert_already_closed')
        self.require_navigation(alert.patient_id, alert.target_role)
        allowed = ACK_REASONS[alert.level]
        if action not in allowed:
            raise SessionError(422, 'invalid_alert_action')
        reasons = allowed[action]
        if reasons is None and reason is not None:
            raise SessionError(422, 'reason_not_applicable')
        if reasons is not None and (not reason or (reasons and reason not in reasons)):
            raise SessionError(422, 'valid_reason_required')
        patient = self.patient(alert.patient_id, in_zone=True)
        alert.status = 'acknowledged'
        alert.closed_at = self.now
        alert.updated_at = self.now
        alert.action = action
        alert.reason = reason
        latency = (self.now - alert.created_at).total_seconds() / 60
        self.record('acknowledged', alert.patient_id, alert=alert, action=action, reason=reason, latency=latency)
        patient.actions.append(PhysicianAction(time=self.now, type=action))
        if action == 'monitor_reconnected':
            self.disconnected.discard(alert.patient_id)
        elif action == 'start_intervention':
            patient.intervention_started = True
        elif action in {'move_to_red_zone', 'discharge_decided'}:
            patient.status = 'transferred_red' if action == 'move_to_red_zone' else 'discharged'
            self.record('status_changed', alert.patient_id, alert=alert, action=action, reason=patient.status)
            for pending in self.alerts:
                if pending.patient_id == alert.patient_id and pending.status == 'active':
                    pending.status = 'auto_resolved'
                    pending.closed_at = self.now
                    pending.updated_at = self.now
                    pending.reason = 'patient_left_zone'
                    self.record('auto_resolved', alert.patient_id, alert=pending, reason=pending.reason)
        self.evaluate_patient(patient)


EMPTY_ASSESSMENT = EngineResult()
