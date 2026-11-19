import en from './en.json';

type Params = Record<string, string | number | boolean>;

const messages: Record<string, string> = en;

/** Looks up an English UI string. A missing key shows the key itself so gaps are visible. */
export function t(key: string, params?: Params): string {
  const raw = messages[key] ?? key;
  if (!params) return raw;
  return raw.replace(/\{(\w+)\}/g, (match, name: string) => (name in params ? String(params[name]) : match));
}
