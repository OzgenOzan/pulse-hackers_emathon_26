import type { AuditEntry, Detail, Role, RulesView, ScenarioInfo, State, Speed, VitalValues } from './types';

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
  if (err instanceof ApiError) return `${err.status} ${err.message}`;
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

async function request<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
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
  ack: (alertId: string, body: { action: string; reason?: string }) =>
    request<void>('POST', `/api/alerts/${encodeURIComponent(alertId)}/ack`, body),
  vitals: (patientId: string, values: VitalValues) =>
    request<void>('POST', `/api/patients/${encodeURIComponent(patientId)}/vitals`, values),
  reset: (scenarioId: string) => request<void>('POST', '/api/sim/reset', { scenario_id: scenarioId }),
  play: (speed: Speed) => request<void>('POST', '/api/sim/play', { speed }),
  pause: () => request<void>('POST', '/api/sim/pause'),
  step: () => request<void>('POST', '/api/sim/step', { minutes: 15 }),
};
