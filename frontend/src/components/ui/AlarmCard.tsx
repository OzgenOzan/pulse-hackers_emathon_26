import { useId, type ReactNode } from 'react';
import { TriangleAlert } from 'lucide-react';
import '../../gui/alarms/alarms.css';
import { copy } from '../../gui/alarms/copy';

export interface AlarmCardProps {
  tone: 'critical' | 'neutral';
  title: string;
  meta?: string;
  badges?: ReactNode;
  children?: ReactNode;
  actions?: ReactNode;
}

/** Shared alarm card: title, meta line, badges, body and an action row. */
export function AlarmCard({ tone, title, meta, badges, children, actions }: AlarmCardProps) {
  const titleId = useId();
  return (
    <article className={`alarm-card alarm-card-${tone}`} aria-labelledby={titleId}>
      <header className="alarm-card-head">
        {tone === 'critical' && (
          <span className="alarm-card-icon" role="img" aria-label={copy.panel.criticalIcon} title={copy.panel.criticalIcon}>
            <TriangleAlert aria-hidden="true" size={24} />
          </span>
        )}
        <div className="alarm-card-title">
          <h3 id={titleId}>{title}</h3>
          {meta && <p className="alarm-card-meta">{meta}</p>}
        </div>
        {badges && <div className="alarm-card-badges">{badges}</div>}
      </header>
      {children && <div className="alarm-card-body">{children}</div>}
      {actions && <div className="alarm-card-actions">{actions}</div>}
    </article>
  );
}
