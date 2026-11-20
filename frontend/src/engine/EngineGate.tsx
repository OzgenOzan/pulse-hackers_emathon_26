import { useEffect, useState, type ReactNode } from 'react';
import { t } from '../i18n';
import { bootEngine } from './client';
import type { EngineStage } from './protocol';
import './boot.css';

const REPO_URL = 'https://github.com/OzgenOzan/pulse-hackers_emathon_26';
const STAGE_KEYS: Record<EngineStage, string> = {
  runtime: 'pages.boot.runtime',
  packages: 'pages.boot.packages',
  engine: 'pages.boot.engine',
};

/** Shows the boot screen until the in-browser engine has answered its warm-up request. */
export function EngineGate({ children }: { children: ReactNode }) {
  const [stage, setStage] = useState<EngineStage>('runtime');
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    bootEngine(setStage).then(
      () => setReady(true),
      (reason: unknown) => setError(reason instanceof Error ? reason.message : String(reason)),
    );
  }, []);

  if (ready) return children;
  return (
    <main className="boot-screen">
      <section className="boot-card">
        <h1>{t('pages.boot.title')}</h1>
        {error ? <>
          <p role="alert">{t('pages.boot.error', { message: error })}</p>
          <p><a href="demo-backup.mp4">{t('pages.boot.video')}</a></p>
          <p><a href={REPO_URL}>{t('pages.boot.repo')}</a></p>
        </> : <>
          <p>{t('pages.boot.body')}</p>
          <p role="status">{t(STAGE_KEYS[stage])}</p>
        </>}
      </section>
    </main>
  );
}
