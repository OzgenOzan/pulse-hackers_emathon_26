import type { Alert, Level, Role, Summary } from './types';

const RANK: Record<Level, number> = { GREEN: 1, YELLOW: 2, RED: 3 };

export function orderBoardRows(patients: Summary[], alerts: Alert[], role: Role) {
  const levels = new Map<string, Level>();
  for (const alert of alerts) {
    if (alert.target_role !== role || alert.status !== 'active') continue;
    const previous = levels.get(alert.patient_id);
    if (!previous || RANK[alert.level] > RANK[previous]) levels.set(alert.patient_id, alert.level);
  }
  return patients
    .map(p => ({ p, level: levels.get(p.id) }))
    .sort((a, b) => (b.level ? RANK[b.level] : 0) - (a.level ? RANK[a.level] : 0) || b.p.score - a.p.score);
}
