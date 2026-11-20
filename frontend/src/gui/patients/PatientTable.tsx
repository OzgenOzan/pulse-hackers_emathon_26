import { Eye, Lock, TriangleAlert } from 'lucide-react';
import { StatusLabel } from '../../components/ui/StatusLabel';
import type { Alert, Summary } from '../../types';
import { bedLabel, consultLabel, labDisplayLabel, reasonLabel, stayLabel, statusLabels, vitalFlagLabel } from '../clinical';
import { copy } from './copy';
import { ageSex, alertTitle, complaintOf, describeState, displayName, lastMeasureText, protocolOf, statusSublabel, vitalCells } from './model';

export function PatientTable({ patients, tasks, blockingPatientId, offline, onOpen }: {
  patients: Summary[]; tasks: Alert[]; blockingPatientId: string | null; offline: boolean; onOpen: (id: string) => void;
}) {
  return <div className="patient-table-scroll" role="region" aria-label={copy.tableLabel} tabIndex={0}>
    <table className="patient-table">
      <thead><tr>
        <th scope="col">{copy.patientHead}</th><th scope="col">{copy.bedHead}</th><th scope="col">{copy.riskHead}</th>
        <th scope="col">{copy.scoreHead}</th><th scope="col" className="table-extra">{copy.complaint}</th><th scope="col">{copy.stay}</th>
        <th scope="col">{copy.vital.bp} <small>mmHg</small></th><th scope="col">{copy.vital.hr} <small>{copy.perMinuteUnit}</small></th><th scope="col">{copy.vital.spo2} <small>%</small></th>
        <th scope="col">{copy.vital.rr} <small>{copy.perMinuteUnit}</small></th><th scope="col">{copy.vital.temp} <small>°C</small></th><th scope="col">{copy.vital.gcs} <small>/15</small></th>
        <th scope="col">{copy.lastMeasure}</th><th scope="col" className="table-extra">{copy.pendingLabs}</th>
        <th scope="col" className="table-extra">{copy.pendingConsults}</th>
      </tr></thead>
      <tbody>{patients.map(patient => {
        const locked = !!blockingPatientId && blockingPatientId !== patient.id;
        const issues = [...new Set([...patient.risk_status.reasons, ...patient.risk_status.data_issues].map(reasonLabel))];
        const activeTasks = tasks.filter(a => a.patient_id === patient.id && a.status === 'active');
        return <tr key={patient.id} data-testid={`board-row-${patient.id}`} data-status={patient.risk_status.key}
          data-locked={locked || undefined} onClick={() => onOpen(patient.id)}>
          <th scope="row"><button type="button" className="table-patient" onClick={event => { event.stopPropagation(); onOpen(patient.id); }}>
            <span>{displayName(patient)}</span>
            <small>{protocolOf(patient)} · {ageSex(patient)}{locked && <Lock size={14} aria-label={copy.lockedBadge} />}</small>
          </button></th>
          <td>{bedLabel(patient.bed)}</td>
          <td className="table-risk" title={[...issues, ...activeTasks.map(alertTitle)].join(' · ')}>
            <StatusLabel status={patient.risk_status.key} sublabel={statusSublabel(patient)} />
            {patient.risk_status.worsened && <span className="badge-worsened">{copy.worsened}</span>}
            {patient.risk_status.key === 'siniflandirilmamis' && issues[0] && <small className="table-issue">{issues[0]}</small>}
            {patient.risk_status.key !== 'siniflandirilmamis' && patient.risk_status.data_issues[0] &&
              <small className="table-issue">{reasonLabel(patient.risk_status.data_issues[0])}</small>}
            {patient.risk_status.key === 'stabil' && activeTasks.length > 0 && <small className="table-issue">{copy.dischargePending}</small>}
          </td>
          <td>{offline ? <span className="table-gap">{copy.stale}</span> : patient.score}</td>
          <td className="table-extra">{complaintOf(patient) ?? copy.none}</td><td>{stayLabel(patient.minutes_in_zone)}</td>
          {vitalCells(patient, offline).map(cell => {
            const flags = cell.state.kind === 'value' ? cell.flags : [];
            const severity = flags.some(f => f.level === 'kritik') ? 'kritik' : flags[0]?.level;
            const value = describeState(cell.state);
            const note = flags.map(flag => vitalFlagLabel(flag.note)).join(' · ');
            return <td key={cell.key} className="table-vital" data-flag={severity} title={note || undefined}>
              {cell.state.kind === 'stale' ? <span className="table-gap">{copy.stale}<small>{cell.state.time}</small></span>
                : <span className={cell.state.kind === 'value' ? 'table-value' : 'table-gap'}>{value}</span>}
              {note && (severity === 'kritik'
                ? <TriangleAlert className="table-flag" size={14} aria-label={`${statusLabels.kritik}: ${note}`} />
                : <Eye className="table-flag" size={14} aria-label={`${statusLabels.yakin_takip}: ${note}`} />)}
              {cell.sub && <small title={copy.mapTitle(cell.sub)}>
                {cell.state.kind === 'stale' && cell.sub.endsWith(value) ? `${copy.oab} —` : cell.sub}</small>}
            </td>;
          })}
          <td className="table-last">{lastMeasureText(patient)}</td>
          <td className="table-extra">{patient.pending_labs.map(lab => labDisplayLabel(lab.label)).join(', ') || copy.none}</td>
          <td className="table-extra">{patient.pending_consults.map(c => consultLabel(c.service)).join(', ') || copy.none}</td>
        </tr>;
      })}</tbody>
    </table>
  </div>;
}
