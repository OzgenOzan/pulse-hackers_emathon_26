/** Sim-local HH:MM taken from the timestamp text; zones are never converted. */
export function fmtTime(iso: string | null | undefined): string {
  if (!iso) return '–';
  const match = /T(\d{2}:\d{2})/.exec(iso);
  return match ? match[1] : iso;
}
