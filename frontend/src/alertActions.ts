import type { Level } from './types';

export interface ActionSpec {
  action: string;
  /** Present when the action needs a reason; the reason is the second tap. */
  reasons?: readonly string[];
}

/** Action matrix from the design spec §7; the server rejects anything outside it. */
export const ACTIONS: Record<Level, readonly ActionSpec[]> = {
  RED: [
    { action: 'reassessing' },
    { action: 'move_to_red_zone' },
    { action: 'start_intervention' },
    { action: 'expected_for_patient', reasons: ['chronic_baseline', 'artifact', 'already_managed'] },
  ],
  YELLOW: [
    { action: 'monitor_reconnected' },
    { action: 'vitals_entered' },
    { action: 'not_at_bed', reasons: ['left_bed', 'in_procedure', 'other'] },
  ],
  GREEN: [
    { action: 'discharge_decided' },
    { action: 'prescription_written' },
    { action: 'wait_justified', reasons: ['consult', 'imaging', 'other'] },
  ],
};
