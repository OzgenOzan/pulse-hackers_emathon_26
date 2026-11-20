import { useEffect, useId, useRef, useState } from 'react';
import { CircleCheck, ClipboardPlus, Eye, TriangleAlert } from 'lucide-react';
import { ACTIONS, type ActionSpec } from '../../alertActions';
import { AlarmCard } from '../../components/ui/AlarmCard';
import { fmtTime } from '../../format';
import type { Alert, CriticalAlarm, Role, State, Summary } from '../../types';
import { bedLabel, componentText, localRule, roleLabels, stayLabel } from '../clinical';
import { copy, NOTE_MAX } from './copy';
import { alarmSentence, alertTitle, isWorsenedFor, minutesBetween, rankFindings, ROLES } from './model';
import './alarms.css';

export { ManualVitals } from './ManualVitals';
export type { ManualVitalsProps } from './ManualVitals';

/** The shell keeps this region mounted even on routes without an alarm panel. */
export function AlarmAnnouncer({ state, role }: { state: State | null; role: Role }) {
  const announced = useRef<{ replay: string; ids: Set<string> } | null>(null);
  const [message, setMessage] = useState<{ replay: string; role: Role; key: string; text: string } | null>(null);

  useEffect(() => {
    if (!state) return;
    const replay = state.sim.replay_id;
    if (announced.current?.replay !== replay) announced.current = { replay, ids: new Set() };
    const { ids } = announced.current;
    const beds: string[] = [];
    const fresh: string[] = [];
    for (const alarm of state.critical_alarms) {
      const key = `${role}:${alarm.id}`;
      if (alarm.seen[role] || ids.has(key)) continue;
      ids.add(key);
      fresh.push(key);
      beds.push(bedLabel(alarm.patient.bed));
    }
    if (fresh.length > 0) setMessage({ replay, role, key: `${replay}:${fresh.join(',')}`, text: copy.live.newAlarm(beds.join(', ')) });
    else if (state.critical_alarms.length === 0) setMessage(null);
  }, [state, role]);

  return <div className="visually-hidden" aria-live="assertive" aria-atomic="true" data-testid="alarm-announcer">
    {message && message.replay === state?.sim.replay_id && message.role === role &&
      <span key={message.key}>{message.text}</span>}
  </div>;
}

export interface AlarmPanelProps {
  alarms: CriticalAlarm[];
  patients: ReadonlyMap<string, Summary>;
  role: Role;
  busy: boolean;
  offline: boolean;
  onView: (id: string) => void;
  onSeen: (alarm: CriticalAlarm) => void;
  onEvaluate: (alarm: CriticalAlarm) => void;
}

/** Critical alarm panel. Renders nothing when there are no pending alarms. */
export function AlarmPanel({ alarms, patients, role, busy, offline, onView, onSeen, onEvaluate }: AlarmPanelProps) {
  const headingId = useId();

  if (alarms.length === 0) return null;
  const blocker = alarms.find(alarm => alarm.blocking);

  return (
    <section className="alarm-flows alarm-panel" aria-labelledby={headingId} data-testid="alarm-panel">
      <h2 id={headingId}>
        {copy.panel.heading}
        <span className="alarm-count">{alarms.length}</span>
      </h2>
      <ol className="alarm-list">
        {alarms.map(alarm => {
          const seen = ROLES.filter(r => alarm.seen[r]);
          const mine = alarm.seen[role];
          const current = patients.get(alarm.patient_id);
          const patientLine = copy.panel.patientLine(bedLabel(alarm.patient.bed), alarm.patient.label, alarm.patient.age);
          const orderLocked = role === 'physician' && blocker !== undefined && !alarm.blocking;
          const evaluateReason = role !== 'physician'
            ? copy.panel.nurseEvaluate
            : orderLocked && blocker
              ? copy.panel.orderBlocked(bedLabel(blocker.patient.bed))
              : undefined;
          const reasonId = `${headingId}-${alarm.id}-reason`;
          const offlineId = `${headingId}-${alarm.id}-offline`;
          return (
            <li key={alarm.id} data-testid={`alarm-${alarm.patient_id}`} data-emphasis={!mine || isWorsenedFor(alarm, role)}>
              <AlarmCard
                tone="critical"
                title={copy.panel.headline}
                meta={current && !alarm.criteria_met ? `${patientLine} · ${copy.currentScore(current.score)}` : patientLine}
                badges={(
                  <>
                    {!mine && <span className="alarm-badge new">{copy.panel.newBadge}</span>}
                    {isWorsenedFor(alarm, role) && <span className="alarm-badge worse">{copy.panel.worsenedBadge}</span>}
                  </>
                )}
                actions={(
                  <div className="alarm-actions">
                    <button
                      type="button"
                      className="alarm-btn"
                      data-testid={`alarm-view-${alarm.patient_id}`}
                      disabled={orderLocked}
                      aria-describedby={orderLocked ? reasonId : undefined}
                      onClick={() => onView(alarm.patient_id)}
                    >
                      <Eye aria-hidden="true" size={20} />
                      {copy.panel.view}
                    </button>
                    <button
                      type="button"
                      className="alarm-btn"
                      data-testid={`alarm-seen-${alarm.patient_id}`}
                      disabled={busy || offline || mine !== undefined}
                      aria-describedby={offline ? offlineId : undefined}
                      onClick={() => onSeen(alarm)}
                    >
                      <CircleCheck aria-hidden="true" size={20} />
                      {copy.panel.seen}
                    </button>
                    <div className="alarm-action">
                      <button
                        type="button"
                        className="alarm-btn primary"
                        data-testid={`alarm-evaluate-${alarm.patient_id}`}
                        disabled={busy || offline || evaluateReason !== undefined}
                        aria-describedby={evaluateReason ? reasonId : offline ? offlineId : undefined}
                        onClick={() => onEvaluate(alarm)}
                      >
                        <ClipboardPlus aria-hidden="true" size={20} />
                        {copy.panel.evaluate}
                      </button>
                      {evaluateReason && <span className="alarm-reason" id={reasonId}>{evaluateReason}</span>}
                    </div>
                    {offline && <span className="alarm-reason" id={offlineId}>{copy.panel.offline}</span>}
                  </div>
                )}
              >
                <p className="alarm-finding">{alarmSentence(alarm)}</p>
                {seen.map(r => (
                  <p className="alarm-seen" key={r}>
                    {copy.panel.seenAt(fmtTime(alarm.seen[r]?.at), roleLabels[r])}
                  </p>
                ))}
              </AlarmCard>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

export interface AlarmStripProps {
  alarms: CriticalAlarm[];
  /** The full panel element, or null when this route renders no panel. */
  panel: HTMLElement | null;
  onView: (id: string) => void;
}

/** Shows the strip immediately without a full panel, or once the full panel is above the header. */
export function AlarmStrip({ alarms, panel, onView }: AlarmStripProps) {
  const [pastPanel, setPastPanel] = useState(false);
  const hasAlarms = alarms.length > 0;

  useEffect(() => {
    if (!panel) return;
    const header = document.querySelector('.gui-header');
    const update = () => setPastPanel(panel.getBoundingClientRect().bottom <= (header?.getBoundingClientRect().bottom ?? 0));
    update();
    const observer = new ResizeObserver(update);
    observer.observe(panel);
    if (header) observer.observe(header);
    document.addEventListener('scroll', update, { capture: true, passive: true });
    window.addEventListener('resize', update);
    return () => {
      observer.disconnect();
      document.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [panel]);

  if (!hasAlarms || (panel && !pastPanel)) return null;
  const blocking = alarms.find(alarm => alarm.blocking);

  return (
    <section className="alarm-flows alarm-strip" data-past-panel={!!panel} aria-label={copy.strip.label} data-testid="alarm-strip">
      <p className="alarm-strip-title">
        <TriangleAlert size={20} aria-hidden="true" /> {copy.strip.count(alarms.length)}
      </p>
      <ul className="alarm-strip-list">
        {alarms.map(alarm => {
          const bed = bedLabel(alarm.patient.bed);
          const locked = blocking && !alarm.blocking;
          const tip = locked ? copy.panel.orderBlocked(bedLabel(blocking.patient.bed)) : undefined;
          return (
            <li key={alarm.id}>
              <span className="alarm-strip-bed">{bed} · {alarm.patient.label}</span>
              <button
                type="button"
                className="alarm-btn alarm-strip-btn"
                data-testid={`alarm-strip-view-${alarm.patient_id}`}
                aria-label={copy.strip.viewAria(bed)}
                aria-disabled={!!locked}
                title={tip ?? copy.panel.view}
                onClick={() => onView(alarm.patient_id)}
              >
                <Eye aria-hidden="true" size={18} />
                <span>{copy.panel.view}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export interface EvaluationSheetProps {
  alarm: CriticalAlarm;
  current: Summary | undefined;
  busy: boolean;
  offline: boolean;
  onClose: () => void;
  onSave: (action: string, reason?: string, note?: string) => void;
}

/** Top-anchored native dialog: focus returns to the opener and Escape closes it. */
export function EvaluationSheet({ alarm, current, busy, offline, onClose, onSave }: EvaluationSheetProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const noteId = useId();
  const [note, setNote] = useState('');
  const [picked, setPicked] = useState<ActionSpec | null>(null);
  const disabled = busy || offline;
  const noteValue = note.trim() || undefined;
  const evidence = alarm.criteria_met ? copy.sheet.evidence : copy.previousFindings;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  const choose = (spec: ActionSpec) => {
    if (spec.reasons?.length) setPicked(spec);
    else onSave(spec.action, undefined, noteValue);
  };

  return (
    <dialog
      ref={dialogRef}
      className="alarm-sheet"
      aria-labelledby={titleId}
      onClose={onClose}
    >
      <div className="alarm-flows alarm-sheet-inner">
        <header className="alarm-sheet-head">
          <div>
            <h2 id={titleId}>{copy.sheet.heading}</h2>
            <p className="alarm-card-meta">
              {copy.panel.patientLine(bedLabel(alarm.patient.bed), alarm.patient.label, alarm.patient.age)}
              {current && ` · ${copy.currentScore(current.score)}`}
            </p>
          </div>
          <button
            type="button"
            className="alarm-btn"
            aria-label={copy.sheet.close}
            title={copy.sheet.close}
            onClick={() => dialogRef.current?.close()}
          >
            <span aria-hidden="true">×</span>
          </button>
        </header>

        <section className="alarm-evidence" aria-label={evidence}>
          <h3>{evidence}</h3>
          {alarm.criteria_met && <p className="alarm-finding">{alarmSentence(alarm)}</p>}
          <ul>
            {rankFindings(alarm.components).map((component, index) => (
              <li key={`${component.key}-${index}`}>
                {componentText(component)}
                <small>{localRule(component.rule)} · {fmtTime(component.observed_at)}</small>
              </li>
            ))}
          </ul>
        </section>

        <div className="alarm-note">
          <label htmlFor={noteId}>{copy.sheet.note}</label>
          <textarea
            id={noteId}
            value={note}
            maxLength={NOTE_MAX}
            disabled={disabled}
            onChange={event => setNote(event.target.value)}
          />
          <p className="alarm-count-text">{copy.sheet.noteCount(note.length, NOTE_MAX)}</p>
        </div>

        {offline && <p className="alarm-reason">{copy.panel.offline}</p>}

        {picked ? (
          <section className="alarm-decisions" aria-label={copy.sheet.reasonGroup}>
            <h3>{copy.action(picked.action)}</h3>
            <div className="alarm-reasons">
              {picked.reasons?.map(reason => (
                <button
                  key={reason}
                  type="button"
                  className="alarm-btn reason"
                  data-testid={`eval-reason-${reason}`}
                  disabled={disabled}
                  onClick={() => onSave(picked.action, reason, noteValue)}
                >
                  {copy.reason(reason)}
                </button>
              ))}
            </div>
            <div className="alarm-actions">
              <button type="button" className="alarm-btn" disabled={disabled} onClick={() => setPicked(null)}>
                {copy.sheet.back}
              </button>
            </div>
          </section>
        ) : (
          <section className="alarm-decisions" aria-label={copy.sheet.decision}>
            <h3>{copy.sheet.decision}</h3>
            {ACTIONS[alarm.level].map(spec => (
              <button
                key={spec.action}
                type="button"
                className="alarm-btn"
                data-testid={`eval-action-${spec.action}`}
                disabled={disabled}
                onClick={() => choose(spec)}
              >
                {copy.action(spec.action)}
              </button>
            ))}
          </section>
        )}
      </div>
    </dialog>
  );
}

export interface TaskActionsProps {
  tasks: Alert[];
  patients?: Summary[];
  role: Role;
  busy: boolean;
  offline: boolean;
  /** Locks every action with this reason (e.g. physician lock). A role-specific reason takes precedence. */
  lockReason?: string;
  vitalsUnavailable?: string;
  onAck: (alert: Alert, action: string, reason?: string) => void;
  onVitals: (id: string) => void;
}

/** Physician and nurse tasks. Actions outside the owner's role are shown disabled with a reason. */
export function TaskActions({ tasks, patients, role, busy, offline, lockReason, vitalsUnavailable, onAck, onVitals }: TaskActionsProps) {
  const headingId = useId();
  const [picked, setPicked] = useState<string | null>(null);

  return (
    <section className="alarm-flows alarm-tasks" aria-labelledby={headingId} aria-live="polite">
      <h2 id={headingId}>{copy.tasks.heading}</h2>
      {tasks.length === 0 && <p className="alarm-empty">{copy.tasks.empty}</p>}
      <ol className="alarm-list">
        {tasks.map(task => {
          const patient = patients?.find(p => p.id === task.patient_id);
          const mine = task.target_role === role;
          const reason = mine ? lockReason : copy.tasks.roleDisabled(task.target_role);
          const disabled = busy || offline || reason !== undefined;
          const reasonId = `${headingId}-${task.id}-reason`;
          const vitalsReasonId = !reason && vitalsUnavailable ? `${reasonId}-vitals` : undefined;
          return (
            <li key={task.id}>
              <AlarmCard
                tone="neutral"
                title={copy.tasks.title(task.level)}
                meta={patient ? `${bedLabel(patient.bed)} · ${patient.label}` : undefined}
                badges={<span className="alarm-badge">{copy.status(task.status)}</span>}
                actions={(
                  <div className="alarm-actions">
                    {ACTIONS[task.level].map(spec => {
                      if (!task.recommended_actions.includes(spec.action)) return null;
                      if (spec.action === 'vitals_entered') {
                        return (
                          <button
                            key={spec.action}
                            type="button"
                            className="alarm-btn"
                            data-testid={`task-action-${spec.action}`}
                            disabled={disabled || vitalsUnavailable !== undefined}
                            aria-describedby={reason ? reasonId : vitalsReasonId}
                            onClick={() => onVitals(task.patient_id)}
                          >
                            {copy.tasks.vitals}
                          </button>
                        );
                      }
                      const key = `${task.id}:${spec.action}`;
                      if (spec.reasons?.length && picked === key) {
                        return (
                          <span className="alarm-reasons" key={key}>
                            {spec.reasons.map(r => (
                              <button
                                key={r}
                                type="button"
                                className="alarm-btn reason"
                                data-testid={`task-reason-${r}`}
                                disabled={disabled}
                                onClick={() => {
                                  setPicked(null);
                                  onAck(task, spec.action, r);
                                }}
                              >
                                {copy.reason(r)}
                              </button>
                            ))}
                          </span>
                        );
                      }
                      return (
                        <button
                          key={spec.action}
                          type="button"
                          className="alarm-btn"
                          data-testid={`task-action-${spec.action}`}
                          disabled={disabled}
                          aria-describedby={reason ? reasonId : undefined}
                          onClick={() => {
                            if (spec.reasons?.length) setPicked(key);
                            else onAck(task, spec.action);
                          }}
                        >
                          {copy.action(spec.action)}
                        </button>
                      );
                    })}
                    {reason && <span className="alarm-reason" id={reasonId}>{reason}</span>}
                    {vitalsReasonId && task.recommended_actions.includes('vitals_entered') &&
                      <span className="alarm-reason" id={vitalsReasonId}>{vitalsUnavailable}</span>}
                  </div>
                )}
              >
                {task.level === 'YELLOW' && <p>{alertTitle(task)}</p>}
                {task.level === 'GREEN' && typeof task.params.minutes === 'number' &&
                  <p>{copy.tasks.discharge(stayLabel(task.params.minutes))}</p>}
              </AlarmCard>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

export interface AlarmHistoryProps {
  alarms: CriticalAlarm[];
  viewReason: (id: string) => string | undefined;
  onView: (id: string) => void;
}

/** Recorded alarm history: created time, seen per role with latency, decision with reason and note. */
export function AlarmHistory({ alarms, viewReason, onView }: AlarmHistoryProps) {
  const headingId = useId();
  return (
    <section className="alarm-flows alarm-history" aria-labelledby={headingId}>
      <h2 id={headingId}>{copy.history.heading}</h2>
      {alarms.length === 0 && <p className="alarm-empty">{copy.history.empty}</p>}
      <ol className="alarm-history-list">
        {alarms.map(alarm => {
          const reason = viewReason(alarm.patient_id);
          const reasonId = `${headingId}-${alarm.id}-view`;
          return <li key={alarm.id}>
            <AlarmCard
              tone="neutral"
              title={`${bedLabel(alarm.patient.bed)} - ${alarm.patient.label}`}
              meta={`${copy.history.created(fmtTime(alarm.created_at))} · ${alarm.id}`}
              badges={<span className="alarm-badge">{copy.status(alarm.status)}</span>}
              actions={(
                <div className="alarm-action">
                  <button type="button" className="alarm-btn" disabled={reason !== undefined}
                    aria-describedby={reason ? reasonId : undefined} onClick={() => onView(alarm.patient_id)}>
                    <Eye aria-hidden="true" size={20} />
                    {copy.history.view}
                  </button>
                  {reason && <span className="alarm-reason" id={reasonId}>{reason}</span>}
                </div>
              )}
            >
              <ul className="alarm-timeline">
                {ROLES.map(r => {
                  const seen = alarm.seen[r];
                  if (!seen) return null;
                  const latency = stayLabel(minutesBetween(alarm.created_at, seen.at));
                  return <li key={r}>{copy.history.seenBy(roleLabels[r], fmtTime(seen.at), latency)}</li>;
                })}
                {alarm.action ? (
                  <li>
                    {copy.history.decided(
                      fmtTime(alarm.closed_at ?? alarm.updated_at),
                      copy.action(alarm.action),
                      alarm.reason ? copy.reason(alarm.reason) : null,
                    )}
                    {alarm.decision_latency_minutes !== null && (
                      <small> · {copy.history.decisionLatency(stayLabel(alarm.decision_latency_minutes))}</small>
                    )}
                  </li>
                ) : (
                  <li>{copy.history.pending}</li>
                )}
                {alarm.note && <li>{copy.history.note(alarm.note)}</li>}
              </ul>
            </AlarmCard>
          </li>
        })}
      </ol>
    </section>
  );
}
