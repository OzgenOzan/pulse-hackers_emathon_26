import { componentText, diagnosisLabel } from '../clinical';
import type { Alert, Component, CriticalAlarm, Role } from '../../types';
import { getLanguage, t } from '../../i18n';
import { copy } from './copy';

export const ROLES: readonly Role[] = ['physician', 'nurse'];
export const TOP_FINDINGS = 3;

export function alertTitle(alert: Alert): string {
  return t(`alert.title.${alert.title_key}`, alert.params, t('patients.surface.alertFallback'));
}

/** Escalated, or the score rose since this role saw it (or since creation if never seen). */
export function isWorsenedFor(alarm: CriticalAlarm, role: Role): boolean {
  return alarm.escalated || alarm.score > (alarm.seen[role]?.score ?? alarm.initial_score);
}

/** Highest points first; ties keep the engine's order. */
export function rankFindings(components: Component[]): Component[] {
  return components
    .map((component, index) => ({ component, index }))
    .sort((a, b) => b.component.points - a.component.points || a.index - b.index)
    .map(({ component }) => component);
}

export function joinList(items: string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} ${t('alarm.list.and')} ${items[items.length - 1]}`;
}

function briefFindings(alarm: Alert) {
  const ranked = rankFindings(alarm.components);
  const top = ranked.slice(0, TOP_FINDINGS).map((component, index) => {
    const text = componentText(component);
    return index === 0 || getLanguage() !== 'tr' ? text : text.charAt(0).toLocaleLowerCase('tr-TR') + text.slice(1);
  });
  return { list: joinList(top), more: ranked.length - top.length };
}

export function previousFindingsText(alarm: Alert): string {
  const { list, more } = briefFindings(alarm);
  if (!list) return copy.previousFindings;
  return `${copy.previousFindings}: ${more ? copy.previousFindingsMore(list, more) : list}`;
}

/** Brief text: findings, the priority line, and the working diagnosis for lab alarms. */
export function alarmSentence(alarm: CriticalAlarm): string {
  let findings = '';
  if (alarm.criteria_met) {
    const { list, more } = briefFindings(alarm);
    if (list) findings = `${copy.panel.findings(list, more)} `;
  } else {
    findings = `${previousFindingsText(alarm)}. `;
  }
  const isLab = alarm.components.some(component => component.key.startsWith('lab_'));
  const diagnoses = alarm.patient.working_dx.map(diagnosisLabel).join(', ');
  const lab = isLab && diagnoses ? ` · ${copy.panel.labDiagnosis(diagnoses)}` : '';
  return `${findings}${copy.panel.priority}${lab}`;
}

/** Simulated timestamps are naive ISO text; differences are still exact minutes. */
export function minutesBetween(from: string, to: string): number {
  return Math.round((Date.parse(to) - Date.parse(from)) / 60000);
}
