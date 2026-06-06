import { useEffect, useState } from "react";

function useCountdown(target: number) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const update = () => setNow(Date.now());
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, []);

  if (now === null) {
    return { d: null, h: null, m: null, s: null };
  }

  const diff = Math.max(0, target - now);
  const d = Math.floor(diff / 86400000);
  const h = Math.floor((diff % 86400000) / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  const s = Math.floor((diff % 60000) / 1000);
  return { d, h, m, s };
}

function Cell({ label, value }: { label: string; value: number | null }) {
  const v = value === null ? "--" : value.toString().padStart(2, "0");
  return (
    <div className="chamber corner-bracket flex flex-col items-center justify-center px-4 py-5 sm:px-8 sm:py-7 rounded-sm min-w-[88px] sm:min-w-[120px]">
      <span className="font-display text-4xl sm:text-6xl font-bold tabular-nums text-glow-gold text-accent">
        {v}
      </span>
      <span className="mt-2 text-[10px] sm:text-xs uppercase tracking-[0.35em] text-muted-foreground font-mono">
        {label}
      </span>
    </div>
  );
}

export function Countdown({ target }: { target: number }) {
  const { d, h, m, s } = useCountdown(target);
  return (
    <div className="flex items-center gap-2 sm:gap-4">
      <Cell label="Cycles" value={d} />
      <span className="text-primary/40 font-display text-2xl sm:text-4xl">:</span>
      <Cell label="Hours" value={h} />
      <span className="text-primary/40 font-display text-2xl sm:text-4xl">:</span>
      <Cell label="Minutes" value={m} />
      <span className="text-primary/40 font-display text-2xl sm:text-4xl">:</span>
      <Cell label="Seconds" value={s} />
    </div>
  );
}
