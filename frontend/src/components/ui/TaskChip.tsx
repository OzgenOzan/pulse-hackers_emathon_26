import type { ReactNode } from 'react';
import { ListChecks } from 'lucide-react';

/** Neutral chip for a role task or a data gap; never coloured like a risk status. */
export function TaskChip({ children }: { children: ReactNode }) {
  return (
    <span className="task-chip">
      <ListChecks aria-hidden="true" size={14} />
      {children}
    </span>
  );
}
