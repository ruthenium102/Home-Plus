import { useCallback, useEffect, useRef, useState } from 'react';

interface Treat {
  id: number;
  x: number;          // % of stage width
  duration: number;   // seconds
  emoji: string;
  spin: number;       // final rotation
  caught: boolean;
}

interface Props {
  /** Awarded XP per catch. */
  xpPerCatch?: number;
  /** Called with the total XP earned when the game ends. */
  onEnd?: (xpEarned: number) => void;
  /** Pause hooks (e.g. page hidden). */
  paused?: boolean;
}

const TREAT_EMOJIS = ['🍖', '🥕', '🍎', '🥩', '🍪', '🥨', '🍇'];

/**
 * "Catch the falling treats" inline mini-game.
 * - Press Start, treats fall for ~30s.
 * - Mouse-over (or tap) a treat to catch it.
 * - Each catch awards `xpPerCatch` XP and pops a counter.
 */
export function MiniGame({ xpPerCatch = 2, onEnd, paused = false }: Props) {
  const [running, setRunning] = useState(false);
  const [treats, setTreats] = useState<Treat[]>([]);
  const [score, setScore] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(30);
  const nextId = useRef(0);
  const stageRef = useRef<HTMLDivElement>(null);
  const startedRef = useRef(false);

  const stop = useCallback(() => {
    if (!startedRef.current) return;
    startedRef.current = false;
    setRunning(false);
    onEnd?.(score);
  }, [onEnd, score]);

  // Tick countdown + spawn treats
  useEffect(() => {
    if (!running || paused) return;
    const spawnInterval = window.setInterval(() => {
      const emoji = TREAT_EMOJIS[Math.floor(Math.random() * TREAT_EMOJIS.length)];
      const id = nextId.current++;
      const treat: Treat = {
        id,
        x: 6 + Math.random() * 88,
        duration: 2.4 + Math.random() * 1.4,
        emoji,
        spin: (Math.random() - 0.5) * 360,
        caught: false,
      };
      setTreats((prev) => [...prev, treat]);
      // Remove the treat after it falls past the stage
      window.setTimeout(() => {
        setTreats((prev) => prev.filter((t) => t.id !== id));
      }, treat.duration * 1000 + 200);
    }, 520);

    const tick = window.setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          window.clearInterval(spawnInterval);
          window.clearInterval(tick);
          // Defer stop to next tick so the final score is fresh
          window.setTimeout(() => stop(), 0);
          return 0;
        }
        return s - 1;
      });
    }, 1000);

    return () => {
      window.clearInterval(spawnInterval);
      window.clearInterval(tick);
    };
  }, [running, paused, stop]);

  const start = () => {
    if (running) return;
    setScore(0);
    setSecondsLeft(30);
    setTreats([]);
    startedRef.current = true;
    setRunning(true);
  };

  const handleCatch = (id: number) => {
    setTreats((prev) =>
      prev.map((t) => (t.id === id && !t.caught ? { ...t, caught: true } : t))
    );
    setScore((s) => s + 1);
    // Cleanup the caught treat after its pop animation
    window.setTimeout(() => {
      setTreats((prev) => prev.filter((t) => t.id !== id));
    }, 260);
  };

  return (
    <div className="card p-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-sm font-semibold text-text">Treat Catcher</h3>
          <p className="text-xs text-text-muted">
            Hover/tap falling treats to catch them — each one earns {xpPerCatch} XP.
          </p>
        </div>
        <div className="flex items-center gap-3 text-right">
          <div>
            <div className="text-xs text-text-faint">Caught</div>
            <div className="text-lg font-bold text-text">{score}</div>
          </div>
          <div>
            <div className="text-xs text-text-faint">Time</div>
            <div className="text-lg font-bold text-text">{secondsLeft}s</div>
          </div>
        </div>
      </div>

      <div ref={stageRef} className="minigame-stage">
        {treats.map((t) => (
          <div
            key={t.id}
            className={t.caught ? 'treat-caught' : 'treat-fall'}
            style={{
              position: 'absolute',
              top: 0,
              left: `${t.x}%`,
              fontSize: 32,
              ['--fall-duration' as string]: `${t.duration}s`,
              ['--fall-distance' as string]: '300px',
              ['--spin' as string]: `${t.spin}deg`,
              pointerEvents: t.caught ? 'none' : 'auto',
              cursor: 'pointer',
              userSelect: 'none',
              touchAction: 'none',
            }}
            onMouseEnter={() => handleCatch(t.id)}
            onTouchStart={(e) => { e.preventDefault(); handleCatch(t.id); }}
            aria-label="Falling treat"
          >
            {t.emoji}
          </div>
        ))}

        {!running && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center space-y-3">
              {score > 0 ? (
                <>
                  <div className="text-3xl">🎉</div>
                  <p className="text-text font-medium">
                    You caught <span className="font-bold">{score}</span> treats
                    {' '}and earned <span className="font-bold">{score * xpPerCatch}</span> XP!
                  </p>
                </>
              ) : (
                <div className="text-3xl">🍖</div>
              )}
              <button onClick={start} className="btn-primary px-5 py-2 text-base rounded-xl">
                {score > 0 ? 'Play again' : 'Start game'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
