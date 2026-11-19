"""Canonical data passed between simulation, evaluation, and API."""

from datetime import datetime
from math import isfinite
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, StrictInt, model_validator

Level = Literal['RED', 'YELLOW', 'GREEN']
Role = Literal['physician', 'nurse']
PatientStatus = Literal['in_zone', 'transferred_red', 'discharged']
RiskKey = Literal['kritik', 'yakin_takip', 'siniflandirilmamis', 'stabil']
AlertEvent = Literal['created', 'updated', 'escalated', 'acknowledged', 'auto_resolved', 'superseded']
AuditEvent = Literal[
    'created', 'updated', 'escalated', 'acknowledged', 'auto_resolved', 'superseded',
    'lab_suppressed', 'status_changed', 'manual_vitals', 'physician_action',
    'seen',
]


class Model(BaseModel):
    model_config = ConfigDict(extra='forbid', allow_inf_nan=False)


class Diagnosis(Model):
    code: str
    text: str


class PatientDisplay(Model):
    name: str
    protocol: str
    complaint: str
    nurse: str
    physician: str


class PatientProfile(Model):
    id: str
    bed: str
    label: str
    age: int
    sex: Literal['M', 'F']
    arrived_at: datetime
    monitored: bool
    working_dx: list[Diagnosis]
    display: PatientDisplay | None = None


class VitalValues(Model):
    hr: float | None = None
    sbp: float | None = None
    dbp: float | None = None
    map: float | None = None
    temp: float | None = None
    spo2: float | None = None
    rr: float | None = None

    @model_validator(mode='after')
    def derive_map(self):
        if self.map is None and self.sbp is not None and self.dbp is not None:
            difference = self.sbp - self.dbp
            self.map = (self.dbp + difference / 3 if isfinite(difference)
                        else self.sbp / 3 + (self.dbp / 3) * 2)
            if not isfinite(self.map):
                raise ValueError('calculated MAP is not finite')
        return self


class VitalReading(VitalValues):
    time: datetime
    source: Literal['monitor', 'manual']


class LabOrder(Model):
    test: str
    ordered_at: datetime
    resulted_at: datetime | None = None
    value: float | None = None
    unit: str | None = None


class PhysicianAction(Model):
    time: datetime
    type: str


class GcsReading(Model):
    value: StrictInt = Field(ge=3, le=15)
    observed_at: datetime


class Consultation(Model):
    service: str
    requested_at: datetime
    resulted_at: datetime | None = None


class PatientSnapshot(Model):
    profile: PatientProfile
    vitals: list[VitalReading] = Field(default_factory=list)
    labs: list[LabOrder] = Field(default_factory=list)
    actions: list[PhysicianAction] = Field(default_factory=list)
    status: PatientStatus = 'in_zone'
    active_red: bool = False
    intervention_started: bool = False
    gcs_history: list[GcsReading] = Field(default_factory=list)
    consultations: list[Consultation] = Field(default_factory=list)


class Component(Model):
    key: str
    label: str
    value: float
    unit: str
    rule: str
    points: int
    observed_at: datetime


class SuppressedLab(Model):
    test: str
    value: float
    unit: str
    reason: str
    reason_key: str
    observed_at: datetime


class AlertCandidate(Model):
    level: Level
    target_role: Role
    title_key: str
    params: dict[str, Any] = Field(default_factory=dict)
    recommended_actions: list[str] = Field(default_factory=list)
    components: list[Component] = Field(default_factory=list)
    escalated: bool = False


class RiskReason(Model):
    key: str
    params: dict[str, str | int | float] = Field(default_factory=dict)


class RiskStatus(Model):
    key: RiskKey
    reasons: list[RiskReason]
    data_issues: list[RiskReason]
    since: datetime
    worsened: bool = False


class EngineResult(Model):
    score: int = 0
    components: list[Component] = Field(default_factory=list)
    suppressed_labs: list[SuppressedLab] = Field(default_factory=list)
    candidates: list[AlertCandidate] = Field(default_factory=list)
    current_vital_evidence: dict[str, tuple[float, datetime]] = Field(default_factory=dict, exclude=True)


class AlarmSeen(Model):
    at: datetime
    score: int


class Alert(AlertCandidate):
    id: str
    patient_id: str
    score: int
    created_at: datetime
    updated_at: datetime
    status: Literal['active', 'acknowledged', 'auto_resolved', 'superseded'] = 'active'
    criteria_met: bool = True
    realerted: bool = Field(default=False, exclude=True)
    closed_at: datetime | None = None
    action: str | None = None
    reason: str | None = None
    seen: dict[Role, AlarmSeen] = Field(default_factory=dict)
    note: str | None = None


class CriticalAlarm(Alert):
    patient: PatientProfile
    initial_score: int
    blocking: bool
    decision_latency_minutes: float | None = None


class AlertChange(Model):
    event: AlertEvent
    alert: Alert


class AuditEntry(Model):
    id: str
    sim_time: datetime
    wall_time: datetime
    patient_id: str
    alert_id: str | None = None
    event: AuditEvent
    role: Role | None = None
    action: str | None = None
    reason: str | None = None
    latency_minutes: float | None = None
    score: int | None = None
    note: str | None = None


class VitalFreshness(Model):
    observed_at: datetime
    stale: bool


class DisplayMeasurement(VitalFreshness):
    value: float
    source: Literal['monitor', 'manual']


class DisplayGcs(GcsReading):
    stale: bool


class PendingLab(Model):
    label: str
    ordered_at: datetime


class PendingConsult(Model):
    service: str
    requested_at: datetime


class VitalFlag(Model):
    level: Literal['kritik', 'yakin_takip']
    note: str


class EvaluationRecord(Model):
    at: datetime
    decision: str


class PatientSummary(PatientProfile):
    status: PatientStatus
    minutes_in_zone: int
    last_vitals: VitalReading | None
    current_vitals: dict[str, float]
    current_vital_freshness: dict[str, VitalFreshness]
    vitals_stale: bool
    score: int
    score_trend: Literal['up', 'down', 'steady']
    intervention_started: bool
    risk_status: RiskStatus
    gcs: DisplayGcs | None
    pending_labs: list[PendingLab]
    pending_consults: list[PendingConsult]
    vital_flags: dict[str, VitalFlag]
    latest_measurements: dict[str, DisplayMeasurement]
    last_evaluation: EvaluationRecord | None
    reconnect_pending: bool


class PatientDetail(PatientSnapshot):
    assessment: EngineResult
    alert_history: list[Alert]


class SimStatus(Model):
    time: datetime
    playing: bool
    speed: int
    scenario_id: str
    replay_id: str
    next_cycle_at: datetime | None


class Overview(Model):
    aktif: int
    kritik: int
    yakin_takip: int
    stabil: int
    siniflandirilmamis: int
    taburculuk_bekleyen: int
    bekleyen_islem: int


class StateView(Model):
    sim: SimStatus
    patients: list[PatientSummary]
    alerts: list[Alert]
    blocking_alert_id: str | None
    counters: dict[str, int]
    overview: Overview
    critical_alarms: list[CriticalAlarm]
    tasks: list[Alert]
