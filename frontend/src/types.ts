export type Level = 'RED' | 'YELLOW' | 'GREEN';
export type Role = 'physician' | 'nurse';
export type Status = 'in_zone' | 'transferred_red' | 'discharged';
export type Speed = 30 | 60 | 120;
export type Language = 'en' | 'tr';
export type RiskKey = 'kritik' | 'yakin_takip' | 'siniflandirilmamis' | 'stabil';
export type OverviewKey = RiskKey | 'aktif' | 'taburculuk_bekleyen' | 'bekleyen_islem';
export interface RiskReason { key: string; params: Record<string, string | number> }
export interface RiskStatus { key: RiskKey; reasons: RiskReason[]; data_issues: RiskReason[]; since: string; worsened: boolean }
export interface PatientDisplay { name: string; protocol: string; complaint: string; nurse: string; physician: string }
export interface GcsReading { value: number; observed_at: string }
export interface Consultation { service: string; requested_at: string; resulted_at: string | null }
export interface DisplayMeasurement { value: number; observed_at: string; stale: boolean; source: 'monitor' | 'manual' }
export interface VitalFlag { level: 'kritik' | 'yakin_takip'; note: string }
export type ManualValues = VitalValues & { gcs?: number | null };

export interface Diagnosis { code: string; text: string }
export interface Profile {
  id: string; bed: string; label: string; age: number; sex: 'M' | 'F';
  arrived_at: string; monitored: boolean; working_dx: Diagnosis[];
  display: PatientDisplay | null;
}
export interface VitalValues {
  hr?: number | null; sbp?: number | null; dbp?: number | null; map?: number | null;
  temp?: number | null; spo2?: number | null; rr?: number | null;
}
export interface VitalReading extends VitalValues { time: string; source: 'monitor' | 'manual' }
export interface Summary extends Profile {
  status: Status; minutes_in_zone: number; last_vitals: VitalReading | null; vitals_stale: boolean;
  current_vitals: VitalValues;
  current_vital_freshness: Partial<Record<keyof VitalValues, { observed_at: string; stale: boolean }>>;
  score: number; score_trend: 'up' | 'down' | 'steady'; intervention_started: boolean;
  risk_status: RiskStatus;
  gcs: (GcsReading & { stale: boolean }) | null;
  pending_labs: { label: string; ordered_at: string }[];
  pending_consults: { service: string; requested_at: string }[];
  vital_flags: Partial<Record<keyof VitalValues, VitalFlag>>;
  latest_measurements: Partial<Record<keyof VitalValues, DisplayMeasurement>>;
  last_evaluation: { at: string; decision: string } | null;
  reconnect_pending: boolean;
}
export interface LabOrder { test: string; ordered_at: string; resulted_at: string | null; value: number | null; unit: string | null }
export interface PhysicianAction { time: string; type: string }
export interface Component {
  key: string; label: string; value: number; unit: string; rule: string; points: number; observed_at: string;
}
export interface SuppressedLab { test: string; value: number; unit: string; reason: string; reason_key: string; observed_at: string }
export interface Candidate {
  level: Level; target_role: Role; title_key: string; params: Record<string, string | number | boolean>;
  recommended_actions: string[]; components: Component[]; escalated: boolean;
}
export interface Alert extends Candidate {
  id: string; patient_id: string; score: number; created_at: string; updated_at: string;
  status: 'active' | 'acknowledged' | 'auto_resolved' | 'superseded'; criteria_met: boolean;
  closed_at: string | null; action: string | null; reason: string | null;
  seen: Partial<Record<Role, { at: string; score: number }>>;
  note: string | null;
}
export interface CriticalAlarm extends Alert {
  initial_score: number; blocking: boolean; decision_latency_minutes: number | null; patient: Profile;
}
export interface EngineResult { score: number; components: Component[]; suppressed_labs: SuppressedLab[]; candidates: Candidate[] }
export interface Detail {
  profile: Profile; vitals: VitalReading[]; labs: LabOrder[]; actions: PhysicianAction[]; status: Status;
  active_red: boolean; intervention_started: boolean; assessment: EngineResult; alert_history: Alert[];
  gcs_history: GcsReading[]; consultations: Consultation[];
}
export interface SimStatus { time: string; playing: boolean; speed: Speed; scenario_id: string; replay_id: string; next_cycle_at: string | null }
export interface State {
  sim: SimStatus; patients: Summary[]; alerts: Alert[]; blocking_alert_id: string | null;
  counters: { suppressed_labs: number; acknowledgements: number };
  overview: Record<OverviewKey, number>; critical_alarms: CriticalAlarm[]; tasks: Alert[];
}
export interface AuditEntry {
  id: string; sim_time: string; wall_time: string; patient_id: string; alert_id: string | null;
  event: string; role: Role | null; action: string | null; reason: string | null; latency_minutes: number | null; score: number | null;
  note: string | null;
}
export interface ScenarioInfo { id: string; title: string; error: string | null }
export interface RulesView {
  cycle_minutes: number;
  red: {
    threshold: number; vital_max_age_minutes: number; critical_lab_points: number;
    vital_rules: { key: string; param: keyof VitalValues; op: string; value: number; points: number; enabled: boolean }[];
    trend_rules: { key: string; param: keyof VitalValues; direction: 'up' | 'down'; delta: number; points: number }[];
  };
  yellow: { monitor_gap_minutes: number; vitals_overdue_minutes: number; vitals_overdue_escalate_minutes: number };
  green: { idle_after_results_minutes: number };
  alerting: { red_blocks_navigation: boolean; ack_cooldown_minutes: number; realert_score_increase: number };
  manual_entry: { required: (keyof VitalValues)[]; limits: Record<keyof ManualValues, {min: number; max: number}> };
  labs: Record<string, {
    label: string; unit: string; ref_low: number | null; ref_high: number | null;
    critical_low: number | null; critical_high: number | null;
  }>;
  status: { watch_min_score: number; required_fresh_vitals: (keyof VitalValues)[] };
  display: { gcs_fresh_minutes: number };
}
