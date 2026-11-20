import type { AuditEntry, CriticalAlarm, Detail, ManualValues, Role, RulesView, ScenarioInfo, State, Speed } from './types';

type ApiErrorBody = {
  detail?: unknown;
  paths?: string[];
  errors?: { loc: string; msg: string }[];
};

/** The only module that calls the same-origin API. */
export class ApiError extends Error {
  readonly status: number;
  readonly body?: ApiErrorBody;

  constructor(status: number, message: string, body?: ApiErrorBody) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

export type ConfigMutationResult = { ok: boolean; error?: ApiError };

async function readError(res: Response): Promise<ApiError> {
  let body: ApiErrorBody | undefined;
  let message = res.statusText || `HTTP ${res.status}`;
  try {
    const parsed: unknown = await res.json();
    if (parsed && typeof parsed === 'object') {
      body = parsed as ApiErrorBody;
      const detail = body.detail;
      if (detail !== undefined) message = typeof detail === 'string' ? detail : JSON.stringify(detail);
    }
  } catch {
    // Non-JSON error bodies fall back to the HTTP status text.
  }
  return new ApiError(res.status, message, body);
}

const MUTATION_TIMEOUT_MS = 5000;

async function request<T>(method: 'GET' | 'POST' | 'PUT', path: string, body?: unknown, replayId?: string, signal?: AbortSignal): Promise<T> {
  const deadline = method === 'GET' ? signal : AbortSignal.timeout(MUTATION_TIMEOUT_MS);
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
    const error = await readError(res);
    deadline?.throwIfAborted();
    throw error;
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
  configDefaults: (signal?: AbortSignal) => request<RulesView>('GET', '/api/config/defaults', undefined, undefined, signal),
  applyConfig: (role: Role, config: RulesView, replayId: string) =>
    request<void>('PUT', '/api/config', { role, config }, replayId),
  resetConfig: (role: Role, replayId: string) => request<void>('POST', '/api/config/reset', { role }, replayId),
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
