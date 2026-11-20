import { fmtTime } from '../format';
import { getLanguage, t } from '../i18n';
import type { Component, Diagnosis, RiskKey, RiskReason, Role } from '../types';

const numberFormats = {
  tr: [new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 }),
    new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }),
    new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 2 })],
  en: [new Intl.NumberFormat('en', { maximumFractionDigits: 0 }),
    new Intl.NumberFormat('en', { minimumFractionDigits: 1, maximumFractionDigits: 1 }),
    new Intl.NumberFormat('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    new Intl.NumberFormat('en', { maximumFractionDigits: 2 })],
};

export function measurement(value: number, kind: string): string {
  const precision = kind === 'temp' ? 1 : kind === 'ph' ? 2 : kind === 'lab' ? 3 : 0;
  // Match the rule text's rounding of exact binary inputs; apply locale punctuation last.
  const digits = precision === 3 ? 2 : precision;
  return numberFormats[getLanguage()][precision].format(Number(value.toFixed(digits)));
}

export const statusLabels: Record<RiskKey, string> = {
  get kritik() { return t('gui.status.critical'); },
  get yakin_takip() { return t('gui.status.watch'); },
  get siniflandirilmamis() { return t('gui.status.unclassified'); },
  get stabil() { return t('gui.status.stable'); },
};

export const roleLabels: Record<Role, string> = {
  get physician() { return t('app.role.physician'); },
  get nurse() { return t('app.role.nurse'); },
};

export function bedLabel(bed: string): string {
  return t('gui.bed', { bed: bed.startsWith('S-') ? bed.slice(2) : bed });
}

export function stayLabel(minutes: number): string {
  return minutes >= 60 ? t('gui.duration.hours', { hours: Math.floor(minutes / 60), minutes: minutes % 60 }) : t('gui.duration.minutes', { minutes });
}

export function diagnosisLabel(diagnosis: Diagnosis): string {
  const text = t(`dx.${diagnosis.code}`, undefined, '');
  return text ? `${diagnosis.code} ${text}` : diagnosis.code;
}

const labKeys: Record<string, string> = {
  'hs-cTnT': 'troponin', Lactate: 'lactate', 'pH (blood gas)': 'ph', 'K+': 'potassium',
  'Tam kan sayımı': 'cbc', Kreatinin: 'creatinine', 'İdrar tahlili': 'urinalysis',
};
export function labDisplayLabel(label: string): string {
  const key = labKeys[label];
  return key ? t(`lab.${key}`) : label;
}

const complaints: Record<string, string> = {
  'Ateş, idrarda yanma': 'feverUrine',
  'Göğüs ağrısı': 'chestPain',
  'Nefes darlığı': 'dyspnoea',
  'Bayılma': 'syncope',
  'Nöbet geçirme': 'seizure',
  'Sağ yan ağrısı': 'rightFlank',
  'Kusma, ishal': 'vomitingDiarrhoea',
  'Halsizlik': 'weakness',
  'Bacakta kızarıklık ve şişlik': 'leg',
  'Baş dönmesi': 'dizziness',
  'Bel ağrısı': 'lowBack',
  'Kaşıntı, döküntü': 'rash',
};
export function complaintLabel(value: string): string {
  const key = complaints[value];
  return key ? t(`gui.complaint.${key}`) : value;
}

export function consultLabel(value: string): string {
  if (value === 'Kardiyoloji') return t('gui.consult.cardiology');
  if (value === 'Nöroloji') return t('gui.consult.neurology');
  return value;
}

export function staffLabel(value: string): string {
  return getLanguage() === 'en' && value.startsWith('Hmş. ') ? `${roleLabels.nurse} ${value.slice(5)}` : value;
}

export function vitalFlagLabel(note: string): string {
  if (getLanguage() === 'tr') return note;
  return note.replace('Yüksek', t('gui.flag.high'))
    .replace(/bazale göre ([−+][\d,]+)/g, (_, change: string) => t('gui.flag.baseline', { change: change.replace(',', '.') }))
    .replace(/(\d),(\d)/g, '$1.$2');
}

export function finding(key: string, value: number): string | undefined {
  const kind = key === 'temp_high' ? 'temp' : key === 'lab_ph' ? 'ph' : key.startsWith('lab_') ? 'lab' : '';
  return t(`gui.finding.${key}`, { value: measurement(value, kind) }, '') || undefined;
}

export function reasonLabel(reason: RiskReason): string {
  const { key, params } = reason;
  return t(`gui.risk.${key}`, params, '') ||
    (typeof params.value === 'number' ? finding(key, params.value) : undefined) || t('gui.finding.generic');
}

export function componentText(component: Component): string {
  return finding(component.key, component.value) ?? t('gui.finding.generic');
}

export function localRule(rule: string): string {
  if (getLanguage() === 'en') return rule;
  const safe = rule.replace(/(\d)\.(\d)/g, '$1,$2').replace(/ bpm/g, '/dk').replace(/ min\b/g, ' dk');
  const cutoff = /^(Universal panic|Diagnosis-related critical) cutoff: (.+)$/.exec(safe);
  if (cutoff) return t(cutoff[1] === 'Universal panic' ? 'rule.panic' : 'rule.critical', { cutoff: cutoff[2] });
  const trend = /^(.+) from baseline; (MAP|Heart rate) now (.+)$/.exec(safe);
  if (trend) return t('rule.trend', { cutoff: trend[1], name: t(trend[2] === 'MAP' ? 'vitals.short.map' : 'vitals.short.hr'), current: trend[3] });
  const idle = /^(.+) without a new physician action$/.exec(safe);
  return idle ? t('rule.idle', { cutoff: idle[1] }) : safe;
}

const dateOptions = { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' } as const;
const dates = { tr: new Intl.DateTimeFormat('tr-TR', dateOptions), en: new Intl.DateTimeFormat('en-GB', dateOptions) };

export function simulatedDate(iso: string): string {
  const y = +iso.slice(0, 4);
  const m = +iso.slice(5, 7);
  const d = +iso.slice(8, 10);
  return `${dates[getLanguage()].format(new Date(Date.UTC(y, m - 1, d)))} · ${fmtTime(iso)}`;
}
