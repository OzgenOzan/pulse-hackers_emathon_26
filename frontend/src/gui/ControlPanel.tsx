import { useEffect, useId, useState } from 'react';
import { api, ApiError } from '../api';
import { AboutPrototype } from '../components/AboutPrototype';
import { DemoControls } from '../components/DemoControls';
import { FilterBar, type ListMode } from '../components/ui/FilterBar';
import { AlarmHistory, AlarmPanel, AlarmStrip, EvaluationSheet, ManualVitals, TaskActions } from './alarms/AlarmFlows';
import { copy as alarmCopy } from './alarms/copy';
import { Patients } from './patients/Patients';
import { PatientSheet } from './patients/PatientSheet';
import { filterPatients, emptyFilters } from './patients/filters';
import { GuiShell } from './shell/GuiShell';
import { readView, routeLabels, viewHash, type Route, type View } from './navigation';
import { shellCopy } from './shell/copy';
import { useMediaQuery } from './shell/media';
import { Settings } from './Settings';
import { ShiftAnalytics } from './ShiftAnalytics';
import { useChoice, useTheme } from './usePreferences';
import { WorkQueues } from './WorkQueues';
import { guiError, useSession } from './useSession';
import { fmtTime } from '../format';
import { changeLanguage, getLanguage, t } from '../i18n';
import { roleLabels, statusLabels } from './clinical';
import type { Alert, AuditEntry, CriticalAlarm, Detail, Language, ManualValues, OverviewKey, Role, RulesView, ScenarioInfo } from '../types';
import './integration.css';

const lockNotice = () => t('gui.error.red_navigation_blocked');
const RESOURCE_RETRY_MS = 2000;
type ReplaySelection = { id: string; replay: string };

export function ControlPanel() {
  const [view, setView] = useState(readView);
  const [config, setConfig] = useState<RulesView | null>(null);
  const [scenarios, setScenarios] = useState<ScenarioInfo[]>([]);
  const [statFilter, setStatFilter] = useState<OverviewKey | null>(null);
  const [filters, setFilters] = useState(emptyFilters);
  const [mode, setMode] = useChoice<ListMode>('sg.list-mode', ['cards', 'table'], 'cards');
  const [theme, setTheme] = useTheme();
  const [language, setLanguage] = useState(getLanguage);
  const [notice, setNotice] = useState('');
  const [about, setAbout] = useState(false);
  const [detail, setDetail] = useState<{ key: string; value: Detail } | null>(null);
  const [history, setHistory] = useState<{ replay: string; alarms: CriticalAlarm[] } | null>(null);
  const [audit, setAudit] = useState<{ replay: string; entries: AuditEntry[] } | null>(null);
  const [evaluation, setEvaluation] = useState<ReplaySelection | null>(null);
  const [manual, setManual] = useState<ReplaySelection | null>(null);
  const [alarmAnchor, setAlarmAnchor] = useState<HTMLDivElement | null>(null);
  const mobile = useMediaQuery('(max-width: 767px)');
  const manualReasonId = useId();
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

  function goTo(route: Route) {
    if (view.route === route && view.patient === null) return;
    setManual(null);
    setEvaluation(null);
    setStatFilter(null);
    setFilters(emptyFilters);
    navigate({ ...view, route, patient: null });
    window.scrollTo(0, 0);
  }

  function select(id: string): boolean {
    if (blockingPatientId && id !== blockingPatientId) {
      setNotice(lockNotice());
      return false;
    }
    if (!state?.patients.some(p => p.id === id)) {
      setNotice(t('gui.error.patientInactive'));
      return false;
    }
    navigate({ ...view, patient: id });
    return true;
  }

  function setRole(role: Role) {
    if (busy || view.role === role) return;
    setManual(null);
    setEvaluation(null);
    setStatFilter(null);
    navigate({ ...view, role, patient: null });
  }

  function chooseLanguage(next: Language) {
    setLanguage(changeLanguage(next));
    setNotice('');
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
    const lifetime = new AbortController();
    const load = <T,>(read: (signal: AbortSignal) => Promise<T>, accept: (value: T) => void) => {
      let timer: number | undefined;
      const attempt = async () => {
        try {
          const value = await read(AbortSignal.any([lifetime.signal, AbortSignal.timeout(5000)]));
          if (!lifetime.signal.aborted) accept(value);
        } catch {
          if (!lifetime.signal.aborted) timer = window.setTimeout(attempt, RESOURCE_RETRY_MS);
        }
      };
      void attempt();
      return () => window.clearTimeout(timer);
    };
    const cancelConfigRetry = load(api.config, setConfig);
    const cancelScenarioRetry = load(api.scenarios, setScenarios);
    return () => {
      lifetime.abort();
      cancelConfigRetry();
      cancelScenarioRetry();
    };
  }, []);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(''), 6000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    if (!view.patient || !blockingPatientId || view.patient === blockingPatientId) return;
    setNotice(lockNotice());
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

  useEffect(() => {
    if (view.route !== 'istatistik-ve-analiz' || !replay || offline) return;
    let active = true;
    void api.audit().then(entries => {
      if (active) setAudit({ replay, entries });
    }).catch(error => { if (active) setNotice(guiError(error)); });
    return () => { active = false; };
  }, [view.route, replay, revision, simTime, offline]);

  function markSeen(alarm: CriticalAlarm) {
    if (replay) void mutate(() => api.seen(alarm.id, view.role, replay));
  }

  function taskAck(alert: Alert, action: string, reason?: string) {
    if (blockingPatientId) { setNotice(lockNotice()); return; }
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
    if (view.role === 'nurse' && config && !busy && !offline && replay && select(id)) setManual({ id, replay });
  }

  function saveVitals(values: ManualValues) {
    if (entering && replay) {
      void mutate(() => api.vitals(entering.id, values, replay)).then(ok => { if (ok) setManual(null); });
    }
  }

  const alarms = state?.critical_alarms ?? [];
  const activeAlarms = new Map(alarms.map(alarm => [alarm.patient_id, alarm]));
  const patientsById = new Map(state?.patients.map(patient => [patient.id, patient]));
  const tasks = state?.tasks ?? [];
  const listPage = view.route === 'genel-bakis' || view.route === 'aktif-hastalar' || view.route === 'kritik-hastalar';
  const queuePage = view.route === 'bekleyen-islemler' || view.route === 'hekim-paneli' || view.route === 'hemsire-paneli';
  const criticalPreset = view.route === 'kritik-hastalar';
  const stats = state?.patients.filter(patient => {
    if (criticalPreset) return patient.risk_status.key === 'kritik';
    if (statFilter === null || statFilter === 'aktif') return true;
    if (statFilter === 'taburculuk_bekleyen') return tasks.some(a => a.level === 'GREEN' && a.patient_id === patient.id);
    if (statFilter === 'bekleyen_islem') return (view.role === 'physician' && alarms.some(a => a.patient_id === patient.id))
      || tasks.some(a => a.target_role === view.role && a.patient_id === patient.id);
    return patient.risk_status.key === statFilter;
  }) ?? [];
  const overdueMinutes = config?.yellow.vitals_overdue_minutes;
  const filtered = listPage && simTime ? filterPatients(stats, filters, simTime, overdueMinutes) : [];
  const selectedTasks = tasks.filter(a => a.patient_id === selectedId);
  const savedAlarms = history?.replay === replay ? history?.alarms : undefined;
  const statChip = criticalPreset ? { label: statusLabels.kritik, clear: () => goTo('aktif-hastalar') }
    : statFilter ? { label: shellCopy.stats[statFilter], clear: () => setStatFilter(null) } : undefined;
  const vitalsUnavailable = config ? undefined : alarmCopy.tasks.vitalsRulesUnavailable;
  const taskProps = { role: view.role, busy, offline, onAck: taskAck, onVitals: openVitals,
    lockReason: blockingPatientId ? lockNotice() : undefined, vitalsUnavailable };
  const openEvaluation = (alarm: CriticalAlarm) => {
    if (replay && view.role === 'physician' && (!blockingPatientId || alarm.blocking)) setEvaluation({ id: alarm.id, replay });
  };
  const alarmPanel = alarms.length > 0 && <AlarmPanel alarms={alarms} patients={patientsById} role={view.role} busy={busy} offline={offline}
    onView={select} onSeen={markSeen} onEvaluate={openEvaluation} />;
  const selectedAlarm = selectedId ? activeAlarms.get(selectedId) : undefined;
  const seenByRole = selectedAlarm?.seen[view.role];

  return (
    <GuiShell role={view.role} state={state} busy={busy || offline} connection={connection} lastSuccess={lastSuccess}
      route={view.route} onNavigate={goTo} showOverview={view.route === 'genel-bakis'} theme={theme} onTheme={setTheme}
      filter={statFilter} onFilter={key => setStatFilter(old => old === key ? null : key)} onRole={setRole} onAbout={() => setAbout(true)}
      onAlarm={() => {
        if (alarmAnchor) {
          alarmAnchor.scrollIntoView({ block: 'start' });
          alarmAnchor.focus({ preventScroll: true });
        } else goTo('klinik-alarmlar');
      }}
      demo={state && <DemoControls sim={state.sim} scenarios={scenarios} busy={busy || offline}
        cycleMinutes={config?.cycle_minutes}
        onReset={id => void mutate(() => api.reset(id)).then(ok => {
          if (!ok) return;
          setManual(null); setEvaluation(null); setStatFilter(null); setFilters(emptyFilters); setNotice('');
          navigate({ role: view.role, route: 'genel-bakis', patient: null }, true);
          window.scrollTo(0, 0);
        })} onPlay={speed => void mutate(() => api.play(speed))} onPause={() => void mutate(api.pause)}
        onStep={minutes => void mutate(() => api.step(minutes))} />}
      stickyAlarm={listPage && alarms.length > 0 &&
        <AlarmStrip key={replay} alarms={alarms} panel={alarmAnchor} onView={select} />}
      alarm={alarmPanel && view.route === 'genel-bakis' && !mobile &&
        <div ref={setAlarmAnchor} className="gui-alarm-anchor" tabIndex={-1}>{alarmPanel}</div>}
      floating={<>
        {summary && <PatientSheet summary={summary} activeAlarm={selectedAlarm} detail={detail?.key === detailKey ? detail.value : null}
          config={config} offline={offline} modal={mobile} onClose={() => { setManual(null); navigate({ ...view, patient: null }); }}
          primaryActions={mobile && selectedAlarm && <div className="mobile-alarm-actions">
            {seenByRole
              ? <span>{alarmCopy.panel.seenAt(fmtTime(seenByRole.at), roleLabels[view.role])}</span>
              : <button type="button" disabled={busy || offline} data-testid={`alarm-mobile-seen-${summary.id}`}
                  onClick={() => markSeen(selectedAlarm)}>{alarmCopy.panel.seen}</button>}
            <button type="button" className="primary" disabled={busy || offline || view.role !== 'physician'}
              aria-describedby={view.role === 'nurse' ? 'mobile-evaluate-role' : undefined}
              data-testid={`alarm-mobile-evaluate-${summary.id}`} onClick={() => openEvaluation(selectedAlarm)}>
              {alarmCopy.panel.evaluate}
            </button>
            {view.role === 'nurse' && <span id="mobile-evaluate-role">{alarmCopy.panel.nurseEvaluate}</span>}
          </div>}
          actions={<>
            <TaskActions {...taskProps} tasks={selectedTasks} patients={state?.patients} />
            {view.role === 'nurse' && !selectedTasks.some(a => a.recommended_actions.includes('vitals_entered')) &&
              <div className="alarm-action">
                <button type="button" className="gui-primary" data-testid="detail-enter-vitals" disabled={!config || busy || offline}
                  aria-describedby={vitalsUnavailable ? manualReasonId : undefined}
                  onClick={() => openVitals(summary.id)}>{alarmCopy.tasks.vitals}</button>
                {vitalsUnavailable && <span className="alarm-reason" id={manualReasonId}>{vitalsUnavailable}</span>}
              </div>}
          </>} />}
        {editing && <EvaluationSheet key={`${replay}/${editing.id}`} alarm={editing} current={patientsById.get(editing.patient_id)} busy={busy} offline={offline}
          onClose={() => setEvaluation(null)} onSave={saveEvaluation} />}
        {entering && config && <ManualVitals key={`${replay}/${entering.id}`} profile={entering} rules={config.manual_entry}
          busy={busy || offline} onClose={() => setManual(null)} onSave={saveVitals} />}
        {about && <AboutPrototype onClose={() => setAbout(false)} />}
        {notice && <div className="gui-feedback" role="alert">{notice}</div>}
      </>}>
      {view.route === 'ayarlar' ? (
        <section aria-labelledby="gui-settings-title">
          <div className="gui-list-head"><h2 id="gui-settings-title">{routeLabels.ayarlar}</h2></div>
          <Settings config={config} theme={theme} onTheme={setTheme} mode={mode} onMode={setMode}
            role={view.role} onRole={setRole} language={language} onLanguage={chooseLanguage}
            onAbout={() => setAbout(true)} busy={busy || offline} />
        </section>
      ) : view.route === 'istatistik-ve-analiz' ? (
        <ShiftAnalytics entries={audit && audit.replay === replay ? audit.entries : null} />
      ) : !state ? <p role="status">{t('gui.loading')}</p> : view.route === 'klinik-alarmlar' ? (
        <section aria-labelledby="gui-history-title">
          <div className="gui-list-head"><h2 id="gui-history-title">{routeLabels[view.route]}</h2></div>
          {alarmPanel}
          {savedAlarms ? <AlarmHistory alarms={savedAlarms} onView={select}
            viewReason={id => !patientsById.has(id) ? t('gui.error.patientInactive')
              : blockingPatientId && blockingPatientId !== id ? lockNotice() : undefined} />
            : <p role="status">{t('gui.alarmLoading')}</p>}
        </section>
      ) : queuePage ? (
        <section aria-labelledby="gui-queue-title">
          <div className="gui-list-head"><h2 id="gui-queue-title">{routeLabels[view.route]}</h2></div>
          <WorkQueues route={view.route} state={state} taskProps={taskProps} alarmPanel={alarmPanel} onOpen={select} />
        </section>
      ) : (
        <section aria-labelledby="gui-patient-title" className="gui-patient-section">
          <div className="gui-list-head"><h2 id="gui-patient-title">{routeLabels[criticalPreset ? 'kritik-hastalar' : 'aktif-hastalar']}</h2>
            <FilterBar key={view.route} filters={filters} onChange={setFilters} allPatients={state.patients}
              defaultExpanded={view.route === 'aktif-hastalar'} mode={mode} onMode={setMode} statChip={statChip}
              overdueMinutes={overdueMinutes}
              onClear={() => {
                setFilters(emptyFilters); setStatFilter(null);
                if (criticalPreset) goTo('aktif-hastalar');
              }} />
          </div>
          <Patients patients={filtered} activeAlarms={activeAlarms} tasks={tasks} blockingPatientId={blockingPatientId}
            offline={offline} mode={mode} onOpen={select} />
        </section>
      )}
    </GuiShell>
  );
}
