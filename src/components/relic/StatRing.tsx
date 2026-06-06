const TICK_MARKS = Array.from({ length: 36 }, (_, i) => {
  const a = (i / 36) * Math.PI * 2;
  const point = (radius: number, fn: typeof Math.cos | typeof Math.sin) =>
    Number((64 + fn(a) * radius).toFixed(4));

  return {
    x1: point(44, Math.cos),
    y1: point(44, Math.sin),
    x2: point(48, Math.cos),
    y2: point(48, Math.sin),
  };
});

export function StatRing({
  value,
  max = 100,
  label,
  sub,
  color = "primary",
}: {
  value: number;
  max?: number;
  label: string;
  sub?: string;
  color?: "primary" | "secondary" | "accent" | "destructive";
}) {
  const safeMax = Math.max(max, 1);
  const pct = Math.min(1, Math.max(0, value / safeMax));
  const r = 54;
  const c = 2 * Math.PI * r;
  const colorVar = {
    primary: "var(--relic-cyan)",
    secondary: "var(--relic-violet)",
    accent: "var(--relic-gold)",
    destructive: "var(--relic-crimson)",
  }[color];

  return (
    <div className="chamber rounded-sm flex min-h-[260px] flex-col items-center justify-between p-5 text-center">
      <div className="relative shrink-0">
        <svg width="128" height="128" viewBox="0 0 128 128" className="-rotate-90">
          <circle
            cx="64"
            cy="64"
            r={r}
            stroke="oklch(0.72 0.10 215 / 0.1)"
            strokeWidth="2"
            fill="none"
          />
          <circle
            cx="64"
            cy="64"
            r={r}
            stroke={colorVar}
            strokeWidth="2.5"
            fill="none"
            strokeDasharray={c}
            strokeDashoffset={c * (1 - pct)}
            strokeLinecap="round"
            style={{
              filter: `drop-shadow(0 0 8px ${colorVar})`,
              transition: "stroke-dashoffset 1s ease",
            }}
          />
          {/* tick marks */}
          {TICK_MARKS.map((tick, i) => {
            return (
              <line
                key={i}
                x1={tick.x1}
                y1={tick.y1}
                x2={tick.x2}
                y2={tick.y2}
                stroke="oklch(0.72 0.10 215 / 0.12)"
                strokeWidth="1"
              />
            );
          })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span
            className="max-w-[5.5rem] truncate font-display text-3xl tabular-nums leading-none"
            style={{ color: colorVar }}
          >
            {value}
          </span>
          <span className="mt-1 max-w-[5.5rem] truncate font-mono text-[9px] uppercase tracking-[0.18em] text-muted-foreground">
            {sub}
          </span>
        </div>
      </div>

      <div className="mt-5 w-full border-t border-primary/10 pt-4">
        <div className="font-display text-sm uppercase tracking-[0.2em] text-foreground">
          {label}
        </div>
        <div className="mt-2 truncate font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
          SYS / LIVE / ENCRYPTED
        </div>
      </div>
    </div>
  );
}
