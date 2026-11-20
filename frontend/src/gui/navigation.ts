import type { Role } from '../types';
import { t } from '../i18n';

export const routeLabels = {
  get 'genel-bakis'() { return t('gui.nav.overview'); },
  get 'aktif-hastalar'() { return t('gui.nav.patients'); },
  get 'kritik-hastalar'() { return t('gui.nav.critical'); },
  get 'klinik-alarmlar'() { return t('gui.nav.alarms'); },
  get 'bekleyen-islemler'() { return t('gui.nav.tasks'); },
  get 'hekim-paneli'() { return t('gui.nav.physician'); },
  get 'hemsire-paneli'() { return t('gui.nav.nurse'); },
  get 'istatistik-ve-analiz'() { return t('gui.nav.analytics'); },
  get ayarlar() { return t('gui.nav.settings'); },
};
export type Route = keyof typeof routeLabels;
export interface View { route: Route; role: Role; patient: string | null }

export function readView(): View {
  const fragment = location.hash.slice(1);
  const [path, search] = fragment.startsWith('/') ? fragment.slice(1).split('?', 2) : ['', fragment];
  const route: Route = Object.hasOwn(routeLabels, path) ? path as Route : 'genel-bakis';
  const params = new URLSearchParams(search);
  return { route, role: params.get('role') === 'nurse' ? 'nurse' : 'physician', patient: params.get('patient') };
}

export function viewHash({ route, role, patient }: View): string {
  const params = new URLSearchParams({ role });
  if (patient) params.set('patient', patient);
  return `#/${route}?${params}`;
}
