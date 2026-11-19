import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import './StatCard.css';

export type StatTone = 'neutral' | 'kritik' | 'yakin-takip' | 'stabil' | 'unclassified';

interface StatCardProps {
  testId: string;
  label: string;
  count: ReactNode;
  icon: LucideIcon;
  tone: StatTone;
  active: boolean;
  onSelect: () => void;
}

/** One overview count. Selecting it toggles the matching list filter; `active` mirrors `aria-pressed`. */
export function StatCard({ testId, label, count, icon: Icon, tone, active, onSelect }: StatCardProps) {
  return (
    <button
      type="button"
      className={`stat-card stat-${tone}`}
      aria-pressed={active}
      aria-label={label}
      title={label}
      data-testid={testId}
      onClick={onSelect}
    >
      <span className="stat-head">
        <span className="stat-label">{label}</span>
      </span>
      <span className="stat-count">
        {count}
        <Icon size={20} strokeWidth={2} aria-hidden="true" focusable="false" />
      </span>
    </button>
  );
}
