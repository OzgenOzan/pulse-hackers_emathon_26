import type { AuditEntry, CriticalAlarm, Detail, ManualValues, Role, RulesView, ScenarioInfo, State, Speed } from './types';

/** The only module that calls the same-origin API. */
export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
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

const MUTATION_TIMEOUT_MS = 5000;

async function request<T>(method: 'GET' | 'POST', path: string, body?: unknown, replayId?: string, signal?: AbortSignal): Promise<T> {
  const deadline = method === 'POST' ? AbortSignal.timeout(MUTATION_TIMEOUT_MS) : signal;
  const res = await fetch(path, {
    method,
    signal: deadline,
    headers: body === undefined ? undefined : {
      'Content-Type': 'application/json',
      ...(replayId ? { 'X-Replay-Id': replayId } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await readDetail(res);
    deadline?.throwIfAborted();
    throw new ApiError(res.status, detail);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  state: (role: Role, signal?: AbortSignal) => request<State>('GET', `/api/state?role=${role}`, undefined, undefined, signal),
  patient: (id: string, role: Role) =>
    request<Detail>('GET', `/api/patients/${encodeURIComponent(id)}?role=${role}`),
  audit: () => request<AuditEntry[]>('GET', '/api/audit'),
  alarms: () => request<CriticalAlarm[]>('GET', '/api/alerts?level=RED'),
  config: (signal?: AbortSignal) => request<RulesView>('GET', '/api/config', undefined, undefined, signal),
  scenarios: (signal?: AbortSignal) => request<ScenarioInfo[]>('GET', '/api/scenarios', undefined, undefined, signal),
  seen: (alertId: string, role: Role, replayId: string) =>
    request<void>('POST', `/api/alerts/${encodeURIComponent(alertId)}/seen`, { role }, replayId),
  ack: (alertId: string, body: { action: string; reason?: string; note?: string }, replayId: string) =>
    request<void>('POST', `/api/alerts/${encodeURIComponent(alertId)}/ack`, body, replayId),
  vitals: (patientId: string, values: ManualValues, replayId: string) =>
    request<void>('POST', `/api/patients/${encodeURIComponent(patientId)}/vitals`, values, replayId),
  reset: (scenarioId: string) => request<void>('POST', '/api/sim/reset', { scenario_id: scenarioId }),
  play: (speed: Speed) => request<void>('POST', '/api/sim/play', { speed }),
  pause: () => request<void>('POST', '/api/sim/pause'),
  step: (minutes: number) => request<void>('POST', '/api/sim/step', { minutes }),
};
