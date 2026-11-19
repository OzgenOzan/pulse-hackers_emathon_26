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
  kritik: 'Kritik', yakin_takip: 'Yakın Takip', siniflandirilmamis: 'Sınıflandırılmamış', stabil: 'Stabil',
};

export const roleLabels: Record<Role, string> = { physician: 'Hekim', nurse: 'Hemşire' };

export function bedLabel(bed: string): string {
  return `Yatak ${bed.startsWith('S-') ? bed.slice(2) : bed}`;
}

export function stayLabel(minutes: number): string {
  return minutes >= 60 ? `${Math.floor(minutes / 60)} sa ${minutes % 60} dk` : `${minutes} dk`;
}

export function diagnosisLabel(diagnosis: Diagnosis): string {
  const text = t(`dx.${diagnosis.code}`, undefined, '');
  return text ? `${diagnosis.code} ${text}` : diagnosis.code;
}

const labKeys: Record<string, string> = { 'hs-cTnT': 'troponin', Lactate: 'lactate', 'pH (blood gas)': 'ph', 'K+': 'potassium' };
export function labDisplayLabel(label: string): string {
  const key = labKeys[label];
  return key ? t(`lab.${key}`) : label;
}

export function finding(key: string, value: number): string | undefined {
  switch (key) {
    case 'map_low': return `Hipotansiyon (OAB ${measurement(value, 'map')} mmHg)`;
    case 'hr_high': return `Taşikardi (nabız ${measurement(value, 'hr')}/dk)`;
    case 'temp_high': return `Ateş (${measurement(value, 'temp')} °C)`;
    case 'map_drop': return `Bazale göre OAB düşüşü (${measurement(value, 'map')} mmHg)`;
    case 'hr_rise': return `Bazale göre nabız artışı (${measurement(value, 'hr')}/dk)`;
    case 'lab_troponin': return `Troponin yüksekliği (${measurement(value, 'lab')} ng/L)`;
    case 'lab_lactate': return `Laktat yüksekliği (${measurement(value, 'lab')} mmol/L)`;
    case 'lab_ph': return `Kritik pH (${measurement(value, 'ph')})`;
    case 'lab_potassium': return `Kritik potasyum (${measurement(value, 'lab')} mmol/L)`;
    default: return undefined;
  }
}

export function reasonLabel(reason: RiskReason): string {
  const { key, params } = reason;
  switch (key) {
    case 'monitor_gap': return `Monitör verisi yok · ${params.minutes} dk`;
    case 'vitals_overdue': return `Vital ölçümü gecikti · ${params.minutes} dk`;
    case 'insufficient_data': return 'Yetersiz veri';
    case 'awaiting_evaluation': return 'Değerlendirme bekliyor';
    case 'below_watch_threshold': return 'Yakın takip eşiğinin altında';
    case 'score_threshold': return 'Öncelikli klinik değerlendirme gerekli';
    case 'no_risk_findings': return 'Değerlendirmede risk bulgusu yok';
    default: return typeof params.value === 'number' ? finding(key, params.value) ?? 'Değerlendirme bulgusu' : 'Değerlendirme bulgusu';
  }
}

export function componentText(component: Component): string {
  return finding(component.key, component.value) ?? 'Değerlendirme bulgusu';
}

export function localRule(rule: string): string {
  return rule.replace('Universal panic cutoff:', 'Evrensel panik eşiği:')
    .replace('Diagnosis-related critical cutoff:', 'Çalışma tanısıyla ilişkili kritik eşik:')
    .replace(' from baseline; MAP now ', ' bazale göre; güncel OAB ')
    .replace(' from baseline; Heart rate now ', ' bazale göre; güncel nabız ')
    .replace(/(\d)\.(\d)/g, '$1,$2').replace(' bpm', '/dk');
}

export function simulatedDate(iso: string): string {
  const y = +iso.slice(0, 4);
  const m = +iso.slice(5, 7);
  const d = +iso.slice(8, 10);
  const date = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  return `${date.format(new Date(Date.UTC(y, m - 1, d)))} · ${fmtTime(iso)}`;
}
