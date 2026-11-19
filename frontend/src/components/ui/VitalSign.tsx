import { Eye, TriangleAlert } from 'lucide-react';
import { describeState, type VitalState } from '../../gui/patients/model';
import type { VitalFlag } from '../../types';

/** One vital. Only a fresh value is shown large; stale or missing fields are small text with their own label. */
export function VitalSign({
  label,
  unit,
  state,
  flags,
  sub,
}: {
  label: string;
  unit: string;
  state: VitalState;
  flags: VitalFlag[];
  sub?: string;
}) {
  return (
    <div className="vital" data-state={state.kind}>
      <span className="vital-label">{label}</span>
      {state.kind === 'value' ? (
        <span className="vital-reading">
          <strong className="vital-value">{state.text}</strong>
          <span className="vital-unit">{unit}</span>
        </span>
      ) : (
        <span className="vital-gap">{describeState(state)}</span>
      )}
      {flags.map(flag => (
        <span key={flag.note} className={`vital-flag flag-${flag.level}`}>
          {flag.level === 'kritik'
            ? <TriangleAlert aria-hidden="true" size={14} />
            : <Eye aria-hidden="true" size={14} />}
          {flag.note}
        </span>
      ))}
      {sub && <span className="vital-sub">{sub}</span>}
    </div>
  );
}
