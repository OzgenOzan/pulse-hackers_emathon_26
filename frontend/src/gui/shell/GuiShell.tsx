import { type LucideIcon, Bell, CircleCheck, CircleHelp, ClipboardList, Eye, Info, LogOut, TriangleAlert, Users, UserRound } from 'lucide-react';
import type { ReactNode } from 'react';
import type { OverviewKey, Role, State } from '../../types';
import { ConnectionStatus, type ConnectionState } from '../../components/ui/ConnectionStatus';
import { StatCard, type StatTone } from '../../components/ui/StatCard';
import { simulatedDate } from '../clinical';
import { HawkEyeLogo } from './HawkEyeLogo';
import { shellCopy, wallClock } from './copy';
import './shell.css';

export interface GuiShellProps {
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

export function GuiShell({
  role, state, busy, connection, lastSuccess, filter, onFilter, onRole, onAlarm, onAbout,
  demo, alarm, children, floating,
}: GuiShellProps) {
  const alarmCount = state?.critical_alarms.length ?? 0;
  const simTime = state ? simulatedDate(state.sim.time) : null;
  const offline = connection === 'offline';

  return (
    <div className="gui-shell">
      <header className="gui-header" aria-busy={busy}>
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

      {demo}

      <section className="gui-overview" aria-label={shellCopy.overview}>
        <div className="stat-grid">
          {STATS.map(({ key, icon, tone }) => (
            <StatCard
              key={key}
              testId={`stat-${key}`}
              label={shellCopy.stats[key]}
              count={state ? state.overview[key] : shellCopy.clockEmpty}
              icon={icon}
              tone={tone}
              active={filter === key}
              onSelect={() => onFilter(key)}
            />
          ))}
        </div>
        {filter && (
          <div className="filter-chip-row">
            <button
              type="button"
              className="filter-chip"
              aria-label={`${shellCopy.clearFilter}: ${shellCopy.stats[filter]}`}
              title={shellCopy.clearFilter}
              onClick={() => onFilter(filter)}
            >
              {shellCopy.filterChip(shellCopy.stats[filter])}
              <span aria-hidden="true"> ×</span>
            </button>
          </div>
        )}
      </section>

      {alarm}

      <main className="gui-body">{children}</main>

      <footer className="gui-footer">{shellCopy.footer}</footer>

      {floating}
    </div>
  );
}
