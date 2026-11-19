import { useState, type FormEvent } from 'react';
import { t } from '../i18n';
import type { Profile, VitalValues } from '../types';

type VitalKey = keyof VitalValues;
const FIELDS: readonly VitalKey[] = ['hr', 'sbp', 'dbp', 'map', 'temp', 'spo2', 'rr'];
const EMPTY: Record<VitalKey, string> = { hr: '', sbp: '', dbp: '', map: '', temp: '', spo2: '', rr: '' };

export function ManualVitals({
  profile,
  busy,
  onSave,
  onCancel,
}: {
  profile: Profile;
  busy: boolean;
  onSave: (values: VitalValues) => void;
  onCancel: () => void;
}) {
  const [raw, setRaw] = useState(EMPTY);
  const [error, setError] = useState<string | null>(null);

  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const values: VitalValues = {};
    for (const key of FIELDS) {
      const text = raw[key].trim();
      if (text === '') continue;
      const n = Number(text);
      if (!Number.isFinite(n)) {
        setError(t('vitals.invalid'));
        return;
      }
      values[key] = n;
    }
    if (Object.keys(values).length === 0) {
      setError(t('vitals.needOne'));
      return;
    }
    setError(null);
    onSave(values);
  };

  return (
    <form className="vitals" data-testid="manual-vitals" onSubmit={submit}>
      <h3>
        {t('vitals.title')} · {profile.label}
      </h3>
      <p className="hint">{t('vitals.hint')}</p>
      <div className="vitals-grid">
        {FIELDS.map(key => (
          <label key={key} className="field">
            <span>{t(`vitals.${key}`)}</span>
            <input
              data-testid={`vital-${key}`}
              type="number"
              inputMode="decimal"
              step="any"
              value={raw[key]}
              disabled={busy}
              onChange={e => setRaw(r => ({ ...r, [key]: e.target.value }))}
            />
          </label>
        ))}
      </div>
      {error && (
        <p role="alert" className="field-error">
          {error}
        </p>
      )}
      <div className="form-actions">
        <button type="submit" className="big primary" disabled={busy}>
          {t('vitals.save')}
        </button>
        <button type="button" className="big" disabled={busy} onClick={onCancel}>
          {t('vitals.cancel')}
        </button>
      </div>
    </form>
  );
}
