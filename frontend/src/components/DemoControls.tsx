import { useEffect, useState } from 'react';
import { fmtTime } from '../format';
import { t } from '../i18n';
import type { ScenarioInfo, SimStatus, Speed } from '../types';

const SPEEDS: readonly Speed[] = [30, 60, 120];

/** Sim-only controls; remain available while patient navigation is locked. */
export function DemoControls({
  sim,
  scenarios,
  cycleMinutes,
  busy,
  onReset,
  onPlay,
  onPause,
  onStep,
}: {
  sim: SimStatus;
  scenarios: ScenarioInfo[];
  cycleMinutes?: number;
  busy: boolean;
  onReset: (scenarioId: string) => void;
  onPlay: (speed: Speed) => void;
  onPause: () => void;
  onStep: (minutes: number) => void;
}) {
  const [scenario, setScenario] = useState(sim.scenario_id);
  // The user can choose a speed before starting. Once the simulation changes, the server is authoritative.
  const [pausedSpeed, setPausedSpeed] = useState<Speed | null>(null);
  const speed = sim.playing ? sim.speed : pausedSpeed ?? sim.speed;
  useEffect(() => setPausedSpeed(null), [sim.playing, sim.replay_id, sim.speed]);

  return (
    <section className="demo-bar" aria-label={t('demo.title')}>
      <span className="demo-title">{t('demo.title')}</span>
      {sim.rules_custom && <span className="gui-pill" data-testid="rules-custom-demo"
        title={t('gui.rules.customPillTip')}>{t('gui.rules.customPill')}</span>}
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
            if (sim.playing) onPlay(next);
            else setPausedSpeed(next);
          }}
        >
          {SPEEDS.map(s => (
            <option key={s} value={s}>
              {s}×
            </option>
          ))}
        </select>
      </label>
      <button type="button" data-testid="demo-step" disabled={busy || sim.playing || cycleMinutes === undefined}
        onClick={() => { if (cycleMinutes !== undefined) onStep(cycleMinutes); }}>
        {cycleMinutes === undefined ? t('demo.stepLoading') : t('demo.step', { minutes: cycleMinutes })}
      </button>
      <span className="demo-status" role="status">
        {sim.playing ? t('demo.playing') : t('demo.paused')} · {fmtTime(sim.time)}
      </span>
    </section>
  );
}
