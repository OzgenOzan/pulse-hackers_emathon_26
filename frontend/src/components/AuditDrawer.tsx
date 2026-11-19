import { fmtTime, fmtValue } from '../format';
import { t } from '../i18n';
import type { AuditEntry } from '../types';

export function AuditDrawer({ entries, onClose }: { entries: AuditEntry[]; onClose: () => void }) {
  return (
    <aside className="drawer" data-testid="audit-drawer" aria-labelledby="audit-title">
      <div className="drawer-head">
        <h2 id="audit-title">{t('audit.title')}</h2>
        <button type="button" className="big" onClick={onClose}>
          {t('audit.close')}
        </button>
      </div>
      {entries.length === 0 ? (
        <p>{t('audit.empty')}</p>
      ) : (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>{t('audit.col.id')}</th>
                <th>{t('audit.col.time')}</th>
                <th>{t('audit.col.event')}</th>
                <th>{t('audit.col.patient')}</th>
                <th>{t('audit.col.role')}</th>
                <th>{t('audit.col.action')}</th>
                <th>{t('audit.col.reason')}</th>
                <th>{t('audit.col.latency')}</th>
              </tr>
            </thead>
            <tbody>
              {[...entries].reverse().map(e => (
                <tr key={e.id}>
                  <td>{e.id}</td>
                  <td>{fmtTime(e.sim_time)}</td>
                  <td>{t(`event.${e.event}`, undefined, e.event)}</td>
                  <td>{e.patient_id}</td>
                  <td>{e.role ? t(`app.role.${e.role}`) : '–'}</td>
                  <td>{e.action === 'expected_for_patient' ? t('audit.override') : (e.action ? t(`action.${e.action}`, undefined, e.action) : '–')}</td>
                  <td>{e.reason ? t(`reason.${e.reason}`, undefined, e.reason) : '–'}</td>
                  <td>{fmtValue(e.latency_minutes)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </aside>
  );
}
