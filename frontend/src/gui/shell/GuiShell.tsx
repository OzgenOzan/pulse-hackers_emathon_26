import {
  type LucideIcon, Bell, CircleCheck, CircleHelp, ClipboardList, Ellipsis, Eye, HeartPulse, Info, LayoutDashboard,
  LogOut, Moon, PanelLeftClose, PanelLeftOpen, Settings, Stethoscope, Sun, TriangleAlert, UserRound, Users,
} from 'lucide-react';
import { type ReactNode, useLayoutEffect, useRef, useState } from 'react';
import type { OverviewKey, Role, State } from '../../types';
import { ConnectionStatus, type ConnectionState } from '../../components/ui/ConnectionStatus';
import { StatCard, type StatTone } from '../../components/ui/StatCard';
import { routeLabels, type Route } from '../navigation';
import { simulatedDate } from '../clinical';
import { HawkEyeLogo } from './HawkEyeLogo';
import { shellCopy, wallClock } from './copy';
import { type ThemeChoice, useEffectiveTheme, useMediaQuery } from './media';
import { readSidebarOpen, saveSidebarOpen } from './preferences';
import './shell.css';

export interface GuiShellProps {
  route: Route;
  onNavigate: (route: Route) => void;
  /** Shows the stat cards. The alarm panel and route content render regardless. */
  showOverview: boolean;
  /** The user's choice; "system" follows the OS preference. */
  theme: ThemeChoice;
  onTheme: (choice: ThemeChoice) => void;
  role: Role;
  state: State | null;
  busy: boolean;
  connection: ConnectionState;
  lastSuccess: Date | null;
  filter: OverviewKey | null;
  /** Toggles the list filter: selecting the active key clears it. */
  onFilter: (key: OverviewKey) => void;
  onRole: (role: Role) => void;
  onAlarm: () => void;
  onAbout: () => void;
  demo?: ReactNode;
  stickyAlarm?: ReactNode;
  alarm?: ReactNode;
  children: ReactNode;
  /** Sheets and notices. Rendered outside the scrolling body so no ancestor clips them. */
  floating?: ReactNode;
}

const STATS: { key: OverviewKey; icon: LucideIcon; tone: StatTone }[] = [
  { key: 'aktif', icon: Users, tone: 'neutral' },
  { key: 'kritik', icon: TriangleAlert, tone: 'kritik' },
  { key: 'yakin_takip', icon: Eye, tone: 'yakin-takip' },
  { key: 'stabil', icon: CircleCheck, tone: 'stabil' },
  { key: 'siniflandirilmamis', icon: CircleHelp, tone: 'unclassified' },
  { key: 'bekleyen_islem', icon: ClipboardList, tone: 'neutral' },
  { key: 'taburculuk_bekleyen', icon: LogOut, tone: 'neutral' },
];

const ROLES: Role[] = ['physician', 'nurse'];

/** Sidebar order. `primary` routes stay on the bottom bar below 1200 px; the rest sit under "Daha fazla". */
const NAV: { route: Route; icon: LucideIcon; primary: boolean }[] = [
  { route: 'genel-bakis', icon: LayoutDashboard, primary: true },
  { route: 'aktif-hastalar', icon: Users, primary: true },
  { route: 'kritik-hastalar', icon: TriangleAlert, primary: false },
  { route: 'klinik-alarmlar', icon: Bell, primary: true },
  { route: 'bekleyen-islemler', icon: ClipboardList, primary: true },
  { route: 'hekim-paneli', icon: Stethoscope, primary: false },
  { route: 'hemsire-paneli', icon: HeartPulse, primary: false },
  { route: 'ayarlar', icon: Settings, primary: false },
];

interface NavButtonProps {
  route: Route;
  icon: LucideIcon;
  current: Route;
  badge?: { count: number; description: string };
  onNavigate: (route: Route) => void;
}

function NavButton({ route, icon: Icon, current, badge, onNavigate }: NavButtonProps) {
  return (
    <button
      type="button"
      className="nav-item"
      aria-current={route === current ? 'page' : undefined}
      data-testid={`nav-${route}`}
      onClick={() => onNavigate(route)}
    >
      <Icon size={20} strokeWidth={2} aria-hidden="true" focusable="false" />
      <span className="nav-label">{routeLabels[route]}</span>
      {badge && badge.count > 0 && (
        <span className="nav-badge">
          <span aria-hidden="true">{badge.count}</span>
          <span className="visually-hidden">{badge.description}</span>
        </span>
      )}
    </button>
  );
}

export function GuiShell({
  route, onNavigate, showOverview, theme, onTheme,
  role, state, busy, connection, lastSuccess, filter, onFilter, onRole, onAlarm, onAbout,
  demo, stickyAlarm, alarm, children, floating,
}: GuiShellProps) {
  const alarmCount = state?.critical_alarms.length ?? 0;
  const pendingCount = state?.overview.bekleyen_islem ?? 0;
  const simTime = state ? simulatedDate(state.sim.time) : null;
  const offline = connection === 'offline';
  const currentTheme = useEffectiveTheme(theme);

  const headerRef = useRef<HTMLElement>(null);
  const compact = useMediaQuery('(max-width: 1199px)');
  const wide = useMediaQuery('(min-width: 1600px)');
  const [storedOpen, setStoredOpen] = useState(readSidebarOpen);
  const [moreOpen, setMoreOpen] = useState(false);
  const expanded = storedOpen ?? wide;

  // Other CSS consumers read the real header height from the root.
  useLayoutEffect(() => {
    const header = headerRef.current;
    if (!header) return;
    const root = document.documentElement;
    const apply = () => root.style.setProperty('--header-height', `${header.offsetHeight}px`);
    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(header);
    return () => {
      observer.disconnect();
      root.style.removeProperty('--header-height');
    };
  }, []);

  const badges: Partial<Record<Route, { count: number; description: string }>> = {
    'klinik-alarmlar': { count: alarmCount, description: shellCopy.bell(alarmCount) },
    'bekleyen-islemler': { count: pendingCount, description: shellCopy.nav.pending(pendingCount) },
  };
  const visible = compact ? NAV.filter(entry => entry.primary) : NAV;
  const overflow = NAV.filter(entry => !entry.primary);
  const overflowActive = overflow.some(entry => entry.route === route);

  function toggleSidebar() {
    const next = !expanded;
    setStoredOpen(next);
    saveSidebarOpen(next);
  }

  function navigate(next: Route) {
    setMoreOpen(false);
    onNavigate(next);
  }

  return (
    <div className="gui-shell">
      <header className="gui-header" ref={headerRef} aria-busy={busy}>
        <div className="gui-brand">
          <HawkEyeLogo label={shellCopy.logo} />
          <div className="gui-brand-text">
            <h1 className="gui-title">{shellCopy.title}</h1>
            <p className="gui-subtitle">{shellCopy.subtitle}</p>
          </div>
        </div>

        <div className="gui-controls">
          <button
            type="button"
            className="gui-bell"
            aria-label={shellCopy.bell(alarmCount)}
            title={shellCopy.bell(alarmCount)}
            data-testid="alarm-bell"
            onClick={onAlarm}
          >
            <Bell size={20} strokeWidth={2} aria-hidden="true" focusable="false" />
            <span className="gui-bell-count" aria-hidden="true">{alarmCount}</span>
          </button>

          <div className="gui-clock">
            <span className="gui-clock-label">{shellCopy.clockLabel}</span>
            <time className="gui-clock-value" dateTime={state?.sim.time}>{simTime ?? shellCopy.clockEmpty}</time>
          </div>

          <div className="role-switch" role="group" aria-label={shellCopy.roleGroup}>
            {ROLES.map(r => (
              <button
                key={r}
                type="button"
                className="role-option"
                aria-pressed={role === r}
                disabled={busy}
                data-testid={`role-${r}`}
                onClick={() => onRole(r)}
              >
                {shellCopy.roles[r]}
              </button>
            ))}
          </div>

          <div className="gui-profile" title={shellCopy.profile[role]} aria-label={shellCopy.profile[role]} role="img">
            <UserRound size={20} strokeWidth={2} aria-hidden="true" focusable="false" />
            <span className="gui-profile-name" aria-hidden="true">{shellCopy.profile[role]}</span>
          </div>

          <button
            type="button"
            className="gui-theme"
            aria-label={currentTheme === 'dark' ? shellCopy.theme.toLight : shellCopy.theme.toDark}
            title={currentTheme === 'dark' ? shellCopy.theme.toLight : shellCopy.theme.toDark}
            data-testid="theme-toggle"
            onClick={() => onTheme(currentTheme === 'dark' ? 'light' : 'dark')}
          >
            {currentTheme === 'dark'
              ? <Sun size={20} strokeWidth={2} aria-hidden="true" focusable="false" />
              : <Moon size={20} strokeWidth={2} aria-hidden="true" focusable="false" />}
          </button>

          <ConnectionStatus state={connection} />

          <span className="gui-pill" title={shellCopy.simulatedPillTitle}>{shellCopy.simulatedPill}</span>

          <button
            type="button"
            className="gui-info"
            aria-label={shellCopy.about}
            title={shellCopy.about}
            data-testid="about-prototype"
            onClick={onAbout}
          >
            <Info size={20} strokeWidth={2} aria-hidden="true" focusable="false" />
          </button>
        </div>
      </header>

      {offline && (
        <div className="gui-notice" role="status" data-testid="offline-notice">
          {shellCopy.offlineNotice(lastSuccess ? wallClock(lastSuccess) : null)}
        </div>
      )}

      {stickyAlarm}
      {demo}

      <div className="gui-frame" data-expanded={expanded}>
        <nav
          className="gui-nav"
          aria-label={shellCopy.nav.label}
          onKeyDown={event => { if (event.key === 'Escape') setMoreOpen(false); }}
        >
          <button
            type="button"
            className="nav-toggle"
            aria-expanded={expanded}
            aria-label={expanded ? shellCopy.nav.collapse : shellCopy.nav.expand}
            title={expanded ? shellCopy.nav.collapse : shellCopy.nav.expand}
            data-testid="nav-toggle"
            onClick={toggleSidebar}
          >
            {expanded
              ? <PanelLeftClose size={20} strokeWidth={2} aria-hidden="true" focusable="false" />
              : <PanelLeftOpen size={20} strokeWidth={2} aria-hidden="true" focusable="false" />}
          </button>
          <ul className="nav-list">
            {visible.map(entry => (
              <li key={entry.route}>
                <NavButton route={entry.route} icon={entry.icon} current={route} badge={badges[entry.route]} onNavigate={navigate} />
              </li>
            ))}
            {compact && (
              <li>
                <button
                  type="button"
                  className={`nav-item nav-more${overflowActive ? ' is-active' : ''}`}
                  aria-expanded={moreOpen}
                  aria-controls="gui-nav-more"
                  data-testid="nav-more"
                  onClick={() => setMoreOpen(open => !open)}
                >
                  <Ellipsis size={20} strokeWidth={2} aria-hidden="true" focusable="false" />
                  <span className="nav-label">{shellCopy.nav.more}</span>
                </button>
              </li>
            )}
          </ul>
          {compact && moreOpen && (
            <ul id="gui-nav-more" className="nav-more-panel">
              {overflow.map(entry => (
                <li key={entry.route}>
                  <NavButton route={entry.route} icon={entry.icon} current={route} onNavigate={navigate} />
                </li>
              ))}
            </ul>
          )}
        </nav>

        <div className="gui-main">
          {showOverview && (
            <section className="gui-overview" aria-label={shellCopy.overview}>
              <div className="stat-grid">
                {STATS.map(({ key, icon, tone }) => (
                  <StatCard
                    key={key}
                    testId={`stat-${key}`}
                    label={shellCopy.stats[key]}
                    shortLabel={shellCopy.statsShort[key]}
                    count={state ? state.overview[key] : shellCopy.clockEmpty}
                    icon={icon}
                    tone={tone}
                    active={filter === key}
                    onSelect={() => onFilter(key)}
                  />
                ))}
              </div>
            </section>
          )}

          {alarm}

          <main className="gui-body">{children}</main>

          <footer className="gui-footer">{shellCopy.footer}</footer>
        </div>
      </div>

      {floating}
    </div>
  );
}
