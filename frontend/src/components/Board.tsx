import { Fragment } from 'react';
import { orderBoardRows } from '../boardOrder';
import { fmtTime, fmtValue } from '../format';
import { t } from '../i18n';
import type { Alert, Role, Summary } from '../types';
import { LevelChip } from './AlertDialog';

const TREND: Record<Summary['score_trend'], string> = { up: '↑', down: '↓', steady: '→' };

const VITALS = ['hr', 'map', 'spo2'] as const;

export function Board({
  patients,
  alerts,
  role,
  selectedId,
  auditOpen,
  onSelect,
  onToggleAudit,
}: {
  patients: Summary[];
  alerts: Alert[];
  role: Role;
  selectedId: string | null;
  auditOpen: boolean;
  onSelect: (patientId: string) => void;
  onToggleAudit: () => void;
}) {
  const rows = orderBoardRows(patients, alerts, role);

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
                  <span className="row-vitals">
                    {VITALS.map((key, index) => {
                      const current = p.current_vital_freshness[key];
                      const fallback = p.vitals_stale ? p.last_vitals?.[key] : null;
                      const stale = current?.stale ?? (fallback != null);
                      const observedAt = current?.observed_at ?? (fallback == null ? null : p.last_vitals?.time);
                      return (
                        <Fragment key={key}>
                          {index > 0 && ' · '}
                          <span data-stale={stale}
                            title={observedAt ? t(stale ? 'row.vitalsStale' : 'row.vitalsFresh', { time: fmtTime(observedAt) }) : t('row.noVitals')}>
                            {key === 'spo2' ? 'SpO₂' : t(`vitals.short.${key}`)} {fmtValue(p.current_vitals[key] ?? fallback)}
                            {stale && !p.vitals_stale && <> <small>{t('row.stale')}</small></>}
                          </span>
                        </Fragment>
                      );
                    })}
                    {p.vitals_stale && p.last_vitals && <> <small>{t('row.stale')}</small></>}
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
