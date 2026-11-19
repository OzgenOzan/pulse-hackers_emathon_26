import { useId, useState, type FormEvent } from 'react';
import { bedLabel } from '../clinical';
import type { ManualValues, Profile, RulesView } from '../../types';
import { copy } from './copy';
import './alarms.css';

type Field = keyof ManualValues;
const FIELDS: readonly Field[] = ['hr', 'sbp', 'dbp', 'map', 'temp', 'spo2', 'rr', 'gcs'];
type Raw = Record<Field, string>;
const EMPTY: Raw = { hr: '', sbp: '', dbp: '', map: '', temp: '', spo2: '', rr: '', gcs: '' };

export interface ManualVitalsProps {
  profile: Profile;
  rules: RulesView['manual_entry'];
  busy: boolean;
  onSave: (values: ManualValues) => void;
  onClose: () => void;
}

/** Manual vitals with optional GCS; validation runs before onSave, errors are localized per field. */
export function ManualVitals({ profile, rules, busy, onSave, onClose }: ManualVitalsProps) {
  const titleId = useId();
  const formId = useId();
  const [raw, setRaw] = useState<Raw>(EMPTY);
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const requiredFields: readonly Field[] = rules.required;

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const values: ManualValues = {};
    const issues: Partial<Record<Field, string>> = {};
    for (const key of FIELDS) {
      const text = raw[key].trim().replace(',', '.');
      if (!text) {
        if (requiredFields.includes(key)) issues[key] = copy.vitals.requiredError;
        continue;
      }
      const value = Number(text);
      const limit = rules.limits[key];
      if (!Number.isFinite(value)) issues[key] = copy.vitals.invalid;
      else if (value < limit.min || value > limit.max) issues[key] = copy.vitals.range(limit.min, limit.max);
      else if (key === 'gcs' && !Number.isInteger(value)) issues[key] = copy.vitals.integer;
      else values[key] = value;
    }
    const { sbp, dbp, map } = values;
    if (typeof sbp === 'number' && typeof dbp === 'number') {
      if (sbp <= dbp) issues.sbp = copy.vitals.sbpAboveDbp;
      else if (typeof map === 'number' && (map < dbp || map > sbp)) issues.map = copy.vitals.mapBetween;
    }
    setErrors(issues);
    if (Object.keys(issues).length > 0) return;
    onSave(values);
  };

  return (
    <form className="alarm-flows vitals-form" noValidate aria-labelledby={titleId} onSubmit={submit}>
      <h2 id={titleId}>{copy.vitals.heading}</h2>
      <p className="alarm-card-meta">{bedLabel(profile.bed)} · {profile.label}</p>
      <p className="vitals-hint">{copy.vitals.hint}</p>
      <div className="vitals-grid">
        {FIELDS.map(key => {
          const inputId = `${formId}-${key}`;
          const errorId = `${inputId}-error`;
          const required = requiredFields.includes(key);
          const error = errors[key];
          return (
            <div className="vitals-field" key={key}>
              <label htmlFor={inputId}>{copy.vitals.fields[key]}</label>
              <span className="vitals-need">{required ? copy.vitals.required : copy.vitals.optional}</span>
              <input
                id={inputId}
                type="text"
                inputMode={key === 'gcs' ? 'numeric' : 'decimal'}
                autoComplete="off"
                value={raw[key]}
                disabled={busy}
                required={required}
                aria-required={required}
                aria-invalid={error !== undefined}
                aria-describedby={error ? errorId : undefined}
                onChange={event => {
                  const next = event.target.value;
                  setRaw(prev => ({ ...prev, [key]: next }));
                  setErrors({});
                }}
              />
              {error && <span className="field-error" id={errorId} role="alert">{error}</span>}
            </div>
          );
        })}
      </div>
      <div className="alarm-actions">
        <button type="submit" className="alarm-btn primary" disabled={busy}>{copy.vitals.save}</button>
        <button type="button" className="alarm-btn" disabled={busy} onClick={onClose}>{copy.vitals.cancel}</button>
      </div>
    </form>
  );
}
