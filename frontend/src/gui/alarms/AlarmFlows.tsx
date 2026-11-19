import { useEffect, useId, useRef, useState } from 'react';
import { CircleCheck, ClipboardPlus, Eye } from 'lucide-react';
import { ACTIONS, type ActionSpec } from '../../alertActions';
import { AlarmCard } from '../../components/ui/AlarmCard';
import { fmtTime } from '../../format';
import type { Alert, CriticalAlarm, Role, Summary } from '../../types';
import { bedLabel, componentText, localRule, roleLabels, stayLabel } from '../clinical';
import { copy, NOTE_MAX } from './copy';
import { alarmSentence, announceKey, isWorsenedFor, minutesBetween, rankFindings, ROLES } from './model';
import './alarms.css';

export { ManualVitals } from './ManualVitals';
export type { ManualVitalsProps } from './ManualVitals';

export interface AlarmPanelProps {
  alarms: CriticalAlarm[];
  role: Role;
  busy: boolean;
  offline: boolean;
  onView: (id: string) => void;
  onSeen: (alarm: CriticalAlarm) => void;
  onEvaluate: (alarm: CriticalAlarm) => void;
}

/** Critical alarm panel. Renders nothing when there are no pending alarms. */
export function AlarmPanel({ alarms, role, busy, offline, onView, onSeen, onEvaluate }: AlarmPanelProps) {
  const headingId = useId();
  const announced = useRef(new Set<string>());
  const [live, setLive] = useState('');

  useEffect(() => {
    const fresh = alarms.filter(alarm => !alarm.seen[role] && !announced.current.has(announceKey(alarm, role)));
    if (fresh.length === 0) return;
    fresh.forEach(alarm => announced.current.add(announceKey(alarm, role)));
    setLive(copy.live.newAlarm(fresh.map(alarm => bedLabel(alarm.patient.bed)).join(', ')));
  }, [alarms, role]);

  if (alarms.length === 0) return null;
  const blocker = alarms.find(alarm => alarm.blocking);

  return (
    <section className="alarm-flows alarm-panel" aria-labelledby={headingId} data-testid="alarm-panel">
      <h2 id={headingId}>
        {copy.panel.heading}
        <span className="alarm-count">{alarms.length}</span>
      </h2>
      <div className="alarm-live" aria-live="assertive">{live}</div>
      <ol className="alarm-list">
        {alarms.map(alarm => {
          const seen = ROLES.filter(r => alarm.seen[r]);
          const mine = alarm.seen[role];
          const orderLocked = role === 'physician' && blocker !== undefined && !alarm.blocking;
          const evaluateReason = role !== 'physician'
            ? copy.panel.nurseEvaluate
            : orderLocked && blocker
              ? copy.panel.orderBlocked(bedLabel(blocker.patient.bed))
              : undefined;
          const reasonId = `${alarm.id}-reason`;
          const offlineId = `${alarm.id}-offline`;
          return (
            <li key={alarm.id} data-testid={`alarm-${alarm.patient_id}`} data-emphasis={!mine || isWorsenedFor(alarm, role)}>
              <AlarmCard
                tone="critical"
                title={copy.panel.headline}
                meta={copy.panel.patientLine(bedLabel(alarm.patient.bed), alarm.patient.label, alarm.patient.age)}
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

export interface EvaluationSheetProps {
  alarm: CriticalAlarm;
  busy: boolean;
  offline: boolean;
  onClose: () => void;
  onSave: (action: string, reason?: string, note?: string) => void;
}

/** Top-anchored native dialog: focus returns to the opener and Escape closes it. */
export function EvaluationSheet({ alarm, busy, offline, onClose, onSave }: EvaluationSheetProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const noteId = useId();
  const [note, setNote] = useState('');
  const [picked, setPicked] = useState<ActionSpec | null>(null);
  const disabled = busy || offline;
  const noteValue = note.trim() || undefined;

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
              {copy.panel.patientLine(bedLabel(alarm.patient.bed), alarm.patient.label, alarm.patient.age)} · {copy.sheet.score(alarm.score)}
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

        <section className="alarm-evidence" aria-label={copy.sheet.evidence}>
          <h3>{copy.sheet.evidence}</h3>
          <p className="alarm-finding">{alarmSentence(alarm)}</p>
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
            <h3>{copy.actions[picked.action]}</h3>
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
                  {copy.reasons[reason]}
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
                {copy.actions[spec.action]}
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
  onAck: (alert: Alert, action: string, reason?: string) => void;
  onVitals: (id: string) => void;
}

/** Physician and nurse tasks. Actions outside the owner's role are shown disabled with a reason. */
export function TaskActions({ tasks, patients, role, busy, offline, onAck, onVitals }: TaskActionsProps) {
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
          const reason = mine ? undefined : copy.tasks.roleDisabled(task.target_role);
          const disabled = busy || offline || !mine;
          const reasonId = `${task.id}-reason`;
          return (
            <li key={task.id}>
              <AlarmCard
                tone="neutral"
                title={copy.tasks.titles[task.level]}
                meta={patient ? `${bedLabel(patient.bed)} · ${patient.label}` : undefined}
                badges={<span className="alarm-badge">{copy.alarmStatus[task.status]}</span>}
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
                            disabled={disabled}
                            aria-describedby={reason ? reasonId : undefined}
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
                                {copy.reasons[r]}
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
                          {copy.actions[spec.action]}
                        </button>
                      );
                    })}
                    {reason && <span className="alarm-reason" id={reasonId}>{reason}</span>}
                  </div>
                )}
              >
                {typeof task.params.minutes === 'number' &&
                  <p>{task.level === 'GREEN' ? copy.tasks.discharge(stayLabel(task.params.minutes))
                    : copy.tasks.gap(stayLabel(task.params.minutes))}</p>}
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
  onView: (id: string) => void;
}

/** Recorded alarm history: created time, seen per role with latency, decision with reason and note. */
export function AlarmHistory({ alarms, onView }: AlarmHistoryProps) {
  const headingId = useId();
  return (
    <section className="alarm-flows alarm-history" aria-labelledby={headingId}>
      <h2 id={headingId}>{copy.history.heading}</h2>
      {alarms.length === 0 && <p className="alarm-empty">{copy.history.empty}</p>}
      <ol className="alarm-history-list">
        {alarms.map(alarm => (
          <li key={alarm.id}>
            <AlarmCard
              tone="neutral"
              title={`${bedLabel(alarm.patient.bed)} - ${alarm.patient.label}`}
              meta={`${copy.history.created(fmtTime(alarm.created_at))} · ${alarm.id}`}
              badges={<span className="alarm-badge">{copy.alarmStatus[alarm.status]}</span>}
              actions={(
                <button type="button" className="alarm-btn" onClick={() => onView(alarm.patient_id)}>
                  <Eye aria-hidden="true" size={20} />
                  {copy.history.view}
                </button>
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
                      copy.actions[alarm.action],
                      alarm.reason ? copy.reasons[alarm.reason] : null,
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
        ))}
      </ol>
    </section>
  );
}
