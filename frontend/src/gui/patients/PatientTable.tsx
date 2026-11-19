import { Eye, Lock, TriangleAlert } from 'lucide-react';
import { StatusLabel } from '../../components/ui/StatusLabel';
import type { Alert, Summary } from '../../types';
import { bedLabel, labDisplayLabel, reasonLabel, stayLabel } from '../clinical';
import { copy } from './copy';
import { ageSex, alertTitle, complaintOf, describeState, displayName, lastMeasureText, protocolOf, statusSublabel, vitalCells } from './model';

export function PatientTable({ patients, tasks, blockingPatientId, offline, onOpen }: {
  patients: Summary[]; tasks: Alert[]; blockingPatientId: string | null; offline: boolean; onOpen: (id: string) => void;
}) {
  return <div className="patient-table-scroll" role="region" aria-label="Hasta tablosu" tabIndex={0}>
    <table className="patient-table">
      <thead><tr>
        <th scope="col">Hasta / Protokol</th><th scope="col">Yatak</th><th scope="col">Klinik risk</th>
        <th scope="col">Puan</th><th scope="col" className="table-extra">Başvuru şikâyeti</th><th scope="col">Acilde</th>
        <th scope="col">KB <small>mmHg</small></th><th scope="col">Nabız <small>/dk</small></th><th scope="col">SpO₂ <small>%</small></th>
        <th scope="col">SS <small>/dk</small></th><th scope="col">Ateş <small>°C</small></th><th scope="col">GKS <small>/15</small></th>
        <th scope="col">Son ölçüm</th><th scope="col" className="table-extra">Bekleyen tetkik</th>
        <th scope="col" className="table-extra">Bekleyen konsültasyon</th>
      </tr></thead>
      <tbody>{patients.map(patient => {
        const locked = !!blockingPatientId && blockingPatientId !== patient.id;
        const issues = [...new Set([...patient.risk_status.reasons, ...patient.risk_status.data_issues].map(reasonLabel))];
        const activeTasks = tasks.filter(a => a.patient_id === patient.id && a.status === 'active');
        return <tr key={patient.id} data-testid={`board-row-${patient.id}`} data-status={patient.risk_status.key}
          data-locked={locked || undefined} onClick={() => onOpen(patient.id)}>
          <th scope="row"><button type="button" className="table-patient" onClick={event => { event.stopPropagation(); onOpen(patient.id); }}>
            <span>{displayName(patient)}</span>
            <small>{protocolOf(patient)} · {ageSex(patient)}{locked && <Lock size={14} aria-label="Kilitli" />}</small>
          </button></th>
          <td>{bedLabel(patient.bed)}</td>
          <td className="table-risk" title={[...issues, ...activeTasks.map(alertTitle)].join(' · ')}>
            <StatusLabel status={patient.risk_status.key} sublabel={statusSublabel(patient)} />
            {patient.risk_status.worsened && <span className="badge-worsened">{copy.worsened}</span>}
            {patient.risk_status.key === 'siniflandirilmamis' && issues[0] && <small className="table-issue">{issues[0]}</small>}
            {patient.risk_status.key !== 'siniflandirilmamis' && patient.risk_status.data_issues[0] &&
              <small className="table-issue">{reasonLabel(patient.risk_status.data_issues[0])}</small>}
            {patient.risk_status.key === 'stabil' && activeTasks.length > 0 && <small className="table-issue">Taburculuk bekliyor</small>}
          </td>
          <td>{offline ? <span className="table-gap">Güncel değil</span> : patient.score}</td>
          <td className="table-extra">{complaintOf(patient) ?? copy.none}</td><td>{stayLabel(patient.minutes_in_zone)}</td>
          {vitalCells(patient, offline).map(cell => {
            const flags = cell.state.kind === 'value' ? cell.flags : [];
            const severity = flags.some(f => f.level === 'kritik') ? 'kritik' : flags[0]?.level;
            const value = describeState(cell.state);
            const note = flags.map(flag => flag.note).join(' · ');
            return <td key={cell.key} className="table-vital" data-flag={severity} title={note || undefined}>
              {cell.state.kind === 'stale' ? <span className="table-gap">Güncel değil<small>{cell.state.time}</small></span>
                : <span className={cell.state.kind === 'value' ? 'table-value' : 'table-gap'}>{value}</span>}
              {note && (severity === 'kritik'
                ? <TriangleAlert className="table-flag" size={14} aria-label={`Kritik: ${note}`} />
                : <Eye className="table-flag" size={14} aria-label={`Yakın Takip: ${note}`} />)}
              {cell.sub && <small title={`Ortalama arter basıncı: ${cell.sub}`}>
                {cell.state.kind === 'stale' && cell.sub.endsWith(value) ? 'OAB —' : cell.sub}</small>}
            </td>;
          })}
          <td className="table-last">{lastMeasureText(patient)}</td>
          <td className="table-extra">{patient.pending_labs.map(lab => labDisplayLabel(lab.label)).join(', ') || copy.none}</td>
          <td className="table-extra">{patient.pending_consults.map(c => c.service).join(', ') || copy.none}</td>
        </tr>;
      })}</tbody>
    </table>
  </div>;
}
