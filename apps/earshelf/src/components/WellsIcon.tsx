/** The Wells icon, drawn exactly as in Tapestry (a drop of water), so both apps use the same mark. */
export function WellsIcon({ size = 24, strokeWidth = 1.75, className }: { size?: number | string; strokeWidth?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>
      <path d="M12 3c4 5 6 8 6 11a6 6 0 0 1-12 0c0-3 2-6 6-11z" />
    </svg>
  );
}
