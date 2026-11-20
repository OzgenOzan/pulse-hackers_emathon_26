/** Messages between the page (client.ts) and the engine worker (worker.ts). */
export type EngineStage = 'runtime' | 'packages' | 'engine';

export type BootMessage = { type: 'boot'; pyodideBase: string; engineZip: string };

export type RequestMessage = {
  type: 'request';
  id: number;
  method: string;
  path: string;
  query: string;
  headers: Record<string, string>;
  body: string;
};

export type WorkerReply =
  | { type: 'stage'; stage: EngineStage }
  | { type: 'ready' }
  | { type: 'boot-error'; message: string }
  | { type: 'response'; id: number; status: number; headers: [string, string][]; body: ArrayBuffer }
  | { type: 'error'; id: number; message: string };
