import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import type { PetAnimal } from '@/types';
import { petImage } from './petSpecies';

export type PetMood = 'idle' | 'eating' | 'drinking' | 'happy' | 'sad' | 'sleeping';
export type PetStage = 'baby' | 'child' | 'adult';

export interface PetCanvasHandle {
  /** Trigger a one-shot squash+bounce reaction animation. */
  reactSquash: () => void;
  /** Trigger an "eating" squish. */
  reactSquish: () => void;
}

interface Props {
  animal: PetAnimal;
  mood: PetMood;
  size?: number;
  /** Pet xp; controls growth stage. */
  xp?: number;
  /** When true, the pet is interactive (click-to-pat). */
  interactive?: boolean;
  /** Called when the SVG itself is clicked. */
  onPetClick?: (e: React.MouseEvent<HTMLDivElement>) => void;
  /** Triggers an "attention" idle behavior 1-shot key. */
  attentionTrigger?: number;
  /** Soft floor shadow shown beneath. Defaults to true. */
  showShadow?: boolean;
  /** Pause animations (e.g. when page is hidden). */
  paused?: boolean;
}

export function xpToStage(xp: number): PetStage {
  // Map XP → level → stage:
  //   levels 1-3 (xp 0-299)  -> baby
  //   levels 4-7 (xp 300-699) -> child
  //   levels 8+  (xp 700+)   -> adult
  // We base it on level so it lines up with the existing UI's level meter.
  const level = Math.floor(xp / 100) + 1;
  if (level <= 3) return 'baby';
  if (level <= 7) return 'child';
  return 'adult';
}

function stageScale(stage: PetStage): number {
  return stage === 'baby' ? 0.85 : stage === 'child' ? 1.0 : 1.15;
}

export const PetCanvas = forwardRef<PetCanvasHandle, Props>(function PetCanvas(
  {
    animal,
    mood,
    size = 160,
    xp = 0,
    interactive = false,
    onPetClick,
    attentionTrigger = 0,
    showShadow = true,
    paused = false,
  },
  ref,
) {
  const figureRef = useRef<HTMLDivElement>(null);
  const stage = xpToStage(xp);
  const scale = stageScale(stage);

  // ---- Imperative reactions (squash/squish) ----

  const reactSquash = useCallback(() => {
    const el = figureRef.current;
    if (!el) return;
    el.classList.remove('pet-squash');
    void el.getBoundingClientRect();
    el.classList.add('pet-squash');
    window.setTimeout(() => el.classList.remove('pet-squash'), 700);
  }, []);

  const reactSquish = useCallback(() => {
    const el = figureRef.current;
    if (!el) return;
    el.classList.remove('pet-squish');
    void el.getBoundingClientRect();
    el.classList.add('pet-squish');
    window.setTimeout(() => el.classList.remove('pet-squish'), 800);
  }, []);

  useImperativeHandle(ref, () => ({ reactSquash, reactSquish }), [reactSquash, reactSquish]);

  // ---- Attention behavior on cue ----

  const [attentionAnim, setAttentionAnim] = useState<'yawn' | 'look-around' | null>(null);
  useEffect(() => {
    if (attentionTrigger === 0) return;
    const pick = Math.random();
    const next = pick < 0.5 ? 'yawn' : 'look-around';
    setAttentionAnim(next);
    const t = window.setTimeout(() => setAttentionAnim(null), 2000);
    return () => clearTimeout(t);
  }, [attentionTrigger]);

  // ---- Mood class — drives the nested bob/breathe motion via CSS ----
  // The wrapper itself no longer animates continuously; it only hosts one-shot
  // reactions (squash/squish/attention). Continuous, organic motion lives in the
  // nested .pet-bob / .pet-breathe-l groups inside the SVG.
  const moodCls = `mood-${mood}`;

  const attentionCls =
    attentionAnim === 'yawn'
      ? 'pet-yawn'
      : attentionAnim === 'look-around'
        ? 'pet-look-around'
        : '';

  // ---- Render ----

  const cx = 100,
    cy = 95,
    r = 60;

  // Illustrated (Fluent) pets sit slightly inset so the floor shadow + bob read.
  const PI_X = 32,
    PI_Y = 22,
    PI_W = 136,
    PI_H = 136;

  return (
    <div
      style={{
        width: size,
        height: size,
        display: 'inline-block',
        lineHeight: 0,
        position: 'relative',
      }}
      className={paused ? 'pet-paused' : undefined}
    >
      {/* Floor shadow — sits behind the pet, scales subtly on bounce */}
      {showShadow && (
        <svg
          viewBox="0 0 200 30"
          width={size}
          height={size * 0.18}
          style={{
            position: 'absolute',
            bottom: -size * 0.02,
            left: 0,
            zIndex: 0,
            overflow: 'visible',
          }}
          aria-hidden
        >
          <ellipse
            cx={100}
            cy={15}
            rx={64 * scale}
            ry={8}
            fill="#000"
            className={mood === 'happy' ? 'floor-bounce' : 'floor-still'}
          />
        </svg>
      )}

      {/* Figure wrapper — handles squash/squish/attention one-shots */}
      <div
        ref={figureRef}
        className={[moodCls, attentionCls].filter(Boolean).join(' ')}
        style={{
          position: 'relative',
          zIndex: 1,
          width: size,
          height: size,
          cursor: interactive && onPetClick ? 'pointer' : undefined,
          transition: 'transform 320ms cubic-bezier(0.34, 1.56, 0.64, 1)',
        }}
        onClick={onPetClick}
      >
        <svg viewBox="0 0 200 200" width={size} height={size} style={{ overflow: 'visible' }}>
          {/* Stage scaling applied to the whole pet */}
          <g
            style={{
              transformBox: 'fill-box',
              transformOrigin: '100px 160px',
              transform: `scale(${scale})`,
              transition: 'transform 600ms cubic-bezier(0.34, 1.56, 0.64, 1)',
            }}
          >
            {/* Nested motion layers: outer float/sway + inner breathe, on
                independent phases so the pet reads as alive. */}
            <g className="pet-bob" style={{ transformBox: 'view-box', transformOrigin: '100px 172px' }}>
              <g
                className="pet-breathe-l"
                style={{ transformBox: 'view-box', transformOrigin: '100px 172px' }}
              >
                {/* Illustrated pet — bundled Fluent 3D artwork. The bob/breathe
                    wrapper above brings it to life; mood reads via motion + the
                    overlays below. */}
                <image
                  href={petImage(animal)}
                  x={PI_X}
                  y={PI_Y}
                  width={PI_W}
                  height={PI_H}
                  preserveAspectRatio="xMidYMid meet"
                  style={{ pointerEvents: 'none' }}
                />

                {/* Mood overlays */}
                {mood === 'eating' && (
                  <text x={cx + r * 0.85} y={cy + r * 0.25} fontSize={r * 0.4} textAnchor="middle">
                    🍎
                  </text>
                )}
                {mood === 'drinking' && (
                  <text x={cx + r * 0.85} y={cy + r * 0.25} fontSize={r * 0.4} textAnchor="middle">
                    💧
                  </text>
                )}
                {mood === 'happy' && (
                  <>
                    <text
                      x={cx - r * 0.9}
                      y={cy - r * 0.6}
                      fontSize={r * 0.3}
                      className="pet-sparkle"
                      style={{ animationDelay: '0s' }}
                    >
                      ⭐
                    </text>
                    <text
                      x={cx + r * 0.85}
                      y={cy - r * 0.7}
                      fontSize={r * 0.25}
                      className="pet-sparkle"
                      style={{ animationDelay: '0.4s' }}
                    >
                      ⭐
                    </text>
                  </>
                )}
                {attentionAnim === 'yawn' && (
                  <text x={cx + r * 0.7} y={cy - r * 0.6} fontSize={r * 0.3}>
                    💤
                  </text>
                )}
              </g>
            </g>
          </g>
        </svg>
      </div>
    </div>
  );
});
