import en from './en.json';
import tr from './tr.json';
import type { Component, Language } from '../types';

type Params = Record<string, string | number | boolean>;

const STORAGE_KEY = 'sahin-goz-language';
const catalogs: Record<Language, Record<string, string>> = { en, tr: tr satisfies typeof en };

function readLanguage(): Language {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'tr' ? 'tr' : 'en';
  } catch {
    return 'en';
  }
}

let language = readLanguage();

export function getLanguage(): Language {
  return language;
}

export function changeLanguage(next: Language): void {
  language = next;
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // The current tab can still switch languages if storage is disabled.
  }
}

export function t(key: string, params?: Params, fallback = key): string {
  const raw = catalogs[language][key] ?? catalogs.en[key] ?? fallback;
  if (!params) return raw;
  return raw.replace(/\{(\w+)\}/g, (match, name: string) => (name in params ? String(params[name]) : match));
}

export function ruleLabel(component: Component): string {
  const source = component.rule;
  const lab = /^(Universal panic|Diagnosis-related critical) cutoff: (.+)$/.exec(source);
  if (lab) return t(lab[1] === 'Universal panic' ? 'rule.panic' : 'rule.critical', { cutoff: lab[2] });
  const trend = /^(.+) from baseline; (.+) now (.+)$/.exec(source);
  if (trend) {
    const name = component.key === 'map_drop' ? t('vitals.short.map') : t('component.hr_high');
    return t('rule.trend', { cutoff: trend[1], name, current: trend[3] });
  }
  const idle = /^(.+) without a new physician action$/.exec(source);
  return idle ? t('rule.idle', { cutoff: idle[1] }) : source;
}
