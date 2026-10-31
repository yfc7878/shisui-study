export function BrandMark({ size = 40 }) {
  return (
    <span className="brand-mark" style={{ width: size, height: size, borderRadius: Math.round(size * 0.32) }}>
      <svg width={size * 0.62} height={size * 0.62} viewBox="0 0 64 64" aria-hidden="true">
        <path d="M18 43c7-1 12-5 15-12 2-5 5-8 10-10-1 8-4 14-9 18-4 3-9 4-16 4Z" fill="currentColor" opacity="0.92" />
        <path d="M22 47c1-9 5-16 12-21" stroke="var(--gold)" strokeWidth="2.4" strokeLinecap="round" fill="none" />
        <circle cx="43" cy="20" r="3" fill="var(--accent)" />
      </svg>
    </span>
  );
}
