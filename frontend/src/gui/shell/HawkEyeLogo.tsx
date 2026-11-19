/** Original monochrome mark: a hawk's eye whose pupil carries an ECG trace. Uses currentColor only. */
export function HawkEyeLogo({ label }: { label: string }) {
  return (
    <svg className="hawk-logo" viewBox="0 0 48 48" role="img" aria-label={label} focusable="false">
      <path d="M3 24 C10 12 38 12 45 24 C38 36 10 36 3 24 Z" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round" />
      <circle cx="24" cy="24" r="8" fill="none" stroke="currentColor" strokeWidth="2.5" />
      <path d="M11 24 H18 L20.5 20 L23 28 L25.5 22 L27 24 H37" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
