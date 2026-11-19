import type { Role } from '../types';

export type Route = 'genel-bakis' | 'klinik-alarmlar';
export interface View { route: Route; role: Role; patient: string | null }

export function readView(): View {
  const fragment = location.hash.slice(1);
  const [path, search] = fragment.startsWith('/') ? fragment.slice(1).split('?', 2) : ['', fragment];
  const route: Route = path === 'klinik-alarmlar' ? path : 'genel-bakis';
  const params = new URLSearchParams(search);
  return { route, role: params.get('role') === 'nurse' ? 'nurse' : 'physician', patient: params.get('patient') };
}

export function viewHash({ route, role, patient }: View): string {
  const params = new URLSearchParams({ role });
  if (patient) params.set('patient', patient);
  return `#/${route}?${params}`;
}
