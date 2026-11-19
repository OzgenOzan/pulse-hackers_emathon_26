import { Lock } from 'lucide-react';
import { bedLabel, reasonLabel, stayLabel } from '../../gui/clinical';
import {
  ageSex,
  alertTitle,
  complaintOf,
  displayName,
  lastMeasureText,
  protocolOf,
  statusSublabel,
  vitalCells,
} from '../../gui/patients/model';
import { copy } from '../../gui/patients/copy';
import type { Alert, Summary } from '../../types';
import { StatusLabel } from './StatusLabel';
import { TaskChip } from './TaskChip';
import { VitalSign } from './VitalSign';

/** One patient. The whole card opens the sheet, even when locked, so the controller can show the prescribed notice. */
export function PatientCard({
  patient,
  tasks,
  locked,
  offline,
  onOpen,
}: {
  patient: Summary;
  tasks: Alert[];
  locked: boolean;
  offline: boolean;
  onOpen: () => void;
}) {
  const [reason] = patient.risk_status.reasons;
  const [issue] = patient.risk_status.data_issues;
  const complaint = complaintOf(patient);
  return (
    <article
      className="patient-card"
      data-testid={`board-row-${patient.id}`}
      data-status={patient.risk_status.key}
      data-locked={locked || undefined}
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen();
        }
      }}
    >
      <header className="card-head">
        <div>
          <h3 className="card-name">{displayName(patient)}</h3>
          <p className="card-meta">{bedLabel(patient.bed)} · {ageSex(patient)} · {protocolOf(patient)}</p>
        </div>
        {locked && (
          <span className="badge-locked">
            <Lock aria-hidden="true" size={14} />
            {copy.lockedBadge}
          </span>
        )}
      </header>
      <StatusLabel status={patient.risk_status.key} sublabel={statusSublabel(patient)} />
      {patient.risk_status.worsened && <span className="badge-worsened">{copy.worsened}</span>}
      {reason && <p className="card-reason">{reasonLabel(reason)}</p>}
      {issue && <p className="card-issue">{reasonLabel(issue)}</p>}
      {patient.reconnect_pending && <p className="card-issue">{copy.reconnect}</p>}
      <div className="vitals">
        {vitalCells(patient, offline).map(c => (
          <VitalSign key={c.key} label={c.label} unit={c.unit} state={c.state} flags={c.flags} sub={c.sub} />
        ))}
      </div>
      {tasks.length > 0 && (
        <ul className="card-tasks">
          {tasks.map(task => (
            <li key={task.id}>
              <TaskChip>{alertTitle(task)}</TaskChip>
            </li>
          ))}
        </ul>
      )}
      <footer className="card-foot">
        {complaint && <span>{complaint}</span>}
        <span>{copy.stay}: {stayLabel(patient.minutes_in_zone)}</span>
        <span>{lastMeasureText(patient)}</span>
      </footer>
    </article>
  );
}
