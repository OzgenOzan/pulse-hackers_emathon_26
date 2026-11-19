import { fmtTime, fmtValue } from '../format';
import { t } from '../i18n';
import type { Alert, Detail, Role } from '../types';
import { type ActAlert, AlertActions, ComponentTable, EscalatedTag, LevelChip, alertTitle } from './AlertDialog';

export function PatientDetail({
  detail,
  role,
  greenAlerts,
  busy,
  onAct,
  onEnterVitals,
}: {
  detail: Detail;
  role: Role;
  greenAlerts: Alert[];
  busy: boolean;
  onAct: ActAlert;
  onEnterVitals: (patientId: string) => void;
}) {
  const p = detail.profile;
  const { assessment } = detail;
  const greenForRole = greenAlerts.filter(a => a.target_role === role);
  const recentVitals = detail.vitals.slice(-6).reverse();

  return (
    <article className="detail" aria-labelledby="detail-title">
      <header>
        <h2 id="detail-title">{p.label}</h2>
        <p>
          {p.bed} · {p.age}
          {p.sex} · {t('detail.arrived', { time: fmtTime(p.arrived_at) })}
        </p>
        <p>
          {t('detail.monitored')}: {p.monitored ? t('detail.yes') : t('detail.no')}
          {detail.intervention_started && (
            <>
              {' · '}
              <strong>{t('detail.intervention')}</strong>
            </>
          )}
        </p>
        {p.working_dx.length > 0 && (
          <ul className="dx">
            {p.working_dx.map(d => (
              <li key={d.code}>
                {d.code} {d.text}
              </li>
            ))}
          </ul>
        )}
        {role === 'nurse' && (
          <button
            type="button"
            className="action"
            data-testid="detail-enter-vitals"
            onClick={() => onEnterVitals(p.id)}
          >
            {t('detail.enterVitals')}
          </button>
        )}
      </header>

      {greenForRole.length > 0 && (
        <section aria-label={t('detail.greenActions')}>
          <h3>{t('detail.greenActions')}</h3>
          {greenForRole.map(a => (
            <div key={a.id} className="green-item">
              <p>
                <LevelChip level={a.level} /> {alertTitle(a)}
              </p>
              <p className="hint suggest">{t('alert.greenSuggest')}</p>
              <AlertActions alert={a} busy={busy} onAct={onAct} />
            </div>
          ))}
        </section>
      )}

      <section>
        <h3>{t('detail.assessment')}</h3>
        <p>{t('detail.score', { score: assessment.score })}</p>
        <ComponentTable components={assessment.components} empty={t('detail.noComponents')} />
        <h4>{t('detail.suppressed')}</h4>
        {assessment.suppressed_labs.length === 0 ? (
          <p>{t('detail.suppressedNone')}</p>
        ) : (
          <ul>
            {assessment.suppressed_labs.map(s => (
              <li key={`${s.test}-${s.observed_at}`}>
                {s.test} {s.value} {s.unit}: {s.reason}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h3>{t('detail.vitals')}</h3>
        {recentVitals.length === 0 ? (
          <p>{t('detail.noVitals')}</p>
        ) : (
          <table className="data">
            <thead>
              <tr>
                <th>{t('table.time')}</th>
                <th>{t('table.source')}</th>
                <th>{t('vitals.short.hr')}</th>
                <th>{t('vitals.short.bp')}</th>
                <th>{t('vitals.short.map')}</th>
                <th>{t('vitals.short.temp')}</th>
                <th>{t('vitals.short.spo2')}</th>
                <th>{t('vitals.short.rr')}</th>
              </tr>
            </thead>
            <tbody>
              {recentVitals.map(v => (
                <tr key={`${v.time}-${v.source}`}>
                  <td>{fmtTime(v.time)}</td>
                  <td>{v.source}</td>
                  <td>{fmtValue(v.hr)}</td>
                  <td>
                    {fmtValue(v.sbp)}/{fmtValue(v.dbp)}
                  </td>
                  <td>{fmtValue(v.map)}</td>
                  <td>{fmtValue(v.temp, 1)}</td>
                  <td>{fmtValue(v.spo2)}</td>
                  <td>{fmtValue(v.rr)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section>
        <h3>{t('detail.labs')}</h3>
        {detail.labs.length === 0 ? (
          <p>{t('detail.noLabs')}</p>
        ) : (
          <table className="data">
            <thead>
              <tr>
                <th>{t('table.test')}</th>
                <th>{t('table.value')}</th>
                <th>{t('table.ordered')}</th>
                <th>{t('table.resulted')}</th>
              </tr>
            </thead>
            <tbody>
              {detail.labs.map(l => (
                <tr key={`${l.test}-${l.ordered_at}`}>
                  <td>{l.test}</td>
                  <td>{l.value === null ? t('detail.pending') : `${l.value} ${l.unit ?? ''}`}</td>
                  <td>{fmtTime(l.ordered_at)}</td>
                  <td>{fmtTime(l.resulted_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section>
        <h3>{t('detail.history')}</h3>
        {detail.alert_history.length === 0 ? (
          <p>{t('detail.noHistory')}</p>
        ) : (
          <ul className="history">
            {detail.alert_history.map(a => (
              <li key={a.id}>
                <LevelChip level={a.level} /> <EscalatedTag escalated={a.escalated} /> {alertTitle(a)}{' '}
                <span>{fmtTime(a.created_at)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </article>
  );
}
