import { useEffect, useRef } from "react";

export function HeroBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    const resize = () => {
      canvas.width = canvas.offsetWidth * dpr;
      canvas.height = canvas.offsetHeight * dpr;
    };
    resize();
    window.addEventListener("resize", resize);

    const particles = Array.from({ length: 90 }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      vx: (Math.random() - 0.5) * 0.2 * dpr,
      vy: (Math.random() - 0.5) * 0.2 * dpr,
      r: Math.random() * 1.8 * dpr + 0.4 * dpr,
      hue: Math.random() > 0.5 ? 88 : 295,
    }));

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      // connection lines
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0 || p.x > canvas.width) p.vx *= -1;
        if (p.y < 0 || p.y > canvas.height) p.vy *= -1;
        for (let j = i + 1; j < particles.length; j++) {
          const q = particles[j];
          const dx = p.x - q.x,
            dy = p.y - q.y;
          const d2 = dx * dx + dy * dy;
          const max = 140 * dpr;
          if (d2 < max * max) {
            const a = 1 - Math.sqrt(d2) / max;
            const lc = p.hue === 88 ? "0.82 0.16" : "0.62 0.24";
            ctx.strokeStyle = `oklch(${lc} ${p.hue} / ${a * 0.16})`;
            ctx.lineWidth = 0.6 * dpr;
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(q.x, q.y);
            ctx.stroke();
          }
        }
        const lc2 = p.hue === 88 ? "0.82 0.16" : "0.62 0.24";
        ctx.fillStyle = `oklch(${lc2} ${p.hue} / 0.8)`;
        ctx.shadowColor = `oklch(${lc2} ${p.hue})`;
        ctx.shadowBlur = 10 * dpr;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      }
      raf = requestAnimationFrame(draw);
    };
    draw();

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute inset-0 relic-grid opacity-60" />
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
      {/* concentric ritual rings */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
        {[280, 460, 680, 920, 1180].map((s, i) => (
          <div
            key={s}
            className="absolute rounded-full border border-primary/10 animate-drift"
            style={{
              width: s,
              height: s,
              left: -s / 2,
              top: -s / 2,
              animationDelay: `${i * 0.6}s`,
              animationDuration: `${10 + i * 2}s`,
            }}
          />
        ))}
      </div>
      {/* vignette */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_30%,oklch(0.08_0.01_260)_85%)]" />
      {/* scan beam */}
      <div className="absolute inset-x-0 h-32 bg-gradient-to-b from-transparent via-primary/10 to-transparent blur-2xl animate-scan" />
    </div>
  );
}
