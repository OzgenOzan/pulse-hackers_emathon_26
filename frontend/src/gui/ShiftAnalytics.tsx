import { ACTIONS } from '../alertActions';
import { getLanguage, t } from '../i18n';
import type { AuditEntry, Role } from '../types';
import './ShiftAnalytics.css';

/** The four RED acknowledgement actions; each one records a clinical evaluation. */
const RED_ACTIONS: ReadonlySet<string> = new Set(ACTIONS.RED.map(spec => spec.action));

type RoleBucket = Role | 'none';

interface Tally {
  seen: number;
  evaluated: number;
  suppressed: number;
  byRole: Record<RoleBucket, number>;
}

function tally(entries: AuditEntry[]): Tally {
  const result: Tally = { seen: 0, evaluated: 0, suppressed: 0, byRole: { physician: 0, nurse: 0, none: 0 } };
  for (const entry of entries) {
    if (entry.event === 'seen') result.seen += 1;
    else if (entry.event === 'lab_suppressed') result.suppressed += 1;
    else if (entry.event === 'acknowledged' && entry.action !== null && RED_ACTIONS.has(entry.action)) result.evaluated += 1;
    result.byRole[entry.role ?? 'none'] += 1;
  }
  return result;
}

function Stat({ testId, value, label, hint }: { testId: string; value: string; label: string; hint: string }) {
  return <li className="analytics-stat" data-testid={testId}>
    <span className="analytics-value">{value}</span>
    <span className="analytics-label">{label}</span>
    <span className="analytics-hint">{hint}</span>
  </li>;
}

export function ShiftAnalytics({ entries }: { entries: AuditEntry[] | null }) {
  const titleId = 'analytics-title';
  if (entries === null) {
    return <section className="shift-analytics" aria-labelledby={titleId}>
      <h2 id={titleId}>{t('analytics.title')}</h2>
      <p role="status">{t('analytics.loading')}</p>
    </section>;
  }

  const counts = tally(entries);
  const numbers = new Intl.NumberFormat(getLanguage() === 'en' ? 'en-US' : 'tr-TR');
  const roles: { key: RoleBucket; label: string }[] = [
    { key: 'physician', label: t('app.role.physician') },
    { key: 'nurse', label: t('app.role.nurse') },
    { key: 'none', label: t('analytics.roleNone') },
  ];
  const largest = Math.max(1, ...Object.values(counts.byRole));

  return <section className="shift-analytics" aria-labelledby={titleId}>
    <h2 id={titleId}>{t('analytics.title')}</h2>
    <p className="analytics-note">{t('analytics.note')}</p>
    <ul className="analytics-stats">
      <Stat testId="stat-seen" value={numbers.format(counts.seen)} label={t('analytics.seen')} hint={t('analytics.seenHint')} />
      <Stat testId="stat-evaluated" value={numbers.format(counts.evaluated)} label={t('analytics.evaluated')} hint={t('analytics.evaluatedHint')} />
      <Stat testId="stat-suppressed" value={numbers.format(counts.suppressed)} label={t('analytics.suppressed')} hint={t('analytics.suppressedHint')} />
    </ul>
    <section className="analytics-panel" aria-labelledby="analytics-roles-title">
      <h3 id="analytics-roles-title">{t('analytics.byRole')}</h3>
      {entries.length === 0 ? <p>{t('audit.empty')}</p> : <>
        <p className="analytics-note">{t('analytics.byRoleNote')}</p>
        <ul className="analytics-bars">
          {roles.map(({ key, label }) => {
            const count = counts.byRole[key];
            return <li key={key} className="analytics-bar">
              <span>{label}</span>
              <span className="analytics-count">{numbers.format(count)}</span>
              <span className="analytics-track" aria-hidden="true">
                <span className="analytics-fill" style={{ width: `${(count / largest) * 100}%` }} />
              </span>
            </li>;
          })}
        </ul>
      </>}
    </section>
  </section>;
}
