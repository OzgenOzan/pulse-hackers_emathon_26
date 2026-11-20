import { PatientCard } from '../../components/ui/PatientCard';
import type { ListMode } from '../../components/ui/FilterBar';
import type { Alert, CriticalAlarm, Summary } from '../../types';
import { copy } from './copy';
import { PatientTable } from './PatientTable';
import './patients.css';

/** Cards and table share the same selection and ordering. */
export function Patients({
  patients,
  activeAlarms,
  tasks,
  blockingPatientId,
  offline,
  mode,
  onOpen,
}: {
  patients: Summary[];
  activeAlarms: ReadonlyMap<string, CriticalAlarm>;
  tasks: Alert[];
  blockingPatientId: string | null;
  offline: boolean;
  mode: ListMode;
  onOpen: (id: string) => void;
}) {
  if (patients.length === 0) return <p className="patients-empty">{copy.listEmpty}</p>;
  if (mode === 'table') return <PatientTable {...{ patients, activeAlarms, tasks, blockingPatientId, offline, onOpen }} />;
  return (
    <section className="patients" aria-label={copy.list}>
      <div className="patient-grid">
        {patients.map(p => (
          <PatientCard
            key={p.id}
            patient={p}
            activeAlarm={activeAlarms.get(p.id)}
            tasks={tasks.filter(a => a.patient_id === p.id && a.status === 'active')}
            locked={!!blockingPatientId && blockingPatientId !== p.id}
            offline={offline}
            onOpen={() => onOpen(p.id)}
          />
        ))}
      </div>
    </section>
  );
}
