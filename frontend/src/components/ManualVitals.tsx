import { useState, type FormEvent } from 'react';
import { t } from '../i18n';
import type { Profile, RulesView, VitalValues } from '../types';

type VitalKey = keyof VitalValues;
const FIELDS: readonly VitalKey[] = ['hr', 'sbp', 'dbp', 'map', 'temp', 'spo2', 'rr'];
const EMPTY: Record<VitalKey, string> = { hr: '', sbp: '', dbp: '', map: '', temp: '', spo2: '', rr: '' };

export function ManualVitals({
  profile,
  rules,
  busy,
  onSave,
  onCancel,
}: {
  profile: Profile;
  rules: RulesView['manual_entry'];
  busy: boolean;
  onSave: (values: VitalValues) => void;
  onCancel: () => void;
}) {
  const [raw, setRaw] = useState(EMPTY);
  const [errors, setErrors] = useState<Partial<Record<VitalKey, string>>>({});

  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const values: Partial<Record<VitalKey, number>> = {};
    const issues: Partial<Record<VitalKey, string>> = {};
    for (const key of FIELDS) {
      const input = e.currentTarget.elements.namedItem(key) as HTMLInputElement;
      const text = raw[key].trim();
      const limit = rules.limits[key];
      if (input.validity.badInput) issues[key] = t('vitals.invalid');
      else if (!text) {
        if (rules.required.includes(key)) issues[key] = t('vitals.fieldRequired');
      } else {
        const value = Number(text);
        if (!Number.isFinite(value) || value < limit.min || value > limit.max) issues[key] = t('vitals.fieldRange', limit);
        else values[key] = value;
      }
    }
    const { sbp, dbp, map } = values;
    if (sbp !== undefined && dbp !== undefined) {
      if (sbp <= dbp) issues.sbp = t('vitals.error.sbp_not_above_dbp');
      else if (map !== undefined && (map < dbp || map > sbp)) issues.map = t('vitals.error.map_outside_bp');
    }
    setErrors(issues);
    if (Object.keys(issues).length) return;
    onSave(values);
  };

  return (
    <form className="vitals" data-testid="manual-vitals" onSubmit={submit} noValidate>
      <h3>
        {t('vitals.title')} · {profile.label}
      </h3>
      <p className="hint">{t('vitals.hint')}</p>
      <div className="vitals-grid">
        {FIELDS.map(key => (
          <label key={key} className="field">
            <span>{t(`vitals.${key}`)}{rules.required.includes(key) ? ' *' : ''}</span>
            <input
              data-testid={`vital-${key}`}
              name={key}
              required={rules.required.includes(key)}
              min={rules.limits[key].min}
              max={rules.limits[key].max}
              aria-invalid={!!errors[key]}
              aria-describedby={errors[key] ? `vital-error-${key}` : undefined}
              type="number"
              inputMode="decimal"
              step="any"
              value={raw[key]}
              disabled={busy}
              onChange={e => {
                setRaw(r => ({ ...r, [key]: e.target.value }));
                setErrors({});
              }}
            />
            {errors[key] && <span className="field-error" id={`vital-error-${key}`} role="alert">{errors[key]}</span>}
          </label>
        ))}
      </div>
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
