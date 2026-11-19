import { useEffect, useState } from 'react';

export type Theme = 'light' | 'dark' | 'system';
export function useChoice<T extends string>(key: string, choices: readonly T[], fallback: T) {
  const [choice, setChoice] = useState<T>(() => {
    try {
      const saved = window.localStorage.getItem(key);
      return choices.find(value => value === saved) ?? fallback;
    } catch { return fallback; }
  });
  useEffect(() => {
    try { window.localStorage.setItem(key, choice); } catch { /* preferences still work for this visit */ }
  }, [key, choice]);
  return [choice, setChoice] as const;
}

export function useTheme() {
  const preference = useChoice<Theme>('sg.theme', ['system', 'light', 'dark'], 'system');
  const [theme] = preference;
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      document.documentElement.dataset.theme = theme === 'system' ? media.matches ? 'dark' : 'light' : theme;
    };
    apply();
    if (theme !== 'system') return;
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [theme]);
  return preference;
}
