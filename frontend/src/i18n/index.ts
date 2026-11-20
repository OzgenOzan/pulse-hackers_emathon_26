import en from './en.json';
import tr from './tr.json';
import type { Language } from '../types';

type Params = Record<string, string | number | boolean>;

const STORAGE_KEY = 'sg.language';
const catalogs: Record<Language, Record<string, string>> = { en, tr };
const substitutions = (value: string) => [...new Set(value.match(/\{\w+\}/g) ?? [])].sort().join(',');

export const englishAvailable = Object.keys(en).length === Object.keys(tr).length &&
  Object.entries(tr).every(([key, value]) => {
    const translated = catalogs.en[key];
    return value.trim() !== '' && typeof translated === 'string' && translated.trim() !== '' &&
      substitutions(value) === substitutions(translated);
  });

function loadLanguage(): Language {
  try { return englishAvailable && localStorage.getItem(STORAGE_KEY) === 'en' ? 'en' : 'tr'; }
  catch { return 'tr'; }
}

let language: Language = loadLanguage();

export function getLanguage(): Language {
  return language;
}

export function applyLanguage() {
  document.documentElement.lang = language;
  document.title = `${t('gui.brand')} · ${t('gui.subtitle')}`;
}

export function changeLanguage(next: Language): Language {
  language = next === 'en' && englishAvailable ? 'en' : 'tr';
  applyLanguage();
  try {
    localStorage.setItem(STORAGE_KEY, language);
  } catch {
    // The current tab can still switch languages if storage is disabled.
  }
  return language;
}

export function t(key: string, params?: Params, fallback = key): string {
  const raw = catalogs[language][key] ?? fallback;
  if (!params) return raw;
  return raw.replace(/\{(\w+)\}/g, (match, name: string) => (name in params ? String(params[name]) : match));
}
