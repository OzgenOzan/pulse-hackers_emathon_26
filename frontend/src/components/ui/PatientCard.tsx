import { Eye, Lock, TriangleAlert } from 'lucide-react';
import { bedLabel, consultLabel, labDisplayLabel, reasonLabel, stayLabel, vitalFlagLabel } from '../../gui/clinical';
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
  const extraIssues = patient.risk_status.data_issues.filter(issue => issue.key !== reason?.key);
  const complaint = complaintOf(patient);
  const labs = patient.pending_labs.map(lab => labDisplayLabel(lab.label)).join(', ') || copy.none;
  const consults = patient.pending_consults.map(consult => consultLabel(consult.service)).join(', ') || copy.none;
  const cells = vitalCells(patient, offline);
  const flagged = cells.filter(cell => cell.state.kind === 'value' && cell.flags.length);
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
          <h3 className="card-name">{displayName(patient)} {locked && <Lock aria-label={copy.lockedBadge} size={14}><title>{copy.lockedBadge}</title></Lock>}</h3>
          <p className="card-meta">{bedLabel(patient.bed)} · {ageSex(patient)} · {protocolOf(patient)}</p>
        </div>
        <div className="card-status">
          <StatusLabel status={patient.risk_status.key} sublabel={statusSublabel(patient)} />
          {patient.risk_status.worsened && <span className="badge-worsened">{copy.worsened}</span>}
        </div>
      </header>
      <div className="card-finding">
        {reason && <p className="card-reason" title={reasonLabel(reason)}>{reasonLabel(reason)}</p>}
        {complaint && <p className="card-complaint" title={complaint}>{complaint}</p>}
      </div>
      {(extraIssues.length > 0 || patient.reconnect_pending) && <p className="card-issue">
        {[...extraIssues.map(reasonLabel), ...(patient.reconnect_pending ? [copy.reconnect] : [])].join(' · ')}
      </p>}
      <div className="vitals">
        {cells.map(c => (
          <VitalSign key={c.key} label={c.label} unit={c.unit} state={c.state} flags={c.flags} sub={c.sub} compact />
        ))}
      </div>
      {flagged.length > 0 && <div className="card-flags">
        {flagged.map(cell => {
          const critical = cell.flags.some(flag => flag.level === 'kritik');
          const Icon = critical ? TriangleAlert : Eye;
          return <span key={cell.key} className={critical ? 'flag-kritik' : 'flag-yakin_takip'}><Icon size={14} aria-hidden="true" />
            {cell.label}: {cell.flags.map(flag => vitalFlagLabel(flag.note)).join(' · ')}
          </span>;
        })}
      </div>}
      {tasks.length > 0 && (
        <ul className="card-tasks">
          {tasks.map(task => (
            <li key={task.id}>
              <TaskChip title={alertTitle(task)}>{task.level === 'GREEN'
                ? (typeof task.params.minutes === 'number' ? copy.dischargeWaitingMinutes(task.params.minutes) : copy.dischargeWaiting)
                : copy.dataIssues}</TaskChip>
            </li>
          ))}
        </ul>
      )}
      <footer className="card-foot">
        <span>{copy.stay}: {stayLabel(patient.minutes_in_zone)}</span>
        <span>{copy.lastMeasure} {lastMeasureText(patient)}</span>
      </footer>
      <div className="card-pending">
        <span title={`${copy.pendingLabs}: ${labs}`}>{copy.labsValue(labs)}</span>
        <span title={`${copy.pendingConsults}: ${consults}`}>{copy.consultsValue(consults)}</span>
      </div>
    </article>
  );
}
