import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError } from '../api';
import type { Role, State } from '../types';

type Connection = 'connected' | 'weak' | 'offline';
const POLL_MS = 1000;

const errors: Record<string, string> = {
  red_navigation_blocked: 'Önce kritik alarm için klinik değerlendirme kaydı oluşturun.',
  stale_replay: 'Bu işlem önceki demoya ait. Güncel hasta listesini kontrol edin.',
  replay_id_required: 'Önce güncel demo verilerini yükleyin.',
  note_too_long: 'Değerlendirme notu en fazla 280 karakter olabilir.',
  vital_required_missing: 'Zorunlu vital ölçümlerin tümünü girin.',
  vital_out_of_range: 'Bir veya daha fazla ölçüm izin verilen aralığın dışında.',
  sbp_not_above_dbp: 'Sistolik basınç diyastolik basınçtan yüksek olmalıdır.',
  map_outside_bp: 'OAB, diyastolik ve sistolik basınç arasında olmalıdır.',
  alert_already_closed: 'Bu alarm artık açık değil.',
  unknown_alert: 'Alarm güncel demoda bulunamadı.',
  unknown_patient: 'Hasta güncel demoda bulunamadı.',
  valid_reason_required: 'Geçerli bir gerekçe seçin.',
};

export function guiError(error: unknown): string {
  return (error instanceof ApiError && errors[error.message]) || 'İşlem tamamlanamadı. Lütfen yeniden deneyin.';
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
