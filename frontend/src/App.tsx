import { type ReactNode, useEffect, useRef, useState } from 'react';
import { ApiError, api, errorMessage } from './api';
import { AboutPrototype } from './components/AboutPrototype';
import { AlertBanners, RedDialog } from './components/AlertDialog';
import { AuditDrawer } from './components/AuditDrawer';
import { Board } from './components/Board';
import { DemoControls } from './components/DemoControls';
import { ManualVitals } from './components/ManualVitals';
import { PatientDetail } from './components/PatientDetail';
import { fmtTime } from './format';
import { changeLanguage, getLanguage, t } from './i18n';
import type { Alert, AuditEntry, Detail, Role, RulesView, ScenarioInfo, State, VitalValues } from './types';

const POLL_MS = 1000;
const NOTICE_MS = 6000;
const TAB_STOPS =
  '[data-blocking-allowed] button:not(:disabled), [data-blocking-allowed] select:not(:disabled), [data-blocking-allowed] input:not(:disabled)';

interface View {
  role: Role;
  patient: string | null;
}

function readView(): View {
  const params = new URLSearchParams(window.location.hash.slice(1));
  return { role: params.get('role') === 'nurse' ? 'nurse' : 'physician', patient: params.get('patient') };
}

function writeView(role: Role, patientId: string | null) {
  const params = new URLSearchParams({ role });
  if (patientId) params.set('patient', patientId);
  window.history.replaceState(null, '', `#${params.toString()}`);
}

/** The RED alert that blocks navigation. Only the physician is blocked; the nurse is never blocked. */
function blockingAlertOf(st: State, role: Role, blocksNavigation: boolean): Alert | null {
  if (role !== 'physician' || !blocksNavigation || st.blocking_alert_id === null) return null;
  return st.alerts.find(a => a.id === st.blocking_alert_id && a.level === 'RED') ?? null;
}

function selectPatient(st: State, role: Role, urlPatient: string | null, blocksNavigation: boolean): string | null {
  const blocking = blockingAlertOf(st, role, blocksNavigation);
  if (blocking) return blocking.patient_id;
  if (urlPatient && st.patients.some(p => p.id === urlPatient)) return urlPatient;
  return st.patients[0]?.id ?? null;
}

async function fetchDetail(role: Role, patientId: string): Promise<Detail | null> {
  try {
    return await api.patient(patientId, role);
  } catch (err) {
    if (err instanceof ApiError && (err.status === 404 || err.status === 409)) return null;
    throw err;
  }
}

export function App() {
  const [view, setView] = useState<View>(readView);
  const [language, setLanguage] = useState(getLanguage);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [state, setState] = useState<State | null>(null);
  const [config, setConfig] = useState<RulesView | null>(null);
  const [scenarios, setScenarios] = useState<ScenarioInfo[]>([]);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [auditOpen, setAuditOpen] = useState(false);
  const [detail, setDetail] = useState<{ key: string; data: Detail | null } | null>(null);
  const [vitalsFor, setVitalsFor] = useState<{ patientId: string; replayId: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [linkError, setLinkError] = useState<string | null>(null);
  /** Bumped after each mutation so polls that started before it are discarded. */
  const epoch = useRef(0);

  // Fail-safe: a RED dialog blocks unless the rules explicitly turn blocking off.
  const blocksNavigation = config?.alerting.red_blocks_navigation ?? true;
  const blocking = state ? blockingAlertOf(state, view.role, blocksNavigation) : null;
  const blockingOn = blocking !== null;
  const patientId = state ? selectPatient(state, view.role, view.patient, blocksNavigation) : null;
  const detailKey = `${view.role}|${patientId}`;

  useEffect(() => { document.documentElement.lang = language; }, [language]);
  useEffect(() => { if (blockingOn) setAboutOpen(false); }, [blockingOn]);

  useEffect(() => {
    api.config().then(setConfig).catch(err => setNotice(errorMessage(err)));
    api.scenarios().then(setScenarios).catch(err => setNotice(errorMessage(err)));
  }, []);

  useEffect(() => {
    let alive = true;
    let timer: number | undefined;
    const tick = async () => {
      const e = epoch.current;
      try {
        const st = await api.state(view.role);
        if (alive && e === epoch.current) {
          setState(st);
          setLinkError(null);
          const pid = selectPatient(st, view.role, view.patient, blocksNavigation);
          if (pid) {
            const key = `${view.role}|${pid}`;
            const data = await fetchDetail(view.role, pid);
            if (alive && e === epoch.current) setDetail({ key, data });
          }
          if (auditOpen) {
            const entries = await api.audit();
            if (alive && e === epoch.current) setAudit(entries);
          }
        }
      } catch (err) {
        if (alive) setLinkError(errorMessage(err));
      }
      if (alive) timer = window.setTimeout(tick, POLL_MS);
    };
    void tick();
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [view.role, view.patient, auditOpen, blocksNavigation]);

  useEffect(() => {
    writeView(view.role, view.patient);
  }, [view.role, view.patient]);

  useEffect(() => {
    if (notice === null) return undefined;
    const id = window.setTimeout(() => setNotice(null), NOTICE_MS);
    return () => window.clearTimeout(id);
  }, [notice]);

  // While a RED dialog blocks, Tab cycles only through the topbar, demo bar and the dialog.
  useEffect(() => {
    if (!blockingOn) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const stops = Array.from(document.querySelectorAll<HTMLElement>(TAB_STOPS));
      if (stops.length === 0) return;
      const current = document.activeElement instanceof HTMLElement ? stops.indexOf(document.activeElement) : -1;
      const direction = e.shiftKey ? -1 : 1;
      const next = current < 0 ? (e.shiftKey ? stops.length - 1 : 0) : (current + direction + stops.length) % stops.length;
      e.preventDefault();
      stops[next].focus();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [blockingOn]);

  const mutate = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
    } catch (err) {
      setNotice(errorMessage(err));
    } finally {
      epoch.current += 1;
      setBusy(false);
    }
  };

  const act = (alert: Alert, action: string, reason?: string) => {
    if (state) return mutate(() => api.ack(alert.id, { action, reason }, state.sim.replay_id));
  };

  const saveVitals = (values: VitalValues) => {
    if (!vitalsFor) return;
    return mutate(async () => {
      await api.vitals(vitalsFor.patientId, values, vitalsFor.replayId);
      setVitalsFor(null);
    });
  };

  const openVitals = (id: string) => {
    if (!state) return;
    setView(v => ({ ...v, patient: id }));
    setVitalsFor({ patientId: id, replayId: state.sim.replay_id });
  };

  const activeAlerts = state ? state.alerts.filter(a => a.status === 'active') : [];
  const bannerAlerts = activeAlerts.filter(a => a.id !== blocking?.id);
  const summary = state && patientId ? state.patients.find(p => p.id === patientId) : undefined;
  const greenAlerts = patientId ? activeAlerts.filter(a => a.level === 'GREEN' && a.patient_id === patientId) : [];
  const redQueue = activeAlerts.filter(a => a.level === 'RED' && a.target_role === 'physician');

  let pane: ReactNode;
  if (!patientId) pane = <p>{t('board.empty')}</p>;
  else if (!detail || detail.key !== detailKey) pane = <p role="status">{t('app.loading')}</p>;
  else if (detail.data === null) pane = <p>{t('detail.unavailable')}</p>;
  else
    pane = (
      <PatientDetail
        detail={detail.data}
        role={view.role}
        greenAlerts={greenAlerts}
        busy={busy}
        onAct={act}
        onEnterVitals={openVitals}
      />
    );

  return (
    <div className="app" role={blockingOn ? 'dialog' : undefined}
      aria-modal={blockingOn || undefined} aria-labelledby={blockingOn ? 'red-title' : undefined}>
      <header className="topbar" data-blocking-allowed>
        <h1>{t('app.title')}</h1>
        <span>{t('app.subtitle')}</span>
        <span className="simulated">{t('app.simulated')}</span>
        {state && <time className="sim-clock" aria-label={t('app.clock')} dateTime={state.sim.time}>{fmtTime(state.sim.time)}</time>}
        <div className="role-switch" role="group" aria-label={t('app.role.label')}>
          <span className="demo-role">{t('app.role.demo')}</span>
          {(['physician', 'nurse'] as const).map(r => (
            <button
              key={r}
              type="button"
              data-testid={`role-${r}`}
              aria-pressed={view.role === r}
              onClick={() => setView(v => ({ ...v, role: r }))}
            >
              {t(`app.role.${r}`)}
            </button>
          ))}
        </div>
        <div className="language-switch" role="group" aria-label={t('app.language')}>
          {(['en', 'tr'] as const).map(locale => (
            <button key={locale} type="button" data-testid={`language-${locale}`} aria-pressed={language === locale}
              onClick={() => { changeLanguage(locale); setLanguage(locale); }}>
              {t(`app.language.${locale}`)}
            </button>
          ))}
        </div>
        <button type="button" data-testid="about-prototype" disabled={blockingOn} onClick={() => setAboutOpen(true)}>
          {t('about.open')}
        </button>
      </header>

      {state && (
        <DemoControls
          sim={state.sim}
          scenarios={scenarios}
          busy={busy}
          onReset={id => void mutate(() => api.reset(id))}
          onPlay={speed => void mutate(() => api.play(speed))}
          onPause={() => void mutate(() => api.pause())}
          onStep={() => void mutate(() => api.step())}
        />
      )}

      <div className="workspace">
      {linkError && (
        <p role="alert" className="link-error">
          {t('app.linkError', { message: linkError })}
        </p>
      )}

      {!state ? (
        <p className="loading" role="status">
          {t('app.loading')}
        </p>
      ) : (
        <>
          <div className="workspace-body" inert={blockingOn}>
            <AlertBanners
              alerts={bannerAlerts}
              patients={state.patients}
              role={view.role}
              busy={busy}
              onAct={act}
              onEnterVitals={view.role === 'nurse' ? openVitals : undefined}
            />
            <main className="layout">
              <Board
                patients={state.patients}
                alerts={activeAlerts}
                selectedId={patientId}
                auditOpen={auditOpen}
                onSelect={id => setView(v => ({ ...v, patient: id }))}
                onToggleAudit={() => setAuditOpen(o => !o)}
              />
              <section className="detail-pane" aria-label={t('app.region.detail')}>
                {view.role === 'nurse' && vitalsFor?.patientId === patientId
                  && vitalsFor.replayId === state.sim.replay_id && summary && (
                  <ManualVitals
                    key={`${vitalsFor.replayId}/${summary.id}`}
                    profile={summary}
                    busy={busy}
                    onSave={values => void saveVitals(values)}
                    onCancel={() => setVitalsFor(null)}
                  />
                )}
                {pane}
              </section>
            </main>
            {auditOpen && !blocking && <AuditDrawer entries={audit} onClose={() => setAuditOpen(false)} />}
          </div>
          {blocking && (
            <RedDialog
              key={`${state.sim.replay_id}/${blocking.id}`}
              alert={blocking}
              summary={state.patients.find(p => p.id === blocking.patient_id)}
              readings={detail?.key === detailKey ? detail.data?.vitals : undefined}
              threshold={config?.red.threshold ?? null}
              index={redQueue.findIndex(a => a.id === blocking.id) + 1}
              total={redQueue.length}
              busy={busy}
              onAct={act}
              onBackdrop={() => setNotice(t('refuse.blocked'))}
            />
          )}
        </>
      )}
      </div>
      {aboutOpen && !blockingOn && <AboutPrototype onClose={() => setAboutOpen(false)} />}

      {notice && (
        <div className="toast" role="alert">
          {notice}
        </div>
      )}
      <footer className="footer">{t('app.footer')}</footer>
    </div>
  );
}
