import { fmtTime, fmtValue } from '../format';
import { t } from '../i18n';
import type { Alert, Level, Summary } from '../types';
import { LevelChip } from './AlertDialog';

const RANK: Record<Level, number> = { GREEN: 1, YELLOW: 2, RED: 3 };
const TREND: Record<Summary['score_trend'], string> = { up: '↑', down: '↓', steady: '→' };

function worstLevel(patientId: string, alerts: Alert[]): Level | null {
  let worst: Level | null = null;
  for (const a of alerts) {
    if (a.patient_id === patientId && (worst === null || RANK[a.level] > RANK[worst])) worst = a.level;
  }
  return worst;
}

function vitalsText(p: Summary): string {
  if (!p.last_vitals) return t('row.noVitals');
  const time = fmtTime(p.last_vitals.time);
  return p.vitals_stale ? t('row.vitalsStale', { time }) : t('row.vitalsFresh', { time });
}

export function Board({
  patients,
  alerts,
  selectedId,
  auditOpen,
  onSelect,
  onToggleAudit,
}: {
  patients: Summary[];
  alerts: Alert[];
  selectedId: string | null;
  auditOpen: boolean;
  onSelect: (patientId: string) => void;
  onToggleAudit: () => void;
}) {
  const rows = patients
    .map(p => ({ p, level: worstLevel(p.id, alerts) }))
    .sort((a, b) => (b.level ? RANK[b.level] : 0) - (a.level ? RANK[a.level] : 0) || b.p.score - a.p.score);

  return (
    <section className="board" aria-label={t('app.region.board')}>
      <div className="board-head">
        <h2>{t('board.title')}</h2>
        <button
          type="button"
          className="big"
          data-testid="open-audit"
          aria-expanded={auditOpen}
          onClick={onToggleAudit}
        >
          {t('board.audit')}
        </button>
      </div>
      {rows.length === 0 ? (
        <p>{t('board.empty')}</p>
      ) : (
        <ul className="rows">
          {rows.map(({ p, level }) => {
            const selected = selectedId === p.id;
            const dx = p.working_dx[0];
            const diagnosis = dx ? `${dx.code} ${t(`dx.${dx.code}`, undefined, dx.text)}` : '–';
            const readings = p.vitals_stale ? p.last_vitals : p.current_vitals;
            const vitals = t('row.vitalsSummary', {
              hr: fmtValue(readings?.hr), map: fmtValue(readings?.map), spo2: fmtValue(readings?.spo2),
            });
            return (
              <li key={p.id}>
                <button
                  type="button"
                  className={selected ? 'row selected' : 'row'}
                  data-testid={`board-row-${p.id}`}
                  aria-pressed={selected}
                  onClick={() => onSelect(p.id)}
                >
                  <span>{level ? <LevelChip level={level} /> : '–'}</span>
                  <span>{p.bed}</span>
                  <strong>{p.label}</strong>
                  <span>{p.age}{t(`sex.${p.sex}`)}</span>
                  <span className="row-dx" title={diagnosis}>{diagnosis}</span>
                  <span>{t('row.minutes', { minutes: p.minutes_in_zone })}</span>
                  <span className="row-vitals" data-stale={p.vitals_stale} title={vitalsText(p)}>
                    {vitals}{p.vitals_stale && <> <small>{t('row.stale')}</small></>}
                  </span>
                  <span title={t(`row.trend.${p.score_trend}`)}>
                    {t('row.score', { score: p.score })} {TREND[p.score_trend]}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
