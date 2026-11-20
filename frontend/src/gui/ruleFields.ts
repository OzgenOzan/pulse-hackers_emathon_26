import { getLanguage, t } from '../i18n';
import type { RulesView } from '../types';
import { copy } from './alarms/copy';
import { labDisplayLabel } from './clinical';

export type RuleValue = number | boolean | string | string[] | null;
type InputKind = 'integer' | 'number' | 'boolean';

export interface RuleField {
  path: string;
  label: string;
  current: RuleValue;
  baseline: RuleValue;
  input?: InputKind;
}

function member(parent: unknown, name: string): unknown {
  if (Array.isArray(parent)) return (parent as { key: string }[]).find(row => row.key === name);
  if (!parent || typeof parent !== 'object') return undefined;
  return (parent as Record<string, unknown>)[name];
}

export function writeRule(config: RulesView, path: string, value: number | boolean) {
  const parts = path.split('.');
  const leaf = parts.pop()!;
  const parent = parts.reduce<unknown>(member, config);
  (parent as Record<string, RuleValue>)[leaf] = value;
}

export function sameRuleValue(a: RuleValue | undefined, b: RuleValue) {
  return Array.isArray(a) && Array.isArray(b) ? a.length === b.length && a.every((x, i) => x === b[i]) : a === b;
}

export function displayRuleValue(path: string, value: RuleValue) {
  if (value === null || value === '') return '—';
  if (typeof value === 'boolean') return t(value ? 'gui.rules.on' : 'gui.rules.off');
  if (typeof value === 'number') return getLanguage() === 'tr' ? String(value).replace('.', ',') : String(value);
  if (Array.isArray(value)) {
    if (path === 'manual_entry.required' || path === 'status.required_fresh_vitals') {
      return value.map(name => copy.vitals.fields[name] ?? name).join(', ');
    }
    return value.join(', ');
  }
  if (path.endsWith('.param')) return copy.vitals.fields[value] ?? value;
  if (path.endsWith('.direction')) return t(`gui.rules.field.${value}`);
  if (path.endsWith('.label')) return labDisplayLabel(value);
  return value;
}

export function ruleGroups(active: RulesView, defaults: RulesView) {
  const name = (suffix: string) => t(`gui.rules.${suffix}`);
  const field = (path: string, suffix: string, input?: InputKind, prefix?: string): RuleField => {
    const parts = path.split('.');
    const current = parts.reduce<unknown>(member, active) as RuleValue;
    const baseline = parts.reduce<unknown>(member, defaults) as RuleValue;
    const label = name(suffix);
    return { path, label: prefix ? `${prefix} · ${label}` : label, current, baseline,
      input: baseline === null ? undefined : input };
  };

  return [
    { key: 'red', fields: [
      field('cycle_minutes', 'cycle'),
      field('red.threshold', 'critical', 'integer'),
      field('red.vital_max_age_minutes', 'vitalAge', 'integer'),
      field('red.critical_lab_points', 'field.criticalLabPoints', 'integer'),
      ...active.red.vital_rules.flatMap(rule => {
        const path = `red.vital_rules.${rule.key}`;
        const prefix = copy.vitals.fields[rule.param] ?? rule.param;
        return [field(`${path}.key`, 'field.key', undefined, prefix),
          field(`${path}.param`, 'field.parameter', undefined, prefix),
          field(`${path}.op`, 'field.operator', undefined, prefix),
          field(`${path}.value`, 'field.value', 'number', prefix),
          field(`${path}.points`, 'field.points', 'integer', prefix),
          field(`${path}.enabled`, 'field.enabled', 'boolean', prefix)];
      }),
      ...active.red.trend_rules.flatMap(rule => {
        const path = `red.trend_rules.${rule.key}`;
        const prefix = copy.vitals.fields[rule.param] ?? rule.param;
        return [field(`${path}.key`, 'field.key', undefined, rule.key),
          field(`${path}.param`, 'field.parameter', undefined, rule.key),
          field(`${path}.direction`, 'field.direction', undefined, rule.key),
          field(`${path}.delta`, 'field.delta', 'number', prefix),
          field(`${path}.points`, 'field.points', 'integer', rule.key)];
      }),
    ] },
    { key: 'labs', fields: [
      ...Object.entries(active.labs).flatMap(([key, lab]) => {
        const path = `labs.${key}`;
        const label = labDisplayLabel(lab.label);
        const measure = lab.unit ? `${label} (${lab.unit})` : label;
        return [field(`${path}.label`, 'field.label', undefined, key),
          field(`${path}.unit`, 'field.unit', undefined, label),
          field(`${path}.ref_low`, 'field.refLow', 'number', measure),
          field(`${path}.ref_high`, 'field.refHigh', 'number', measure),
          field(`${path}.critical_low`, 'field.criticalLow', 'number', measure),
          field(`${path}.critical_high`, 'field.criticalHigh', 'number', measure)];
      }),
      ...Object.keys(active.icd_lab_relevance).flatMap(key => [
        field(`icd_lab_relevance.${key}.icd_prefixes`, 'field.icdPrefixes', undefined, key),
        field(`icd_lab_relevance.${key}.labs`, 'field.relatedLabs', undefined, key),
      ]),
    ] },
    { key: 'panic', fields: [
      field('universal_panic.enabled', 'field.enabled', 'boolean'),
      ...(['potassium', 'ph'] as const).flatMap(key => {
        const path = `universal_panic.${key}`;
        const lab = active.labs[key];
        const label = labDisplayLabel(lab.label);
        const measure = lab.unit ? `${label} (${lab.unit})` : label;
        return [field(`${path}.critical_low`, 'field.criticalLow', 'number', measure),
          field(`${path}.critical_high`, 'field.criticalHigh', 'number', measure)];
      }),
    ] },
    { key: 'yellow', fields: [field('yellow.monitor_gap_minutes', 'monitorGap', 'integer'),
      field('yellow.vitals_overdue_minutes', 'field.vitalsOverdue', 'integer'),
      field('yellow.vitals_overdue_escalate_minutes', 'field.vitalsEscalate', 'integer')] },
    { key: 'green', fields: [field('green.idle_after_results_minutes', 'discharge', 'integer')] },
    { key: 'alerting', fields: [field('alerting.ack_cooldown_minutes', 'field.ackCooldown', 'integer'),
      field('alerting.realert_score_increase', 'field.realertIncrease', 'integer'),
      field('alerting.red_blocks_navigation', 'lock')] },
    { key: 'display', fields: [field('status.watch_min_score', 'watch', 'integer'),
      field('status.required_fresh_vitals', 'required'), field('display.gcs_fresh_minutes', 'gcsAge', 'integer')] },
    { key: 'manual', fields: [field('manual_entry.required', 'field.manualRequired'),
      ...Object.keys(active.manual_entry.limits).flatMap(key => {
        const label = copy.vitals.fields[key] ?? key;
        const kind = key === 'gcs' ? 'integer' : 'number';
        return [field(`manual_entry.limits.${key}.min`, 'field.min', kind, label),
          field(`manual_entry.limits.${key}.max`, 'field.max', kind, label)];
      })] },
  ];
}
