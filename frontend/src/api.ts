import type { AuditEntry, Detail, Role, RulesView, ScenarioInfo, State, Speed, VitalValues } from './types';
import { t } from './i18n';

/** The only module that calls the same-origin API. */
export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.message === 'stale_replay') return t('error.staleReplay');
    const translated = t(`vitals.error.${err.message}`, undefined, '');
    if (translated) return translated;
    return `${err.status} ${err.message}`;
  }
  return err instanceof Error ? err.message : String(err);
}

async function readDetail(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { detail?: unknown };
    if (body.detail !== undefined) {
      return typeof body.detail === 'string' ? body.detail : JSON.stringify(body.detail);
    }
  } catch {
    // Non-JSON error bodies fall back to the HTTP status text.
  }
  return res.statusText || `HTTP ${res.status}`;
}

async function request<T>(method: 'GET' | 'POST', path: string, body?: unknown, replayId?: string): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: body === undefined ? undefined : {
      'Content-Type': 'application/json',
      ...(replayId ? { 'X-Replay-Id': replayId } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw new ApiError(res.status, await readDetail(res));
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  state: (role: Role) => request<State>('GET', `/api/state?role=${role}`),
  patient: (id: string, role: Role) =>
    request<Detail>('GET', `/api/patients/${encodeURIComponent(id)}?role=${role}`),
  audit: () => request<AuditEntry[]>('GET', '/api/audit'),
  config: () => request<RulesView>('GET', '/api/config'),
  scenarios: () => request<ScenarioInfo[]>('GET', '/api/scenarios'),
  ack: (alertId: string, body: { action: string; reason?: string }, replayId: string) =>
    request<void>('POST', `/api/alerts/${encodeURIComponent(alertId)}/ack`, body, replayId),
  vitals: (patientId: string, values: VitalValues, replayId: string) =>
    request<void>('POST', `/api/patients/${encodeURIComponent(patientId)}/vitals`, values, replayId),
  reset: (scenarioId: string) => request<void>('POST', '/api/sim/reset', { scenario_id: scenarioId }),
  play: (speed: Speed) => request<void>('POST', '/api/sim/play', { speed }),
  pause: () => request<void>('POST', '/api/sim/pause'),
  step: () => request<void>('POST', '/api/sim/step', { minutes: 15 }),
};
