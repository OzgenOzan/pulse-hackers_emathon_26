/** Parses a clinician-typed decimal; accepts a decimal comma and surrounding spaces. Returns undefined for anything else. */
export function parseDecimal(raw: string): number | undefined {
  const text = raw.trim().replace(',', '.');
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(text)) return undefined;
  const value = Number(text);
  return Number.isFinite(value) ? value : undefined;
}
