import type { Role } from '../types';

export const routeLabels = {
  'genel-bakis': 'Genel Bakış',
  'aktif-hastalar': 'Aktif Hastalar',
  'kritik-hastalar': 'Kritik Hastalar',
  'klinik-alarmlar': 'Klinik Alarmlar',
  'bekleyen-islemler': 'Bekleyen İşlemler',
  'hekim-paneli': 'Hekim Paneli',
  'hemsire-paneli': 'Hemşire Paneli',
  ayarlar: 'Ayarlar',
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
