/// <reference types="vite/client" />
import type { PyodideInterface } from 'pyodide';
import bridgeSource from './asgi_bridge.py?raw';
import type { BootMessage, EngineStage, RequestMessage, WorkerReply } from './protocol';

const ENGINE_ROOT = '/home/pyodide/engine';
const PACKAGES = ['pydantic-core', 'pyyaml', 'ssl'];

type Scope = {
  postMessage(message: WorkerReply, transfer?: Transferable[]): void;
  onmessage: ((event: MessageEvent<BootMessage | RequestMessage>) => void) | null;
};
type Dispatch = (method: string, path: string, query: string, headers: string, body: string) => Promise<string> & {
  destroy?: () => void;
};

const scope = self as unknown as Scope;
let dispatch: Dispatch | undefined;

function post(message: WorkerReply, transfer: Transferable[] = []) {
  scope.postMessage(message, transfer);
}

function stage(value: EngineStage) {
  post({ type: 'stage', stage: value });
}

async function boot({ pyodideBase, engineZip }: BootMessage): Promise<void> {
  if (typeof WebAssembly === 'undefined') throw new Error('WebAssembly is not available in this browser.');
  stage('runtime');
  // Runtime-selected URL (the self-hosted pyodide folder), so a static import cannot work here.
  const { loadPyodide } = await import(/* @vite-ignore */ new URL('pyodide.mjs', pyodideBase).href) as {
    loadPyodide: (options: { indexURL: string; packageBaseUrl: string }) => Promise<PyodideInterface>;
  };
  const pyodide = await loadPyodide({ indexURL: pyodideBase, packageBaseUrl: pyodideBase });
  stage('packages');
  await pyodide.loadPackage(PACKAGES);
  stage('engine');
  const archive = await fetch(engineZip);
  if (!archive.ok) throw new Error(`${engineZip}: HTTP ${archive.status}`);
  pyodide.unpackArchive(await archive.arrayBuffer(), 'zip', { extractDir: ENGINE_ROOT });
  await pyodide.runPythonAsync(bridgeSource);
  dispatch = pyodide.globals.get('dispatch') as Dispatch;
  const warmup = await call('GET', '/api/state', 'role=physician', {}, '');
  if (warmup.status >= 400) throw new Error(`warm-up failed with HTTP ${warmup.status}`);
}

async function call(method: string, path: string, query: string, headers: Record<string, string>, body: string) {
  if (!dispatch) throw new Error('The rules engine is not ready.');
  const pending = dispatch(method, path, query, JSON.stringify(headers), body);
  try {
    const [status, pairs, encoded] = JSON.parse(await pending) as [number, [string, string][], string];
    const bytes = Uint8Array.from(atob(encoded), char => char.charCodeAt(0));
    return { status, headers: pairs, body: bytes.buffer as ArrayBuffer };
  } finally {
    pending.destroy?.();
  }
}

scope.onmessage = event => {
  const message = event.data;
  if (message.type === 'boot') {
    boot(message).then(
      () => post({ type: 'ready' }),
      (error: unknown) => post({ type: 'boot-error', message: error instanceof Error ? error.message : String(error) }),
    );
    return;
  }
  call(message.method, message.path, message.query, message.headers, message.body).then(
    reply => post({ type: 'response', id: message.id, status: reply.status, headers: reply.headers, body: reply.body }, [reply.body]),
    (error: unknown) => post({ type: 'error', id: message.id, message: error instanceof Error ? error.message : String(error) }),
  );
};
