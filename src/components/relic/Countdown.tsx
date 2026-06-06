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
    <div className="chamber corner-bracket flex min-h-[112px] min-w-0 flex-col items-center justify-center rounded-sm px-3 py-4 sm:min-w-[120px] sm:px-8 sm:py-7">
      <span className="font-display text-4xl font-bold tabular-nums text-glow-gold text-accent sm:text-6xl">
        {v}
      </span>
      <span className="mt-2 font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground sm:text-xs sm:tracking-[0.35em]">
        {label}
      </span>
    </div>
  );
}

export function Countdown({ target }: { target: number }) {
  const { d, h, m, s } = useCountdown(target);
  return (
    <div className="grid w-full max-w-[24rem] grid-cols-2 gap-3 sm:flex sm:max-w-none sm:items-center sm:gap-4">
      <Cell label="Cycles" value={d} />
      <span className="hidden font-display text-4xl text-primary/40 sm:block">:</span>
      <Cell label="Hours" value={h} />
      <span className="hidden font-display text-4xl text-primary/40 sm:block">:</span>
      <Cell label="Minutes" value={m} />
      <span className="hidden font-display text-4xl text-primary/40 sm:block">:</span>
      <Cell label="Seconds" value={s} />
    </div>
  );
}
