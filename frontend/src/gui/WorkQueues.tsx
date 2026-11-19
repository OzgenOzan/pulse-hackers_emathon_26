import type { ReactNode } from 'react';
import { fmtTime } from '../format';
import type { State } from '../types';
import { TaskActions, type TaskActionsProps } from './alarms/AlarmFlows';
import { bedLabel, labDisplayLabel } from './clinical';
import type { Route } from './navigation';

export function WorkQueues({ route, state, alarmPanel, taskProps, onOpen }: {
  route: Route; state: State; alarmPanel: ReactNode;
  taskProps: Omit<TaskActionsProps, 'tasks' | 'patients'>;
  onOpen: (patient: string) => void;
}) {
  const showPhysician = route !== 'hemsire-paneli';
  const showNurse = route !== 'hekim-paneli';
  const injuries = state.tasks.filter(task => task.target_role === 'nurse');
  const discharges = state.tasks.filter(task => task.target_role === 'physician');
  return <div className="work-queues">
    {showPhysician && <>
      <section>
        <h3>Değerlendirme kaydı bekleyen alarmlar</h3>
        {alarmPanel || <p>Kaydedilmemiş kritik alarm yok.</p>}
      </section>
      <section><h3>Taburculuk değerlendirmeleri</h3><TaskActions {...taskProps} tasks={discharges} patients={state.patients} /></section>
    </>}
    {showNurse && <section><h3>Veri eksiklikleri</h3><TaskActions {...taskProps} tasks={injuries} patients={state.patients} /></section>}
    {route === 'bekleyen-islemler' && (['pending_labs', 'pending_consults'] as const).map(kind => {
      const patients = state.patients.filter(patient => patient[kind].length > 0);
      return <section key={kind}>
        <h3>{kind === 'pending_labs' ? 'Bekleyen tetkikler' : 'Bekleyen konsültasyonlar'}</h3>
        {patients.length === 0 ? <p>Bekleyen kayıt yok.</p> : <ul className="pending-records">
          {patients.map(patient => <li key={patient.id}>
            <button type="button" onClick={() => onOpen(patient.id)}>{bedLabel(patient.bed)} · {patient.display?.name ?? patient.label}</button>
            <span>{patient[kind].map(item => 'label' in item
              ? `${labDisplayLabel(item.label)} · ${fmtTime(item.ordered_at)}`
              : `${item.service} · ${fmtTime(item.requested_at)}`).join(' / ')}</span>
          </li>)}
        </ul>}
      </section>;
    })}
  </div>;
}
