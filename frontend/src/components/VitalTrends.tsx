import { fmtTime, fmtValue } from '../format';
import { t } from '../i18n';
import type { VitalReading } from '../types';

const W = 216;
const H = 42;
const PAD = 5;

function Series({ readings, metric }: { readings: VitalReading[]; metric: 'map' | 'hr' }) {
  const points = readings.flatMap((reading, index) => {
    const value = reading[metric];
    return value == null ? [] : [{ value, index }];
  });
  if (!points.length) return null;
  const label = t(`vitals.short.${metric}`);
  const low = Math.min(...points.map(p => p.value));
  const high = Math.max(...points.map(p => p.value));
  const latest = points[points.length - 1];
  const plot = points.map(({ index, value }) => ({
    i: index,
    x: PAD + index * (W - 2 * PAD) / Math.max(1, readings.length - 1),
    y: high === low ? H / 2 : PAD + (high - value) * (H - 2 * PAD) / (high - low),
  }));
  const path = plot.map(({ i, x, y }, j) => `${j > 0 && i === plot[j - 1].i + 1 ? 'L' : 'M'}${x},${y}`).join(' ');
  const end = plot[plot.length - 1];
  const description = t('trends.value', { name: label, latest: fmtValue(latest.value), low: fmtValue(low), high: fmtValue(high) });
  return (
    <div className="trend-series">
      <span aria-hidden="true"><strong>{label}</strong> · {fmtValue(latest.value)}</span>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={description}>
        <path d={path} fill="none" stroke="currentColor" strokeWidth="2.5" />
        <circle cx={end.x} cy={end.y} r="3.5" fill="currentColor" />
      </svg>
    </div>
  );
}

export function VitalTrends({ history }: { history: VitalReading[] }) {
  const readings = history.slice(-6);
  if (!readings.some(r => r.map != null || r.hr != null)) return null;
  return (
    <section className="trends" data-testid="vital-trends" aria-label={t('trends.title')}>
      <div className="trend-heading">
        <strong>{t('trends.title')}</strong>
        <span>{t('trends.range', { start: fmtTime(readings[0].time), end: fmtTime(readings[readings.length - 1].time) })}</span>
      </div>
      <div className="trend-grid">
        <Series readings={readings} metric="map" />
        <Series readings={readings} metric="hr" />
      </div>
    </section>
  );
}
