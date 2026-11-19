import { fmtTime } from '../../format';
import { t } from '../../i18n';
import type { Alert, Component, Profile, RiskKey, RulesView, Summary, VitalFlag } from '../../types';
import { componentText, measurement, reasonLabel } from '../clinical';
import { copy } from './copy';

/** Display-only per-field reading from the payload. */
export interface Reading {
  value: number;
  observed_at: string;
  stale: boolean;
}

export type VitalState =
  | { kind: 'value'; text: string }
  | { kind: 'stale'; time: string }
  | { kind: 'missing'; text: string };

export interface VitalCell {
  key: string;
  label: string;
  unit: string;
  state: VitalState;
  flags: VitalFlag[];
  sub?: string;
}

const RISK_RANK: Record<RiskKey, number> = { stabil: 0, siniflandirilmamis: 1, yakin_takip: 2, kritik: 3 };

/** Kritik, Yakın Takip, Sınıflandırılmamış, Stabil; then newly worsened, score, time in ED, bed. */
export function compareRisk(a: Summary, b: Summary): number {
  return RISK_RANK[b.risk_status.key] - RISK_RANK[a.risk_status.key]
    || Number(b.risk_status.worsened) - Number(a.risk_status.worsened)
    || b.score - a.score
    || b.minutes_in_zone - a.minutes_in_zone
    || a.bed.localeCompare(b.bed, 'tr', { numeric: true });
}

export function displayName(p: Profile): string {
  return p.display?.name ?? p.label;
}

export function protocolOf(p: Profile): string {
  return p.display?.protocol ?? '-';
}

export function complaintOf(p: Profile): string | null {
  return p.display?.complaint || null;
}

export function ageSex(p: Profile): string {
  return `${p.age} · ${copy.sex[p.sex]}`;
}

/** Engine action key in Turkish; empty when no copy exists, so a raw key is never printed. */
export function actionLabel(key: string): string | null {
  return t(`action.${key}`, undefined, '') || null;
}

function evaluationText(evaluation: { at: string; decision: string }): string {
  const decision = actionLabel(evaluation.decision);
  const when = copy.evaluatedAt(fmtTime(evaluation.at));
  return decision ? `${when} · ${decision}` : when;
}

export function statusSublabel(p: Summary): string | undefined {
  if (p.risk_status.key !== 'kritik' || !p.last_evaluation) return undefined;
  return evaluationText(p.last_evaluation);
}

export function lastEvaluationText(p: Summary): string {
  return p.last_evaluation ? evaluationText(p.last_evaluation) : copy.noEvaluation;
}

/** Sim-local time and source of the newest reading; the caller supplies the label. */
export function lastMeasureText(p: Summary): string {
  const last = p.last_vitals;
  return last ? `${fmtTime(last.time)} · ${t(`vitals.source.${last.source}`)}` : copy.noMeasure;
}

/** Catalog label first, then the rules label for scored labs; never a raw test key. */
export function testLabel(test: string, config: RulesView | null): string {
  return t(`lab.${test}`, undefined, '') || config?.labs[test]?.label || copy.unknownTest;
}

export function suppressionText(reasonKey: string): string {
  return t(`suppression.${reasonKey}`, undefined, copy.suppressedFallback);
}

export function alertTitle(alert: Alert): string {
  return t(`alert.title.${alert.title_key}`, alert.params, copy.alertFallback);
}

export function alertStatusText(status: Alert['status']): string {
  switch (status) {
    case 'active': return copy.alertOpen;
    case 'acknowledged': return t('event.acknowledged');
    case 'auto_resolved': return t('event.auto_resolved');
    case 'superseded': return t('event.superseded');
  }
}

/** Physician decision and reason for a closed alert; null while the alert is open. */
export function decisionText(alert: Alert): string | null {
  if (!alert.action) return null;
  const action = actionLabel(alert.action);
  const reason = alert.reason ? t(`reason.${alert.reason}`, undefined, '') : '';
  return [action, reason].filter(Boolean).join(' · ') || null;
}

export function componentFinding(c: Component): string {
  if (c.key === 'results_idle') return `${copy.resultsIdle} · ${c.value} dk`;
  if (c.key === 'monitor_gap' || c.key === 'vitals_overdue') {
    return reasonLabel({ key: c.key, params: { minutes: c.value } });
  }
  return componentText(c);
}

const VALUE_KINDS: Record<string, string> = { temp_high: 'temp', lab_ph: 'ph' };
const UNITS: Record<string, string> = { bpm: '/dk', min: 'dk' };

export function componentValue(c: Component): string {
  const kind = VALUE_KINDS[c.key] ?? (c.key.startsWith('lab_') ? 'lab' : '');
  const value = measurement(c.value, kind);
  const unit = UNITS[c.unit] ?? c.unit;
  return unit ? `${value} ${unit}` : value;
}

function fmtInt(value: number): string {
  return measurement(value, '');
}

/** Stale and missing are distinct: a stale value keeps its time, a never-measured field says so. */
function missing(noPatientData: boolean): VitalState {
  return { kind: 'missing', text: noPatientData ? copy.noData : copy.notMeasured };
}

function single(
  reading: Reading | undefined,
  offline: boolean,
  noPatientData: boolean,
  format: (value: number) => string,
): VitalState {
  if (!reading) return missing(noPatientData);
  if (offline || reading.stale) return { kind: 'stale', time: fmtTime(reading.observed_at) };
  return { kind: 'value', text: format(reading.value) };
}

/** A pair is normal only when both fields are present and fresh; any gap or stale field keeps it out of the normal style. */
function pair(sbp: Reading | undefined, dbp: Reading | undefined, offline: boolean, noPatientData: boolean): VitalState {
  if (!sbp || !dbp) {
    const present = sbp ?? dbp;
    if (!present) return missing(noPatientData);
    return offline || present.stale
      ? { kind: 'stale', time: fmtTime(present.observed_at) }
      : { kind: 'missing', text: copy.partial };
  }
  if (offline || sbp.stale || dbp.stale) {
    const older = sbp.observed_at <= dbp.observed_at ? sbp : dbp;
    return { kind: 'stale', time: fmtTime(older.observed_at) };
  }
  return { kind: 'value', text: `${fmtInt(sbp.value)}/${fmtInt(dbp.value)}` };
}

export function describeState(state: VitalState, unit = ''): string {
  if (state.kind === 'value') return unit ? `${state.text} ${unit}` : state.text;
  if (state.kind === 'stale') return `${copy.stale} · ${state.time}`;
  return state.text;
}

function flagsOf(...flags: (VitalFlag | undefined)[]): VitalFlag[] {
  const seen = new Set<string>();
  const out: VitalFlag[] = [];
  for (const flag of flags) {
    if (flag && !seen.has(flag.note)) {
      seen.add(flag.note);
      out.push(flag);
    }
  }
  return out;
}

/** Six display cells from the per-field payload; flags come only from the scored vital components. */
export function vitalCells(p: Summary, offline: boolean): VitalCell[] {
  const m = p.latest_measurements;
  const flags = p.vital_flags;
  const noPatientData = Object.keys(m).length === 0 && !p.gcs;
  const map = single(m.map, offline, noPatientData, fmtInt);
  return [
    {
      key: 'bp',
      label: copy.vital.bp,
      unit: 'mmHg',
      state: pair(m.sbp, m.dbp, offline, noPatientData),
      flags: flagsOf(flags.sbp, flags.dbp, flags.map),
      sub: `${copy.oab} ${describeState(map)}`,
    },
    { key: 'hr', label: copy.vital.hr, unit: '/dk', state: single(m.hr, offline, noPatientData, fmtInt), flags: flagsOf(flags.hr) },
    { key: 'spo2', label: copy.vital.spo2, unit: '%', state: single(m.spo2, offline, noPatientData, fmtInt), flags: flagsOf(flags.spo2) },
    { key: 'rr', label: copy.vital.rr, unit: '/dk', state: single(m.rr, offline, noPatientData, fmtInt), flags: flagsOf(flags.rr) },
    {
      key: 'temp',
      label: copy.vital.temp,
      unit: '°C',
      state: single(m.temp, offline, noPatientData, v => measurement(v, 'temp')),
      flags: flagsOf(flags.temp),
    },
    { key: 'gcs', label: copy.vital.gcs, unit: '/15', state: single(p.gcs ?? undefined, offline, noPatientData, fmtInt), flags: [] },
  ];
}
