import type { RiskKey, Summary } from '../../types';
import { t } from '../../i18n';
import { compareRisk, displayName, protocolOf } from './model';

export const sortLabels = {
  get risk() { return t('patients.sort.risk'); },
  get bed() { return t('patients.sort.bed'); },
  get stay() { return t('patients.sort.stay'); },
  get vitals() { return t('patients.sort.vitals'); },
  get labs() { return t('patients.sort.labs'); },
  get consults() { return t('patients.sort.consults'); },
};
export type Sort = keyof typeof sortLabels;
export type Presence = '' | 'yes' | 'no';
export interface Filters {
  query: string;
  risks: RiskKey[];
  labs: Presence;
  consults: Presence;
  physician: string;
  nurse: string;
  stay: '' | '120' | '240';
  oldVitals: boolean;
  sort: Sort;
}
export const emptyFilters: Filters = {
  query: '', risks: [], labs: '', consults: '', physician: '', nurse: '', stay: '', oldVitals: false, sort: 'risk',
};

const bed = new Intl.Collator('tr-TR', { numeric: true });
const fold = (text: string) => text.normalize('NFC').toLocaleLowerCase('tr-TR');
const time = (value: string) => Date.parse(value.endsWith('Z') || /[+-]\d\d:\d\d$/.test(value) ? value : `${value}Z`);
const matches = (count: number, presence: Presence) => !presence || (count > 0) === (presence === 'yes');

export function filterPatients(patients: Summary[], filters: Filters, simTime: string): Summary[] {
  const query = fold(filters.query.trim());
  const oldAt = time(simTime) - 30 * 60_000;
  const selected = patients.filter(patient => {
    if (query && !fold(displayName(patient)).includes(query) && !protocolOf(patient).includes(query)) return false;
    if (filters.risks.length && !filters.risks.includes(patient.risk_status.key)) return false;
    if (!matches(patient.pending_labs.length, filters.labs) || !matches(patient.pending_consults.length, filters.consults)) return false;
    if (filters.physician && patient.display?.physician !== filters.physician) return false;
    if (filters.nurse && patient.display?.nurse !== filters.nurse) return false;
    if (filters.stay && patient.minutes_in_zone < Number(filters.stay)) return false;
    if (filters.oldVitals && (!patient.last_vitals || time(patient.last_vitals.time) > oldAt)) return false;
    return true;
  });
  const measureTime = (patient: Summary) => patient.last_vitals ? time(patient.last_vitals.time) : 0;
  return selected.sort((a, b) => {
    const tie = () => bed.compare(a.bed, b.bed);
    switch (filters.sort) {
      case 'risk': return compareRisk(a, b);
      case 'bed': return tie();
      case 'stay': return b.minutes_in_zone - a.minutes_in_zone || tie();
      case 'vitals': return measureTime(b) - measureTime(a) || tie();
      case 'labs': return b.pending_labs.length - a.pending_labs.length || tie();
      case 'consults': return b.pending_consults.length - a.pending_consults.length || tie();
    }
  });
}
