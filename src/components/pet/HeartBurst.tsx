import { useEffect, useState } from 'react';

interface HeartParticle {
  id: number;
  x: number;          // px offset from origin
  rotate: number;     // final rotation
  emoji: string;
}

interface Burst {
  id: number;
  x: number;
  y: number;
  particles: HeartParticle[];
}

interface Props {
  /** When `trigger` increments, a fresh burst is added. */
  trigger: number;
  /** Origin point (px relative to container). */
  origin: { x: number; y: number } | null;
}

const HEART_EMOJIS = ['❤️', '💖', '💕', '💞', '💗'];

export function HeartBurst({ trigger, origin }: Props) {
  const [bursts, setBursts] = useState<Burst[]>([]);

  useEffect(() => {
    if (trigger === 0 || !origin) return;
    const id = trigger;
    const count = 5 + Math.floor(Math.random() * 3);
    const particles: HeartParticle[] = [];
    for (let i = 0; i < count; i++) {
      particles.push({
        id: i,
        x: (Math.random() - 0.5) * 56,
        rotate: (Math.random() - 0.5) * 60,
        emoji: HEART_EMOJIS[Math.floor(Math.random() * HEART_EMOJIS.length)],
      });
    }
    setBursts((prev) => [...prev, { id, x: origin.x, y: origin.y, particles }]);
    const cleanup = setTimeout(() => {
      setBursts((prev) => prev.filter((b) => b.id !== id));
    }, 1000);
    return () => clearTimeout(cleanup);
  }, [trigger, origin]);

  return (
    <>
      {bursts.map((b) => (
        <div key={b.id} className="absolute pointer-events-none z-30"
          style={{ left: b.x, top: b.y, transform: 'translate(-50%, -50%)' }}
          aria-hidden>
          {b.particles.map((p) => (
            <span
              key={p.id}
              className="heart-particle absolute text-xl"
              style={{
                left: 0, top: 0,
                ['--hx' as string]: `${p.x}px`,
                ['--hr' as string]: `${p.rotate}deg`,
                animationDelay: `${p.id * 30}ms`,
              }}
            >
              {p.emoji}
            </span>
          ))}
        </div>
      ))}
    </>
  );
}
