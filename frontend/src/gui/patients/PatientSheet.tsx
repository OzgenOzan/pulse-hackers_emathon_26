import { useEffect, useId, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { StatusLabel } from '../../components/ui/StatusLabel';
import { VitalSign } from '../../components/ui/VitalSign';
import { fmtTime } from '../../format';
import {
  bedLabel,
  consultLabel,
  diagnosisLabel,
  labDisplayLabel,
  localRule,
  measurement,
  reasonLabel,
  stayLabel,
} from '../clinical';
import type { Detail, RulesView, Summary, VitalReading } from '../../types';
import { copy } from './copy';
import {
  ageSex,
  alertStatusText,
  alertTitle,
  complaintOf,
  componentFinding,
  componentValue,
  decisionText,
  displayName,
  lastEvaluationText,
  lastMeasureText,
  protocolOf,
  statusSublabel,
  suppressionText,
  testLabel,
  vitalCells,
} from './model';
import './patients.css';

/**
 * Right-hand patient sheet. Opened non-modally so the evaluator or manual-entry sheet can stack without a nested modal;
 * Escape and the close button both call onClose, and focus returns to the opener.
 */
export function PatientSheet({
  summary,
  detail,
  config,
  offline,
  modal,
  primaryActions,
  actions,
  onClose,
}: {
  summary: Summary;
  detail: Detail | null;
  config: RulesView | null;
  offline: boolean;
  modal: boolean;
  primaryActions?: ReactNode;
  actions?: ReactNode;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const headingId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (modal) dialog.showModal();
    else dialog.show();
    closeRef.current?.focus();
    return () => {
      dialog.close();
      opener?.focus();
    };
  }, [modal]);

  const issues = summary.risk_status.data_issues;
  return (
    <dialog
      ref={dialogRef}
      className="patient-sheet"
      aria-labelledby={headingId}
      onCancel={e => {
        e.preventDefault();
        onClose();
      }}
      onKeyDown={e => {
        if (e.key === 'Escape') {
          e.preventDefault();
          onClose();
        }
      }}
    >
      <header className="sheet-head">
        <div>
          <h2 id={headingId} className="sheet-title">{displayName(summary)}</h2>
          <p className="sheet-meta">{bedLabel(summary.bed)} · {ageSex(summary)} · {protocolOf(summary)}</p>
          <StatusLabel status={summary.risk_status.key} sublabel={statusSublabel(summary)} />
        </div>
        <button ref={closeRef} type="button" className="icon-button" aria-label={copy.close} title={copy.close} onClick={onClose}>
          <X aria-hidden="true" size={22} />
        </button>
      </header>
      <div className="sheet-body">
        {primaryActions}
        <section className="sheet-section">
          <h3>{copy.identity}</h3>
          <dl className="facts">
            <Fact label={copy.complaint}>{complaintOf(summary) ?? copy.noData}</Fact>
            <Fact label={copy.stay}>{stayLabel(summary.minutes_in_zone)}</Fact>
            <Fact label={copy.arrival}>{fmtTime(summary.arrived_at)}</Fact>
            <Fact label={copy.physician}>{summary.display?.physician ?? copy.noData}</Fact>
            <Fact label={copy.nurse}>{summary.display?.nurse ?? copy.noData}</Fact>
            <Fact label={copy.lastMeasure}>{lastMeasureText(summary)}</Fact>
            <Fact label={copy.lastEvaluation}>{lastEvaluationText(summary)}</Fact>
            <Fact label={copy.pendingLabs}>
              {summary.pending_labs.length ? summary.pending_labs.map(lab => labDisplayLabel(lab.label)).join(', ') : copy.none}
            </Fact>
            <Fact label={copy.pendingConsults}>
              {summary.pending_consults.length ? summary.pending_consults.map(c => consultLabel(c.service)).join(', ') : copy.none}
            </Fact>
            <Fact label={copy.diagnosis}>
              {summary.working_dx.length ? summary.working_dx.map(diagnosisLabel).join(', ') : copy.noDiagnosis}
            </Fact>
          </dl>
          {config && (
            <p className="sheet-note">{copy.thresholds(config.red.threshold, config.status.watch_min_score)}</p>
          )}
        </section>

        <section className="sheet-section">
          <h3>{copy.reasonsHead}</h3>
          <ul className="reason-list">
            {summary.risk_status.reasons.map(r => <li key={r.key}>{reasonLabel(r)}</li>)}
          </ul>
          {issues.length > 0 && (
            <>
              <h4 className="sheet-subhead">{copy.dataIssues}</h4>
              <ul className="reason-list">
                {issues.map(r => <li key={r.key}>{reasonLabel(r)}</li>)}
              </ul>
            </>
          )}
          {summary.reconnect_pending && <p className="notice">{copy.reconnect}</p>}
        </section>

        {actions && (
          <section className="sheet-section" aria-label={copy.tasks}>
            <h3>{copy.tasks}</h3>
            {actions}
          </section>
        )}

        <section className="sheet-section">
          <h3>{copy.vitals}</h3>
          <div className="vitals">
            {vitalCells(summary, offline).map(c => (
              <VitalSign key={c.key} label={c.label} unit={c.unit} state={c.state} flags={c.flags} sub={c.sub} />
            ))}
          </div>
        </section>

        {detail ? <DetailSections detail={detail} config={config} /> : <p className="sheet-note" role="status">{copy.loading}</p>}
      </div>
    </dialog>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </>
  );
}

function DetailSections({ detail, config }: { detail: Detail; config: RulesView | null }) {
  const { assessment } = detail;
  return (
    <>
      <Trends vitals={detail.vitals} />

      <section className="sheet-section">
        <h3>{copy.assessment}</h3>
        <p className="sheet-note">{copy.score(assessment.score)}</p>
        {assessment.components.length === 0 ? (
          <p>{copy.noComponents}</p>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>{copy.findingHead}</th>
                <th>{copy.valueHead}</th>
                <th>{copy.pointsHead}</th>
              </tr>
            </thead>
            <tbody>
              {assessment.components.map(c => (
                <tr key={c.key}>
                  <td>
                    {componentFinding(c)}
                    <span className="rule">{localRule(c.rule)}</span>
                  </td>
                  <td>{componentValue(c)}</td>
                  <td>{c.points}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="sheet-section">
        <h3>{copy.suppressed}</h3>
        {assessment.suppressed_labs.length === 0 ? (
          <p>{copy.suppressedNone}</p>
        ) : (
          <ul className="reason-list">
            {assessment.suppressed_labs.map(l => (
              <li key={`${l.test}-${l.observed_at}`}>
                {testLabel(l.test, config)} · {measurement(l.value, l.test === 'ph' ? 'ph' : 'lab')} {l.unit} · {suppressionText(l.reason_key)}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="sheet-section">
        <h3>{copy.labs}</h3>
        {detail.labs.length === 0 ? (
          <p>{copy.noLabs}</p>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>{copy.labHead}</th>
                <th>{copy.valueHead}</th>
                <th>{copy.timeHead}</th>
              </tr>
            </thead>
            <tbody>
              {detail.labs.map(lab => (
                <tr key={`${lab.test}-${lab.ordered_at}`}>
                  <td>{testLabel(lab.test, config)}</td>
                  <td>{lab.value === null ? copy.pending : `${measurement(lab.value, lab.test === 'ph' ? 'ph' : 'lab')} ${lab.unit ?? ''}`}</td>
                  <td>{lab.resulted_at ? fmtTime(lab.resulted_at) : copy.pending}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="sheet-section">
        <h3>{copy.consults}</h3>
        {detail.consultations.length === 0 ? (
          <p>{copy.noConsults}</p>
        ) : (
          <ul className="reason-list">
            {detail.consultations.map(c => (
              <li key={`${c.service}-${c.requested_at}`}>
                {consultLabel(c.service)} · {fmtTime(c.requested_at)} · {c.resulted_at ? copy.resulted : copy.pending}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="sheet-section">
        <h3>{copy.history}</h3>
        {detail.alert_history.length === 0 ? (
          <p>{copy.noHistory}</p>
        ) : (
          <ul className="reason-list">
            {detail.alert_history.map(a => {
              const decision = decisionText(a);
              return (
                <li key={a.id}>
                  {fmtTime(a.created_at)} · {alertTitle(a)} · {alertStatusText(a.status)}
                  {decision && ` · ${decision}`}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </>
  );
}

function trendRows() {
  return [
    { key: 'hr', label: copy.vital.hr },
    { key: 'map', label: copy.oab },
    { key: 'spo2', label: copy.vital.spo2 },
  ] as const;
}

function Trends({ vitals }: { vitals: VitalReading[] }) {
  const recent = [...vitals].sort((a, b) => a.time.localeCompare(b.time)).slice(-6);
  return (
    <section className="sheet-section">
      <h3>{copy.trends}</h3>
      {recent.length === 0 ? (
        <p>{copy.trendNone}</p>
      ) : (
        trendRows().map(({ key, label }) => <Sparkline key={key} label={label} values={recent.map(r => r[key])} />)
      )}
    </section>
  );
}

/** Grayscale trend: the line uses currentColor, which tokens.css maps to the muted neutral. Gaps break the line. */
function Sparkline({ label, values }: { label: string; values: (number | null | undefined)[] }) {
  const present = values.filter((v): v is number => typeof v === 'number');
  if (present.length === 0) {
    return (
      <div className="trend">
        <span className="trend-label">{label}</span>
        <span className="trend-text">{copy.trendNone}</span>
      </div>
    );
  }
  const low = Math.min(...present);
  const high = Math.max(...present);
  const span = high - low || 1;
  const step = values.length > 1 ? 100 / (values.length - 1) : 0;
  const points = values
    .flatMap((v, i) => (typeof v === 'number' ? [`${i * step},${34 - ((v - low) / span) * 30}`] : []))
    .join(' ');
  const summary = copy.trendSummary(
    measurement(present[present.length - 1], ''),
    measurement(low, ''),
    measurement(high, ''),
  );
  return (
    <div className="trend">
      <span className="trend-label">{label}</span>
      <svg viewBox="0 0 100 36" preserveAspectRatio="none" role="img" aria-label={`${label}: ${summary}`}>
        <polyline points={points} fill="none" stroke="currentColor" strokeWidth={2} vectorEffect="non-scaling-stroke" />
      </svg>
      <span className="trend-text">{summary}</span>
    </div>
  );
}
