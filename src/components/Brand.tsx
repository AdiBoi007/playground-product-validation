export default function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <span
      className={`brand ${compact ? "brand-compact" : ""}`}
      title="stop guessing."
    >
      <span className="brand-symbol" />
      {!compact && (
        <span>
          playground<span className="brand-period">.</span>
        </span>
      )}
    </span>
  );
}
