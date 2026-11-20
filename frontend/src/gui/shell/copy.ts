import { getLanguage, t } from '../../i18n';
import type { OverviewKey, Role } from '../../types';
import { roleLabels, statusLabels } from '../clinical';

export const shellCopy = {
  get title() { return t('gui.brand'); },
  get subtitle() { return t('gui.subtitle'); },
  get logo() { return t('gui.logo'); },
  bell: (count: number) => t('gui.alarmCount', { count }),
  get clockLabel() { return t('app.clock'); },
  clockEmpty: '—',
  get roleGroup() { return t('app.role.demo'); },
  roles: roleLabels,
  profile: {
    physician: 'Dr. Deniz Aksoy',
    get nurse() { return t('gui.profile.nurse'); },
  } satisfies Record<Role, string>,
  get simulatedPill() { return t('app.simulated'); },
  get simulatedPillTitle() { return t('gui.simulatedHint'); },
  get about() { return t('about.title'); },
  get overview() { return t('gui.overview'); },
  theme: {
    get toLight() { return t('gui.theme.toLight'); },
    get toDark() { return t('gui.theme.toDark'); },
  },
  nav: {
    get label() { return t('gui.nav.label'); },
    get expand() { return t('gui.nav.expand'); },
    get collapse() { return t('gui.nav.collapse'); },
    get more() { return t('gui.nav.more'); },
    pending: (count: number) => t('gui.pendingCount', { count }),
  },
  connection: {
    get connected() { return t('gui.connection.connected'); },
    get weak() { return t('gui.connection.weak'); },
    get offline() { return t('gui.connection.offline'); },
  },
  connectionTitle: {
    get connected() { return t('gui.connection.connectedHint'); },
    get weak() { return t('gui.connection.weakHint'); },
    get offline() { return t('gui.connection.offlineHint'); },
  },
  offlineNotice: (time: string | null) => time ? t('gui.connection.asOf', { time }) : t('gui.connection.stale'),
  get footer() { return t('app.footer'); },
  stats: {
    get aktif() { return t('gui.stat.active'); },
    get kritik() { return statusLabels.kritik; },
    get yakin_takip() { return statusLabels.yakin_takip; },
    get stabil() { return statusLabels.stabil; },
    get siniflandirilmamis() { return statusLabels.siniflandirilmamis; },
    get bekleyen_islem() { return t('gui.stat.pending'); },
    get taburculuk_bekleyen() { return t('gui.stat.discharge'); },
  } satisfies Record<OverviewKey, string>,
  statsShort: (key: OverviewKey) => key === 'taburculuk_bekleyen' ? t('gui.stat.dischargeShort') : undefined,
};

const wallTime = { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false } as const;
const clockFormat = {
  tr: new Intl.DateTimeFormat('tr-TR', wallTime),
  en: new Intl.DateTimeFormat('en-GB', wallTime),
};

/** Wall-clock HH:MM:SS of the last successful poll (not simulated time). */
export function wallClock(date: Date): string {
  return clockFormat[getLanguage()].format(date);
}
