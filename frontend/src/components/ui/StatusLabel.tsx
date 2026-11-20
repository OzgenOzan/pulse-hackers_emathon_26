import { CircleCheck, CircleHelp, Eye, TriangleAlert } from 'lucide-react';
import { statusLabels } from '../../gui/clinical';
import type { RiskKey } from '../../types';

const ICONS = {
  kritik: TriangleAlert,
  yakin_takip: Eye,
  stabil: CircleCheck,
  siniflandirilmamis: CircleHelp,
} as const satisfies Record<RiskKey, unknown>;

/** Status is always icon + text; colour only reinforces it. */
export function StatusLabel({ status, sublabel }: { status: RiskKey; sublabel?: string }) {
  const Icon = ICONS[status];
  return (
    <span className="status-label" data-status={status}>
      <span className="status-pill" title={statusLabels[status]}>
        <Icon aria-hidden="true" size={18} strokeWidth={2.25} />
        {statusLabels[status]}
      </span>
      {sublabel && <span className="status-sub">{sublabel}</span>}
    </span>
  );
}
