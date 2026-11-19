import { useEffect, useRef, useState } from 'react';
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
}: {
  alert: Alert;
  action: string;
  reasons: readonly string[];
  busy: boolean;
  onAct: ActAlert;
}) {
  const [open, setOpen] = useState(false);
  const panelId = `reasons-${alert.id}-${action}`;
  return (
    <div className="reason-group">
      <button
        type="button"
        className="action"
        data-testid={`action-${action}`}
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
              data-testid={`reason-${r}`}
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
}: {
  alert: Alert;
  busy: boolean;
  onAct: ActAlert;
  onEnterVitals?: (patientId: string) => void;
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
              data-testid="action-vitals_entered"
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
            />
          );
        }
        return (
          <button
            key={spec.action}
            type="button"
            className="action"
            data-testid={`action-${spec.action}`}
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
        role="dialog"
        aria-modal="true"
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
          {t('alert.score', { score: alert.score, threshold: threshold ?? '–' })} ·{' '}
          {t('alert.raised', { time: fmtTime(alert.created_at) })}
        </p>
        <h3>{t('alert.components')}</h3>
        <ComponentTable components={alert.components} empty={t('alert.noComponents')} />
        {readings && <VitalTrends history={readings} />}
        <AlertActions alert={alert} busy={busy} onAct={onAct} />
      </section>
    </div>
  );
}

/** Non-blocking banners. GREEN gets a hint only (its actions live in the detail panel). */
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
      {alerts.map(alert => {
        const patient = patients.find(p => p.id === alert.patient_id);
        let body;
        if (alert.level === 'GREEN') {
          body = (
            <>
              <p className="hint suggest">{t('alert.greenSuggest')}</p>
              <p className="hint">{t('alert.greenHint')}</p>
            </>
          );
        } else if (alert.target_role !== role) {
          body = <p className="hint">{t('banner.routed', { role: t(`app.role.${alert.target_role}`) })}</p>;
        } else {
          body = <AlertActions alert={alert} busy={busy} onAct={onAct} onEnterVitals={onEnterVitals} />;
        }
        return (
          <article
            key={alert.id}
            className={`banner banner-${alert.level.toLowerCase()}`}
            data-testid={`banner-${alert.level}-${alert.patient_id}`}
          >
            <div className="banner-head">
              <LevelChip level={alert.level} />
              <EscalatedTag escalated={alert.escalated} />
              <strong>{patient ? `${patient.label} · ${patient.bed}` : alert.patient_id}</strong>
            </div>
            <p>{alertTitle(alert)}</p>
            <LatchedNote alert={alert} />
            {body}
          </article>
        );
      })}
    </section>
  );
}
