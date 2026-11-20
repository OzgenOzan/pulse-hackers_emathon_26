import { useEffect, useState } from 'react';

export type ThemeChoice = 'light' | 'dark' | 'system';
export type EffectiveTheme = 'light' | 'dark';

const DARK_QUERY = '(prefers-color-scheme: dark)';

function matchMediaList(media: string): MediaQueryList | null {
  return typeof window.matchMedia === 'function' ? window.matchMedia(media) : null;
}

/** Tracks a media query; false when matchMedia is unavailable. */
export function useMediaQuery(media: string): boolean {
  const [matches, setMatches] = useState(() => matchMediaList(media)?.matches ?? false);
  useEffect(() => {
    const list = matchMediaList(media);
    if (!list) return;
    const update = () => setMatches(list.matches);
    update();
    list.addEventListener('change', update);
    return () => list.removeEventListener('change', update);
  }, [media]);
  return matches;
}

/** The theme actually shown for a choice; "system" follows the OS preference and re-renders when it changes. */
export function useEffectiveTheme(choice: ThemeChoice): EffectiveTheme {
  const systemDark = useMediaQuery(DARK_QUERY);
  if (choice !== 'system') return choice;
  return systemDark ? 'dark' : 'light';
}
