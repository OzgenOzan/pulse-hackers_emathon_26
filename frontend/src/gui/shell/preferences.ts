const SIDEBAR_KEY = 'sahin-gui.sidebar';

/** The user's last sidebar choice, or null when they have not chosen yet. Storage may be unavailable. */
export function readSidebarOpen(): boolean | null {
  try {
    const value = localStorage.getItem(SIDEBAR_KEY);
    if (value === 'open') return true;
    if (value === 'closed') return false;
    return null;
  } catch {
    return null;
  }
}

export function saveSidebarOpen(open: boolean): void {
  try {
    localStorage.setItem(SIDEBAR_KEY, open ? 'open' : 'closed');
  } catch {
    // Storage may be unavailable (private mode); the toggle still works for this session.
  }
}
