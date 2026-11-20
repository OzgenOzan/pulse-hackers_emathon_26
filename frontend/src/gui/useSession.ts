import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError } from '../api';
import { t } from '../i18n';
import type { Role, State } from '../types';

type Connection = 'connected' | 'weak' | 'offline';
const POLL_MS = 1000;

export function guiError(error: unknown): string {
  const fallback = t('gui.error.generic');
  return error instanceof ApiError ? t(`gui.error.${error.message}`, undefined, fallback) : fallback;
}

export function useSession(role: Role, notify: (notice: string) => void) {
  const [snapshot, setSnapshot] = useState<{ role: Role; state: State } | null>(null);
  const [connection, setConnection] = useState<Connection>('weak');
  const [lastSuccess, setLastSuccess] = useState<Date | null>(null);
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  const [pollKey, requestPoll] = useState(0);
  const failures = useRef(0);
  const generation = useRef(0);
  const mutation = useRef(false);

  useEffect(() => {
    let alive = true;
    const lifetime = new AbortController();
    let timer: number | undefined;
    const tick = async () => {
      const start = performance.now();
      const guard = generation.current;
      const slow = window.setTimeout(() => {
        if (alive && !mutation.current && guard === generation.current) {
          setConnection(current => current === 'offline' ? current : 'weak');
        }
      }, 2000);
      try {
        const state = await api.state(role, AbortSignal.any([lifetime.signal, AbortSignal.timeout(5000)]));
        if (alive && !mutation.current && guard === generation.current) {
          failures.current = 0;
          setLastSuccess(new Date());
          setConnection(performance.now() - start > 2000 ? 'weak' : 'connected');
          setSnapshot({ role, state });
        }
      } catch {
        if (alive && !mutation.current && guard === generation.current) {
          setConnection(++failures.current >= 3 ? 'offline' : 'weak');
        }
      } finally {
        window.clearTimeout(slow);
        if (alive) timer = window.setTimeout(tick, POLL_MS);
      }
    };
    void tick();
    return () => {
      alive = false;
      window.clearTimeout(timer);
      lifetime.abort();
    };
  }, [role, pollKey]);

  const mutate = useCallback(async (action: () => Promise<unknown>): Promise<boolean> => {
    if (mutation.current || connection === 'offline') return false;
    mutation.current = true;
    generation.current += 1;
    setBusy(true);
    let succeeded = false;
    try {
      await action();
      succeeded = true;
    } catch (error) {
      notify(guiError(error));
    } finally {
      generation.current += 1;
      mutation.current = false;
      setBusy(false);
      requestPoll(key => key + 1);
      if (succeeded) setRevision(value => value + 1);
    }
    return succeeded;
  }, [connection, notify]);

  return { state: snapshot?.role === role ? snapshot.state : null, connection, lastSuccess, busy, revision, mutate };
}
