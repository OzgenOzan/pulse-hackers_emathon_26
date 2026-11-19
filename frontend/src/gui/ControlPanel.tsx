import { useEffect, useRef, useState } from 'react';
import { api, ApiError } from '../api';
import { AboutPrototype } from '../components/AboutPrototype';
import { DemoControls } from '../components/DemoControls';
import { AlarmHistory, AlarmPanel, EvaluationSheet, ManualVitals, TaskActions } from './alarms/AlarmFlows';
import { Patients } from './patients/Patients';
import { PatientSheet } from './patients/PatientSheet';
import { GuiShell } from './shell/GuiShell';
import { readView, viewHash, type View } from './navigation';
import { guiError, useSession } from './useSession';
import type { Alert, CriticalAlarm, Detail, ManualValues, OverviewKey, Role, RulesView, ScenarioInfo } from '../types';
import './integration.css';

const LOCK_NOTICE = 'Önce kritik alarm için klinik değerlendirme kaydı oluşturun.';
type ReplaySelection = { id: string; replay: string };

export function ControlPanel() {
  const [view, setView] = useState(readView);
  const [config, setConfig] = useState<RulesView | null>(null);
  const [scenarios, setScenarios] = useState<ScenarioInfo[]>([]);
  const [filter, setFilter] = useState<OverviewKey | null>(null);
  const [notice, setNotice] = useState('');
  const [about, setAbout] = useState(false);
  const [detail, setDetail] = useState<{ key: string; value: Detail } | null>(null);
  const [history, setHistory] = useState<{ replay: string; alarms: CriticalAlarm[] } | null>(null);
  const [evaluation, setEvaluation] = useState<ReplaySelection | null>(null);
  const [manual, setManual] = useState<ReplaySelection | null>(null);
  const alarmAnchor = useRef<HTMLDivElement>(null);
  const { state, revision, busy, connection, lastSuccess, mutate } = useSession(view.role, setNotice);
  const offline = connection === 'offline';
  const replay = state?.sim.replay_id;
  const simTime = state?.sim.time;
  const blockingPatientId = state?.critical_alarms.find(a => a.id === state.blocking_alert_id)?.patient_id ?? null;
  const summary = (!blockingPatientId || view.patient === blockingPatientId)
    ? state?.patients.find(p => p.id === view.patient) : undefined;
  const selectedId = summary?.id;
  const detailKey = `${replay}/${view.role}/${selectedId ?? ''}`;
  const editing = view.role === 'physician' && evaluation?.replay === replay
    ? state?.critical_alarms.find(a => a.id === evaluation?.id && (!blockingPatientId || a.blocking)) : undefined;
  const entering = view.role === 'nurse' && manual?.replay === replay && manual?.id === selectedId ? summary : undefined;

  function navigate(next: View, replace = false) {
    const hash = viewHash(next);
    if (location.hash !== hash) {
      if (replace) window.history.replaceState(null, '', hash);
      else window.history.pushState(null, '', hash);
    }
    setView(next);
  }

  function select(id: string): boolean {
    if (blockingPatientId && id !== blockingPatientId) {
      setNotice(LOCK_NOTICE);
      return false;
    }
    if (!state?.patients.some(p => p.id === id)) {
      setNotice('Hasta artık aktif hasta listesinde değil.');
      return false;
    }
    navigate({ ...view, patient: id });
    return true;
  }

  function setRole(role: Role) {
    if (busy || view.role === role) return;
    setManual(null);
    setEvaluation(null);
    setFilter(null);
    navigate({ ...view, role, patient: null });
  }

  useEffect(() => {
    if (!location.hash.startsWith('#/')) window.history.replaceState(null, '', viewHash(readView()));
    const update = () => setView(readView());
    window.addEventListener('popstate', update);
    window.addEventListener('hashchange', update);
    return () => {
      window.removeEventListener('popstate', update);
      window.removeEventListener('hashchange', update);
    };
  }, []);

  useEffect(() => {
    let active = true;
    void Promise.all([api.config(), api.scenarios()]).then(([rules, demos]) => {
      if (active) { setConfig(rules); setScenarios(demos); }
    }).catch(error => { if (active) setNotice(guiError(error)); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(''), 6000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    if (!view.patient || !blockingPatientId || view.patient === blockingPatientId) return;
    setNotice(LOCK_NOTICE);
  }, [view.patient, blockingPatientId]);

  useEffect(() => {
    if (!selectedId || offline) return;
    let active = true;
    void api.patient(selectedId, view.role).then(value => {
      if (active) setDetail({ key: detailKey, value });
    }).catch(error => {
      if (active && (!(error instanceof ApiError) || error.status !== 404)) setNotice(guiError(error));
    });
    return () => { active = false; };
  }, [selectedId, view.role, detailKey, simTime, revision, offline]);

  useEffect(() => {
    if (view.route !== 'klinik-alarmlar' || !replay || offline) return;
    let active = true;
    void api.alarms().then(alarms => {
      if (active) setHistory({ replay, alarms });
    }).catch(error => { if (active) setNotice(guiError(error)); });
    return () => { active = false; };
  }, [view.route, replay, revision, simTime, offline]);

  function markSeen(alarm: CriticalAlarm) {
    if (replay) void mutate(() => api.seen(alarm.id, view.role, replay));
  }

  function taskAck(alert: Alert, action: string, reason?: string) {
    if (blockingPatientId) { setNotice(LOCK_NOTICE); return; }
    if (replay && alert.target_role === view.role) void mutate(() => api.ack(alert.id, { action, reason }, replay));
  }

  function saveEvaluation(action: string, reason?: string, note?: string) {
    if (editing && replay && view.role === 'physician') {
      void mutate(() => api.ack(editing.id, { action, reason, note }, replay)).then(ok => {
        if (ok) setEvaluation(null);
      });
    }
  }

  function openVitals(id: string) {
    if (view.role === 'nurse' && config && !offline && replay && select(id)) setManual({ id, replay });
  }

  function saveVitals(values: ManualValues) {
    if (entering && replay) {
      void mutate(() => api.vitals(entering.id, values, replay)).then(ok => { if (ok) setManual(null); });
    }
  }

  const alarms = state?.critical_alarms ?? [];
  const tasks = state?.tasks ?? [];
  const filtered = state?.patients.filter(patient => {
    if (filter === null || filter === 'aktif') return true;
    if (filter === 'taburculuk_bekleyen') return tasks.some(a => a.level === 'GREEN' && a.patient_id === patient.id);
    if (filter === 'bekleyen_islem') return (view.role === 'physician' && alarms.some(a => a.patient_id === patient.id))
      || tasks.some(a => a.target_role === view.role && a.patient_id === patient.id);
    return patient.risk_status.key === filter;
  }) ?? [];
  const selectedTasks = tasks.filter(a => a.patient_id === selectedId);
  const savedAlarms = history?.replay === replay ? history?.alarms : undefined;

  return (
    <GuiShell role={view.role} state={state} busy={busy || offline} connection={connection} lastSuccess={lastSuccess}
      filter={filter} onFilter={key => {
        setFilter(old => old === key ? null : key);
        if (view.route !== 'genel-bakis') navigate({ ...view, route: 'genel-bakis' });
      }} onRole={setRole} onAbout={() => setAbout(true)}
      onAlarm={() => {
        if (alarms.length && view.route === 'genel-bakis') {
          alarmAnchor.current?.scrollIntoView({ block: 'start' });
          alarmAnchor.current?.focus({ preventScroll: true });
        } else navigate({ ...view, route: 'klinik-alarmlar', patient: null });
      }}
      demo={state && <DemoControls sim={state.sim} scenarios={scenarios} busy={busy || offline}
        onReset={id => void mutate(() => api.reset(id)).then(ok => {
          if (!ok) return;
          setManual(null); setEvaluation(null); setFilter(null); setNotice('');
          navigate({ role: view.role, route: 'genel-bakis', patient: null }, true);
          window.scrollTo(0, 0);
        })} onPlay={speed => void mutate(() => api.play(speed))} onPause={() => void mutate(api.pause)}
        onStep={() => void mutate(api.step)} />}
      alarm={alarms.length > 0 && <div ref={alarmAnchor} className="gui-alarm-anchor" tabIndex={-1}>
        <AlarmPanel alarms={alarms} role={view.role} busy={busy} offline={offline} onView={select} onSeen={markSeen}
          onEvaluate={alarm => { if (replay && view.role === 'physician') setEvaluation({ id: alarm.id, replay }); }} />
      </div>}
      floating={<>
        {summary && <PatientSheet summary={summary} detail={detail?.key === detailKey ? detail.value : null}
          config={config} offline={offline} onClose={() => { setManual(null); navigate({ ...view, patient: null }); }}
          actions={<>
            <TaskActions tasks={selectedTasks} patients={state?.patients} role={view.role} busy={busy} offline={offline}
              onAck={taskAck} onVitals={openVitals} />
            {view.role === 'nurse' && !selectedTasks.some(a => a.recommended_actions.includes('vitals_entered')) &&
              <button type="button" className="gui-primary" data-testid="detail-enter-vitals" disabled={!config || busy || offline}
                onClick={() => openVitals(summary.id)}>Vital gir</button>}
          </>} />}
        {editing && <EvaluationSheet key={`${replay}/${editing.id}`} alarm={editing} busy={busy} offline={offline}
          onClose={() => setEvaluation(null)} onSave={saveEvaluation} />}
        {entering && config && <ManualVitals key={`${replay}/${entering.id}`} profile={entering} rules={config.manual_entry}
          busy={busy || offline} onClose={() => setManual(null)} onSave={saveVitals} />}
        {about && <AboutPrototype onClose={() => setAbout(false)} />}
        {notice && <div className="gui-feedback" role="alert">{notice}</div>}
      </>}>
      {!state ? <p role="status">Simüle hasta listesi yükleniyor…</p> : view.route === 'klinik-alarmlar' ? (
        <section aria-labelledby="gui-history-title">
          <div className="gui-list-head"><h2 id="gui-history-title">Klinik Alarmlar</h2>
            <button type="button" data-testid="nav-genel-bakis" onClick={() => navigate({ ...view, route: 'genel-bakis' })}>Genel Bakış</button>
          </div>
          {savedAlarms ? <AlarmHistory alarms={savedAlarms} onView={select} /> : <p role="status">Alarm geçmişi yükleniyor…</p>}
        </section>
      ) : (
        <section aria-labelledby="gui-patient-title" className="gui-patient-section">
          <div className="gui-list-head"><h2 id="gui-patient-title">Aktif Hastalar</h2>
            <button type="button" data-testid="nav-klinik-alarmlar" onClick={() => navigate({ ...view, route: 'klinik-alarmlar', patient: null })}>Klinik Alarmlar</button>
          </div>
          <Patients patients={filtered} tasks={tasks} blockingPatientId={blockingPatientId} offline={offline} onOpen={select} />
        </section>
      )}
    </GuiShell>
  );
}
