import { PatientCard } from '../../components/ui/PatientCard';
import type { Alert, Summary } from '../../types';
import { copy } from './copy';
import { compareRisk } from './model';
import './patients.css';

/** Risk-ordered patient cards. Locked cards still open, so the controller can show the prescribed notice. */
export function Patients({
  patients,
  tasks,
  blockingPatientId,
  offline,
  onOpen,
}: {
  patients: Summary[];
  tasks: Alert[];
  blockingPatientId: string | null;
  offline: boolean;
  onOpen: (id: string) => void;
}) {
  if (patients.length === 0) return <p className="patients-empty">{copy.listEmpty}</p>;
  const rows = [...patients].sort(compareRisk);
  return (
    <section className="patients" aria-label={copy.list}>
      <div className="patient-grid">
        {rows.map(p => (
          <PatientCard
            key={p.id}
            patient={p}
            tasks={tasks.filter(a => a.patient_id === p.id && a.status === 'active')}
            locked={blockingPatientId === p.id}
            offline={offline}
            onOpen={() => onOpen(p.id)}
          />
        ))}
      </div>
    </section>
  );
}
