"""The in-memory session. The HTTP adapter holds its lock across each operation."""

from asyncio import Lock
from collections.abc import Callable, Iterable
from datetime import datetime, timedelta

from app.adapters.simulator import DataSource, InvalidScenario
from app.domain.models import (
    AlarmSeen, Alert, AuditEntry, AuditEvent, CriticalAlarm, DisplayGcs, EngineResult, EvaluationRecord,
    GcsReading, Overview, PatientDetail, PatientSnapshot, PatientSummary, PendingConsult, PendingLab,
    PhysicianAction, RiskStatus, Role, SimStatus, StateView, VitalFreshness, VitalReading, VitalValues,
)
from app.engine.config import EngineConfig
from app.engine.evaluate import evaluate
from app.engine.lifecycle import priority_key, reconcile
from app.engine.status import classify, update_status
from app.engine.vitals import latest_vital
from app.gui_projection import UNSCORED_LAB_LABELS, latest_measurements, vital_flags
from app.sim.clock import SimClock
from app.sim.player import Frame, Player, apply_event

ACK_REASONS: dict[str, dict[str, frozenset[str] | None]] = {
    'RED': {
        'reassessing': None, 'move_to_red_zone': None, 'start_intervention': None,
        'expected_for_patient': frozenset({'chronic_baseline', 'artifact', 'already_managed'}),
    },
    # Selecting “Vitals entered” only opens the form; POSTing readings is the mutation.
    'YELLOW': {'monitor_reconnected': None, 'not_at_bed': frozenset()},
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
        self.replay_epoch = wall_now().isoformat()
        self.replay_number = 0
        self.reset('night_shift_0245')

    def reset(self, scenario_id: str) -> None:
        try:
            scenario = self.source.load(scenario_id)
        except KeyError as exc:
            raise SessionError(404, 'unknown_scenario') from exc
        except InvalidScenario as exc:
            raise SessionError(422, str(exc)) from exc
        self.replay_number += 1
        self.replay_id = f'{self.replay_epoch}/{self.replay_number}'
        self.scenario_id = scenario.id
        self.player = Player(scenario, self.config.cycle_minutes)
        self.clock = SimClock(scenario.start, scenario.end, monotonic=self.monotonic)
        self.now = scenario.start
        self.patients: dict[str, PatientSnapshot] = {}
        self.disconnected: set[str] = set()
        self.pending_reconnects: set[str] = set()
        self.alerts: list[Alert] = []
        self.critical_initial_scores: dict[str, int] = {}
        self.audit: list[AuditEntry] = []
        self.assessments: dict[str, EngineResult] = {}
        self.risk_statuses: dict[str, RiskStatus] = {}
        self.evaluations: dict[str, EvaluationRecord] = {}
        self.score_trends: dict[str, str] = {}
        self.suppressions: set[tuple[str, str, datetime, str]] = set()
        self.next_alert = 0
        self.consume(self.player.reset())

    def require_replay(self, replay_id: str | None) -> None:
        if replay_id is None:
            raise SessionError(428, 'replay_id_required')
        if replay_id != self.replay_id:
            raise SessionError(409, 'stale_replay')

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
        if frame.evaluate:
            self.disconnected.difference_update(self.pending_reconnects)
            self.pending_reconnects.clear()
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
            if alert.level == 'RED':
                self.critical_initial_scores.setdefault(alert.id, alert.score)
            self.record(change.event, patient_id, alert=alert, reason=alert.reason)
        patient.active_red = any(a.patient_id == patient_id and a.level == 'RED' and a.status == 'active' for a in self.alerts)
        if patient.status == 'in_zone':
            current = classify(patient, result, self.alerts, self.now, self.config)
            self.risk_statuses[patient_id] = update_status(current, self.risk_statuses.get(patient_id), scheduled=update_trend)

    def alert_id(self) -> str:
        self.next_alert += 1
        return f'AL-{self.next_alert:04d}'

    def record(self, event: AuditEvent, patient_id: str, *, alert: Alert | None = None,
               role: Role | None = None, action: str | None = None, reason: str | None = None,
               latency: float | None = None, note: str | None = None) -> None:
        self.audit.append(AuditEntry(
            id=f'A-{len(self.audit) + 1:04d}', sim_time=self.now, wall_time=self.wall_now(),
            patient_id=patient_id, alert_id=alert.id if alert else None,
            event=event, role=role or (alert.target_role if alert else None), action=action, reason=reason,
            latency_minutes=latency, score=alert.score if alert else None, note=note,
        ))

    def active_alerts(self, role: Role) -> list[Alert]:
        return sorted((a for a in self.alerts if a.status == 'active' and a.target_role == role), key=priority_key)

    def blocking_alert(self) -> Alert | None:
        if not self.config.alerting.red_blocks_navigation:
            return None
        return next((a for a in self.active_alerts('physician') if a.level == 'RED'), None)

    def critical_alarms(self, *, history: bool = False) -> list[CriticalAlarm]:
        alarms = sorted((a for a in self.alerts if a.level == 'RED' and (history or a.status == 'active')), key=priority_key)
        blocking_id = alarms[0].id if alarms and alarms[0].status == 'active' and self.config.alerting.red_blocks_navigation else None
        return [CriticalAlarm(
            **a.model_dump(), patient=self.patients[a.patient_id].profile,
            initial_score=self.critical_initial_scores[a.id], blocking=a.id == blocking_id,
            decision_latency_minutes=(a.closed_at - a.created_at).total_seconds() / 60
            if a.status == 'acknowledged' and a.closed_at is not None else None,
        ) for a in alarms]

    def sim_status(self) -> SimStatus:
        return SimStatus(time=self.now, playing=self.clock.playing, speed=self.clock.speed,
                         scenario_id=self.scenario_id, replay_id=self.replay_id, next_cycle_at=self.player.next_cycle_at)

    def view(self, role: Role) -> StateView:
        patients = [self.summary(p) for p in self.patients.values() if p.status == 'in_zone']
        patients.sort(key=lambda p: p.bed)
        alarms = self.critical_alarms()
        alerts = self.active_alerts(role)
        blocking = alarms[0].id if role == 'physician' and alarms and alarms[0].blocking else None
        count_by_status = {key: 0 for key in ('kritik', 'yakin_takip', 'stabil', 'siniflandirilmamis')}
        for patient in patients:
            count_by_status[patient.risk_status.key] += 1
        tasks = sorted((a for a in self.alerts if a.level != 'RED' and a.status == 'active'), key=priority_key)
        discharge = sum(a.level == 'GREEN' for a in tasks)
        pending = len(alarms) + discharge if role == 'physician' else sum(a.level == 'YELLOW' for a in alerts)
        overview = Overview(aktif=len(patients), taburculuk_bekleyen=discharge, bekleyen_islem=pending, **count_by_status)
        return StateView(sim=self.sim_status(), patients=patients, alerts=alerts, blocking_alert_id=blocking,
                         overview=overview, critical_alarms=alarms, tasks=tasks,
                         counters={'suppressed_labs': len(self.suppressions),
                                   'acknowledgements': sum(e.event == 'acknowledged' for e in self.audit)})

    def summary(self, patient: PatientSnapshot) -> PatientSummary:
        last_vitals = latest_vital(patient.vitals)
        patient_id = patient.profile.id
        recorded = self.assessments.get(patient_id)
        assessment = recorded if recorded is not None else EMPTY_ASSESSMENT
        cutoff = self.now - timedelta(minutes=self.config.red.vital_max_age_minutes)
        values: dict[str, float] = {}
        freshness: dict[str, VitalFreshness] = {}
        for param, (value, observed_at) in assessment.current_vital_evidence.items():
            values[param] = value
            freshness[param] = VitalFreshness(observed_at=observed_at, stale=observed_at < cutoff)
        current = classify(patient, recorded, self.alerts, self.now, self.config)
        risk_status = update_status(current, self.risk_statuses.get(patient_id), scheduled=False)
        if patient.gcs_history:
            reading = patient.gcs_history[-1]
            gcs = DisplayGcs(value=reading.value, observed_at=reading.observed_at,
                             stale=self.now - reading.observed_at > timedelta(minutes=self.config.display.gcs_fresh_minutes))
        else:
            gcs = None
        pending_labs = []
        for lab in patient.labs:
            if lab.resulted_at is None:
                rule = self.config.labs.get(lab.test)
                label = rule.label if rule else UNSCORED_LAB_LABELS.get(lab.test, lab.test)
                pending_labs.append(PendingLab(label=label, ordered_at=lab.ordered_at))
        pending_consults = [PendingConsult(service=r.service, requested_at=r.requested_at)
                            for r in patient.consultations if r.resulted_at is None]
        return PatientSummary(**patient.profile.model_dump(), status=patient.status,
                              minutes_in_zone=max(0, int((self.now - patient.profile.arrived_at).total_seconds() // 60)),
                              last_vitals=last_vitals,
                              current_vitals=values,
                              current_vital_freshness=freshness,
                              vitals_stale=last_vitals is None or last_vitals.time < cutoff,
                              score=assessment.score,
                              score_trend=self.score_trends.get(patient.profile.id, 'steady'),
                              intervention_started=patient.intervention_started, risk_status=risk_status, gcs=gcs,
                              pending_labs=pending_labs, pending_consults=pending_consults,
                              vital_flags=vital_flags(assessment.components, self.config.red),
                              latest_measurements=latest_measurements(patient.vitals, cutoff),
                              last_evaluation=self.evaluations.get(patient_id),
                              reconnect_pending=patient_id in self.pending_reconnects)

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

    def add_vitals(self, patient_id: str, values: VitalValues, *, gcs: int | None = None) -> None:
        entry = self.config.manual_entry
        supplied = values.model_dump(include=set(VitalValues.model_fields), exclude_none=True)
        # Diagnose invalid measurements before missing fields so a typo gets specific feedback.
        if any(not entry.limits[key].min <= value <= entry.limits[key].max for key, value in supplied.items()):
            raise SessionError(422, 'vital_out_of_range')
        if gcs is not None and not entry.limits['gcs'].min <= gcs <= entry.limits['gcs'].max:
            raise SessionError(422, 'vital_out_of_range')
        if values.sbp is not None and values.dbp is not None:
            if values.sbp <= values.dbp:
                raise SessionError(422, 'sbp_not_above_dbp')
            if values.map is not None and not values.dbp <= values.map <= values.sbp:
                raise SessionError(422, 'map_outside_bp')
        if any(key not in supplied for key in entry.required):
            raise SessionError(422, 'vital_required_missing')
        patient = self.patient(patient_id, in_zone=True)
        patient.vitals.append(VitalReading(time=self.now, source='manual', **supplied))
        if gcs is not None:
            patient.gcs_history.append(GcsReading(value=gcs, observed_at=self.now))
        self.record('manual_vitals', patient_id, role='nurse')
        self.evaluate_patient(patient)

    def physician_action(self, patient_id: str, action: str) -> None:
        self.require_navigation(patient_id, 'physician')
        if action not in {'order_placed', 'prescription_written', 'consult_requested', 'reassessed'}:
            raise SessionError(422, 'invalid_action_type')
        patient = self.patient(patient_id, in_zone=True)
        patient.actions.append(PhysicianAction(time=self.now, type=action))
        self.record('physician_action', patient_id, role='physician', action=action)
        self.evaluate_patient(patient)

    def mark_seen(self, alert_id: str, role: Role) -> None:
        alert = next((a for a in self.alerts if a.id == alert_id), None)
        if alert is None:
            raise SessionError(404, 'unknown_alert')
        if alert.level != 'RED':
            raise SessionError(422, 'seen_not_applicable')
        if role in alert.seen:
            return
        if alert.status != 'active':
            raise SessionError(409, 'alert_already_closed')
        alert.seen[role] = AlarmSeen(at=self.now, score=alert.score)
        latency = (self.now - alert.created_at).total_seconds() / 60
        self.record('seen', alert.patient_id, alert=alert, role=role, latency=latency)

    def acknowledge(self, alert_id: str, action: str, reason: str | None, *, note: str | None = None) -> None:
        alert = next((a for a in self.alerts if a.id == alert_id), None)
        if alert is None:
            raise SessionError(404, 'unknown_alert')
        if alert.status != 'active':
            raise SessionError(409, 'alert_already_closed')
        self.require_navigation(alert.patient_id, alert.target_role)
        allowed = ACK_REASONS[alert.level]
        if action not in allowed or action not in alert.recommended_actions:
            raise SessionError(422, 'invalid_alert_action')
        reasons = allowed[action]
        if reasons is None and reason is not None:
            raise SessionError(422, 'reason_not_applicable')
        if reasons is not None and (not reason or (reasons and reason not in reasons)):
            raise SessionError(422, 'valid_reason_required')
        if note is not None:
            note = note.strip() or None
        if note is not None and len(note) > 280:
            raise SessionError(422, 'note_too_long')
        patient = self.patient(alert.patient_id, in_zone=True)
        alert.status = 'acknowledged'
        alert.closed_at = self.now
        alert.updated_at = self.now
        alert.action = action
        alert.reason = reason
        alert.note = note
        latency = (self.now - alert.created_at).total_seconds() / 60
        self.record('acknowledged', alert.patient_id, alert=alert, action=action, reason=reason, latency=latency, note=note)
        if alert.level == 'RED':
            self.evaluations[alert.patient_id] = EvaluationRecord(at=self.now, decision=action)
        if alert.target_role == 'physician':
            patient.actions.append(PhysicianAction(time=self.now, type=action))
        if action == 'monitor_reconnected':
            self.pending_reconnects.add(alert.patient_id)
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
