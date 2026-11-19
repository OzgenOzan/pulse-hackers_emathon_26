import { componentText, diagnosisLabel } from '../clinical';
import type { Component, CriticalAlarm, Role } from '../../types';
import { copy } from './copy';

export const ROLES: readonly Role[] = ['physician', 'nurse'];
export const TOP_FINDINGS = 3;

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

export function joinTr(items: string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} ve ${items[items.length - 1]}`;
}

/** Brief text: top three findings by points, "+N bulgu", the priority line, and the lab diagnosis. */
export function alarmSentence(alarm: CriticalAlarm): string {
  const ranked = rankFindings(alarm.components);
  const top = ranked.slice(0, TOP_FINDINGS).map((component, index) => {
    const text = componentText(component);
    return index === 0 ? text : text.charAt(0).toLocaleLowerCase('tr-TR') + text.slice(1);
  });
  const findings = top.length ? `${copy.panel.findings(joinTr(top), ranked.length - top.length)} ` : '';
  const isLab = alarm.components.some(component => component.key.startsWith('lab_'));
  const diagnoses = alarm.patient.working_dx.map(diagnosisLabel).join(', ');
  const lab = isLab && diagnoses ? ` · ${copy.panel.labDiagnosis(diagnoses)}` : '';
  return `${findings}${copy.panel.priority}${lab}`;
}

/** Simulated timestamps are naive ISO text; differences are still exact minutes. */
export function minutesBetween(from: string, to: string): number {
  return Math.round((Date.parse(to) - Date.parse(from)) / 60000);
}

/** Announcement key: a new alarm, or a score change, for a role that has not seen it yet. */
export function announceKey(alarm: CriticalAlarm, role: Role): string {
  return `${role}:${alarm.id}:${alarm.score}`;
}
