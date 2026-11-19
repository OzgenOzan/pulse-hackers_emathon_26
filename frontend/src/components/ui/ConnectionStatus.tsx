import { Wifi, WifiLow, WifiOff } from 'lucide-react';
import { shellCopy } from '../../gui/shell/copy';
import './ConnectionStatus.css';

export type ConnectionState = 'connected' | 'weak' | 'offline';

const icons = { connected: Wifi, weak: WifiLow, offline: WifiOff } satisfies Record<ConnectionState, typeof Wifi>;

/** Connection state in words with a grayscale icon; never colour-only. */
export function ConnectionStatus({ state }: { state: ConnectionState }) {
  const Icon = icons[state];
  return (
    <span className={`connection connection-${state}`} title={shellCopy.connectionTitle[state]} data-testid="connection-status">
      <Icon size={18} strokeWidth={2} aria-hidden="true" focusable="false" />
      <span>{shellCopy.connection[state]}</span>
    </span>
  );
}
