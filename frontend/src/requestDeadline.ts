const DEADLINE_MS = 5000;

/** Apply a request deadline while also honoring the page or poll's lifetime, if supplied. */
export async function withRequestDeadline<T>(run: (signal: AbortSignal) => Promise<T>, lifetime?: AbortSignal): Promise<T> {
  if (typeof AbortSignal.timeout === 'function' && (!lifetime || typeof AbortSignal.any === 'function')) {
    const deadline = AbortSignal.timeout(DEADLINE_MS);
    return run(lifetime ? AbortSignal.any([lifetime, deadline]) : deadline);
  }

  const controller = new AbortController();
  const cancel = () => controller.abort(lifetime?.reason);
  if (lifetime?.aborted) cancel();
  else lifetime?.addEventListener('abort', cancel, { once: true });
  const timer = setTimeout(() => controller.abort(new DOMException('Request timed out', 'TimeoutError')), DEADLINE_MS);
  try {
    return await run(controller.signal);
  } finally {
    clearTimeout(timer);
    lifetime?.removeEventListener('abort', cancel);
  }
}
