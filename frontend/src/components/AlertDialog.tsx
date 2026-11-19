import { useEffect, useId, useRef, useState } from 'react';
import { ACTIONS } from '../alertActions';
import { fmtTime } from '../format';
import { ruleLabel, t } from '../i18n';
import type { Alert, Component, Level, Role, Summary, VitalReading } from '../types';
import { VitalTrends } from './VitalTrends';

export type ActAlert = (alert: Alert, action: string, reason?: string) => Promise<void> | void;

export function LevelChip({ level }: { level: Level }) {
  const icon = level === 'RED' ? '▲' : level === 'YELLOW' ? '◆' : '●';
  return (
    <span className={`chip chip-${level.toLowerCase()}`}>
      <span aria-hidden="true">{icon}</span>
      {t(`level.${level}`)}
    </span>
  );
}

export function EscalatedTag({ escalated }: { escalated: boolean }) {
  if (!escalated) return null;
  return (
    <span className="escalated" data-testid="escalated-tag">
      <span aria-hidden="true">⇧</span>
      {t('alert.escalated')}
    </span>
  );
}

export function LatchedNote({ alert }: { alert: Alert }) {
  if (alert.criteria_met || alert.status !== 'active') return null;
  return (
    <p className="latched" role="status">
      {t('alert.latched')}
    </p>
  );
}

export function alertTitle(alert: Alert): string {
  if (alert.level === 'RED' && !alert.criteria_met) return t('alert.previousRed');
  return t(`alert.title.${alert.title_key}`, alert.params);
}

export function ComponentTable({ components, empty }: { components: Component[]; empty: string }) {
  if (components.length === 0) return <p>{empty}</p>;
  return (
    <table className="data">
      <thead>
        <tr>
          <th>{t('table.component')}</th>
          <th>{t('table.value')}</th>
          <th>{t('table.rule')}</th>
          <th>{t('table.points')}</th>
        </tr>
      </thead>
      <tbody>
        {components.map(c => (
          <tr key={c.key}>
            <td>{t(`component.${c.key}`, undefined, c.label)}</td>
            <td>
              {c.value} {c.unit}
            </td>
            <td>{ruleLabel(c)}</td>
            <td>{c.points}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ReasonAction({
  alert,
  action,
  reasons,
  busy,
  onAct,
  testPrefix,
}: {
  alert: Alert;
  action: string;
  reasons: readonly string[];
  busy: boolean;
  onAct: ActAlert;
  testPrefix: string;
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  return (
    <div className="reason-group">
      <button
        type="button"
        className="action"
        data-testid={`${testPrefix}action-${action}`}
        aria-expanded={open}
        aria-controls={panelId}
        disabled={busy}
        onClick={() => setOpen(o => !o)}
      >
        {t(`action.${action}`)}
      </button>
      {open && (
        <div id={panelId} role="group" aria-label={t('reason.choose')} className="reasons">
          {reasons.map(r => (
            <button
              key={r}
              type="button"
              className="reason"
              data-testid={`${testPrefix}reason-${r}`}
              disabled={busy}
              onClick={() => onAct(alert, action, r)}
            >
              {t(`reason.${r}`)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Level-specific action matrix. Reason-bearing actions take two taps: open the reasons, then pick one. */
export function AlertActions({
  alert,
  busy,
  onAct,
  onEnterVitals,
  testPrefix = '',
}: {
  alert: Alert;
  busy: boolean;
  onAct: ActAlert;
  onEnterVitals?: (patientId: string) => void;
  testPrefix?: string;
}) {
  return (
    <div className="actions" role="group" aria-label={t('actions.group')}>
      {ACTIONS[alert.level].map(spec => {
        if (!alert.recommended_actions.includes(spec.action)) return null;
        if (spec.action === 'vitals_entered') {
          return onEnterVitals ? (
            <button
              key={spec.action}
              type="button"
              className="action"
              data-testid={`${testPrefix}action-vitals_entered`}
              disabled={busy}
              onClick={() => onEnterVitals(alert.patient_id)}
            >
              {t('action.vitals_entered')}
            </button>
          ) : null;
        }
        if (spec.reasons) {
          return (
            <ReasonAction
              key={spec.action}
              alert={alert}
              action={spec.action}
              reasons={spec.reasons}
              busy={busy}
              onAct={onAct}
              testPrefix={testPrefix}
            />
          );
        }
        return (
          <button
            key={spec.action}
            type="button"
            className="action"
            data-testid={`${testPrefix}action-${spec.action}`}
            disabled={busy}
            onClick={() => onAct(alert, spec.action)}
          >
            {t(`action.${spec.action}`)}
          </button>
        );
      })}
    </div>
  );
}

/** Full-screen blocking dialog. Backdrop clicks are refused; the panel itself does not propagate them. */
export function RedDialog({
  alert,
  summary,
  readings,
  threshold,
  index,
  total,
  busy,
  onAct,
  onBackdrop,
}: {
  alert: Alert;
  summary: Summary | undefined;
  readings?: VitalReading[];
  threshold: number | null;
  index: number;
  total: number;
  busy: boolean;
  onAct: ActAlert;
  onBackdrop: () => void;
}) {
  const sectionRef = useRef<HTMLElement>(null);
  useEffect(() => {
    sectionRef.current?.querySelector<HTMLButtonElement>('button')?.focus();
  }, []);

  const who = summary ? `${summary.label} · ${summary.bed} · ${summary.age}${t(`sex.${summary.sex}`)}` : alert.patient_id;
  return (
    <div className="overlay" onClick={onBackdrop}>
      <section
        ref={sectionRef}
        aria-labelledby="red-title"
        data-blocking-allowed
        className="red-dialog"
        onClick={e => e.stopPropagation()}
      >
        <div className="red-head">
          <LevelChip level="RED" />
          <EscalatedTag escalated={alert.escalated} />
          <h2 id="red-title">{t('alert.redHeading')}</h2>
          <span>
            {t('alert.queueLabel')}: {t('alert.queueCount', { index, total })}
          </span>
        </div>
        <p className="red-patient">{who}</p>
        <p className="red-text">{alertTitle(alert)}</p>
        <LatchedNote alert={alert} />
        <p>
          {t(alert.criteria_met ? 'alert.score' : 'alert.currentScore',
            { score: alert.score, threshold: threshold ?? '–' })} ·{' '}
          {t('alert.raised', { time: fmtTime(alert.created_at) })}
        </p>
        <h3>{t(alert.criteria_met ? 'alert.components' : 'alert.previousComponents')}</h3>
        <ComponentTable components={alert.components} empty={t('alert.noComponents')} />
        {readings && <VitalTrends history={readings} />}
        <AlertActions alert={alert} busy={busy} onAct={onAct} />
      </section>
    </div>
  );
}

/** Compact, non-blocking alert strips. */
export function AlertBanners({
  alerts,
  patients,
  role,
  busy,
  onAct,
  onEnterVitals,
}: {
  alerts: Alert[];
  patients: Summary[];
  role: Role;
  busy: boolean;
  onAct: ActAlert;
  onEnterVitals?: (patientId: string) => void;
}) {
  if (alerts.length === 0) return null;
  return (
    <section className="banners" aria-label={t('app.region.alerts')}>
      {alerts.slice(0, 2).map(alert => {
        const patient = patients.find(p => p.id === alert.patient_id);
        const title = alertTitle(alert);
        return (
          <article
            key={alert.id}
            className={`banner banner-${alert.level.toLowerCase()}`}
            data-testid={`banner-${alert.level}-${alert.patient_id}`}
          >
            <LevelChip level={alert.level} />
            <EscalatedTag escalated={alert.escalated} />
            <strong>{patient ? `${patient.label} · ${patient.bed}` : alert.patient_id}</strong>
            <span className="banner-title" title={title}>{title}</span>
            <LatchedNote alert={alert} />
            {alert.target_role === role
              ? <AlertActions alert={alert} busy={busy} onAct={onAct} onEnterVitals={onEnterVitals}
                  testPrefix={alert.level === 'GREEN' ? 'banner-' : ''} />
              : <span>{t('banner.routed', { role: t(`app.role.${alert.target_role}`) })}</span>}
          </article>
        );
      })}
      {alerts.length > 2 && <span className="banner-more">{t('banner.more', { count: alerts.length - 2 })}</span>}
    </section>
  );
}
