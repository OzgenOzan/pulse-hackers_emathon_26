import type { BootMessage, EngineStage, RequestMessage, WorkerReply } from './protocol';

type Pending = {
  resolve: (response: Response) => void;
  reject: (reason: unknown) => void;
  signal?: AbortSignal;
  onAbort: () => void;
};

let worker: Worker | undefined;
let boot: Promise<void> | undefined;
let nextId = 1;
const pending = new Map<number, Pending>();

/** Starts the engine worker exactly once per tab; later callers share the same promise. */
export function bootEngine(onStage: (stage: EngineStage) => void): Promise<void> {
  boot ??= new Promise<void>((resolve, reject) => {
    if (typeof Worker === 'undefined') {
      reject(new Error('Web Workers are not available in this browser.'));
      return;
    }
    const started = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    worker = started;
    started.onmessage = (event: MessageEvent<WorkerReply>) => {
      const reply = event.data;
      switch (reply.type) {
        case 'stage': onStage(reply.stage); break;
        case 'ready': resolve(); break;
        case 'boot-error': reject(new Error(reply.message)); break;
        case 'response': finish(reply.id)?.resolve(toResponse(reply)); break;
        case 'error': finish(reply.id)?.reject(new Error(reply.message)); break;
      }
    };
    started.onerror = event => reject(new Error(event.message || 'The engine worker failed to load.'));
    const message: BootMessage = {
      type: 'boot',
      pyodideBase: new URL('pyodide/', document.baseURI).href,
      engineZip: new URL('engine/engine.zip', document.baseURI).href,
    };
    started.postMessage(message);
  });
  return boot;
}

/** Same contract as fetch() for the same-origin API: real Response, abort honoured, late replies dropped. */
export function engineFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const signal = init.signal ?? undefined;
  if (signal?.aborted) return Promise.reject(signal.reason);
  if (!worker) return Promise.reject(new Error('The rules engine has not started.'));
  const id = nextId++;
  const url = new URL(path, 'http://engine.local');
  const headers: Record<string, string> = {};
  new Headers(init.headers).forEach((value, name) => { headers[name] = value; });
  const request: RequestMessage = {
    type: 'request',
    id,
    method: init.method ?? 'GET',
    path: decodeURIComponent(url.pathname),
    query: url.search.slice(1),
    headers,
    body: typeof init.body === 'string' ? init.body : '',
  };
  return new Promise<Response>((resolve, reject) => {
    const entry: Pending = {
      resolve,
      reject,
      signal,
      onAbort: () => {
        pending.delete(id);
        reject(signal?.reason);
      },
    };
    pending.set(id, entry);
    signal?.addEventListener('abort', entry.onAbort, { once: true });
    worker?.postMessage(request);
  });
}

function finish(id: number): Pending | undefined {
  const entry = pending.get(id);
  if (entry) {
    pending.delete(id);
    entry.signal?.removeEventListener('abort', entry.onAbort);
  }
  return entry;
}

function toResponse(reply: Extract<WorkerReply, { type: 'response' }>): Response {
  // A 204 or 304 Response must have a null body, or the constructor throws.
  const bodyless = reply.status === 204 || reply.status === 304;
  return new Response(bodyless ? null : reply.body, { status: reply.status, headers: reply.headers });
}
