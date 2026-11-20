import { useState } from 'react';
import { fmtTime } from '../format';
import { t } from '../i18n';
import type { ScenarioInfo, SimStatus, Speed } from '../types';

const SPEEDS: readonly Speed[] = [30, 60, 120];

/** Sim-only controls; remain available while patient navigation is locked. */
export function DemoControls({
  sim,
  scenarios,
  busy,
  onReset,
  onPlay,
  onPause,
  onStep,
}: {
  sim: SimStatus;
  scenarios: ScenarioInfo[];
  busy: boolean;
  onReset: (scenarioId: string) => void;
  onPlay: (speed: Speed) => void;
  onPause: () => void;
  onStep: () => void;
}) {
  const [scenario, setScenario] = useState(sim.scenario_id);
  const [speed, setSpeed] = useState<Speed>(sim.speed);

  return (
    <section className="demo-bar" aria-label={t('demo.title')}>
      <span className="demo-title">{t('demo.title')}</span>
      <label>
        {t('demo.scenario')}{' '}
        <select data-testid="demo-scenario" value={scenario} onChange={e => setScenario(e.target.value)}>
          {scenarios.map(s => {
            const name = t(`demo.scenario.${s.id}`, undefined, s.title);
            return <option key={s.id} value={s.id} disabled={s.error !== null}>
              {s.error ? t('demo.invalidScenario', { name }) : name}
            </option>;
          })}
        </select>
      </label>
      <button type="button" data-testid="demo-reset" disabled={busy} onClick={() => onReset(scenario)}>
        {t('demo.reset')}
      </button>
      {sim.playing ? (
        <button type="button" data-testid="demo-pause" disabled={busy} onClick={onPause}>
          {t('demo.pause')}
        </button>
      ) : (
        <button type="button" data-testid="demo-play" disabled={busy} onClick={() => onPlay(speed)}>
          {t('demo.play')}
        </button>
      )}
      <label>
        {t('demo.speed')}{' '}
        <select
          data-testid="demo-speed"
          value={speed}
          disabled={busy}
          onChange={e => {
            const next = Number(e.target.value) as Speed;
            setSpeed(next);
            if (sim.playing) onPlay(next);
          }}
        >
          {SPEEDS.map(s => (
            <option key={s} value={s}>
              {s}×
            </option>
          ))}
        </select>
      </label>
      <button type="button" data-testid="demo-step" disabled={busy || sim.playing} onClick={onStep}>
        {t('demo.step')}
      </button>
      <span className="demo-status" role="status">
        {sim.playing ? t('demo.playing') : t('demo.paused')} · {fmtTime(sim.time)}
      </span>
    </section>
  );
}
