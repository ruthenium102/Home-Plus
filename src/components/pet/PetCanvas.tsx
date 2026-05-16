import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { CustomPetEyes, PetAnimal } from '@/types';
import { PetEyes, type PetEyesHandle } from './PetEyes';
import { AccessoryLayer } from './AccessoryLayer';

export type PetMood = 'idle' | 'eating' | 'drinking' | 'happy' | 'sad' | 'sleeping';
export type PetStage = 'baby' | 'child' | 'adult';

export interface PetCanvasHandle {
  /** Trigger a one-shot squash+bounce reaction animation. */
  reactSquash: () => void;
  /** Trigger an "eating" squish. */
  reactSquish: () => void;
  /** Force a single blink. */
  blink: () => void;
}

interface Props {
  animal: PetAnimal;
  mood: PetMood;
  size?: number;
  /** Pet xp; controls growth stage and tail wag speed. */
  xp?: number;
  /** Currently-worn accessory ids. */
  accessories?: string[];
  /** When true, the pet is interactive (eye tracking, click-to-pat). */
  interactive?: boolean;
  /** Called when the SVG itself is clicked. */
  onPetClick?: (e: React.MouseEvent<HTMLDivElement>) => void;
  /** Called whenever a drag enters / leaves / drops on the pet drop zone. */
  onTreatDrop?: () => void;
  onTreatDragOver?: (over: boolean) => void;
  /** Triggers an "attention" idle behavior 1-shot key. */
  attentionTrigger?: number;
  /** Soft floor shadow shown beneath. Defaults to true. */
  showShadow?: boolean;
  /** Pause animations (e.g. when page is hidden). */
  paused?: boolean;
  /** Processed drawing for custom pets (data: URL). */
  customImage?: string | null;
  /** Eye positions (0..1 of the rendered image) for custom pets. */
  customEyes?: CustomPetEyes | null;
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
    accessories = [],
    interactive = false,
    onPetClick,
    onTreatDrop,
    onTreatDragOver,
    attentionTrigger = 0,
    showShadow = true,
    paused = false,
    customImage = null,
    customEyes = null,
  },
  ref,
) {
  const rootRef = useRef<HTMLDivElement>(null);
  const figureRef = useRef<HTMLDivElement>(null);
  const eyesRef = useRef<PetEyesHandle>(null);
  const stage = xpToStage(xp);
  const scale = stageScale(stage);

  // ---- Imperative reactions (squash/squish/blink) ----

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

  useImperativeHandle(ref, () => ({
    reactSquash,
    reactSquish,
    blink: () => eyesRef.current?.blink(),
  }), [reactSquash, reactSquish]);

  // ---- Cursor tracking (window mousemove → imperatively update iris cx/cy) ----

  useEffect(() => {
    if (!interactive || paused) return;
    let raf = 0;
    let lastX = 0;
    let lastY = 0;
    let pending = false;
    const flush = () => {
      pending = false;
      eyesRef.current?.lookAt(lastX, lastY);
    };
    const onMove = (e: MouseEvent) => {
      lastX = e.clientX;
      lastY = e.clientY;
      if (!pending) {
        pending = true;
        raf = requestAnimationFrame(flush);
      }
    };
    window.addEventListener('mousemove', onMove);
    return () => {
      window.removeEventListener('mousemove', onMove);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [interactive, paused]);

  // ---- Random blink loop (every 3-5s) ----

  useEffect(() => {
    if (paused || mood === 'sleeping' || mood === 'sad') return;
    let cancelled = false;
    const schedule = () => {
      const delay = 3000 + Math.random() * 2000;
      window.setTimeout(() => {
        if (cancelled) return;
        eyesRef.current?.blink();
        schedule();
      }, delay);
    };
    schedule();
    return () => { cancelled = true; };
  }, [paused, mood]);

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

  // ---- Compute mood class for breathe/bounce ----

  const moodCls = useMemo(() => {
    if (mood === 'idle') return 'pet-idle';
    if (mood === 'happy') return 'pet-happy';
    if (mood === 'eating') return 'pet-eating';
    if (mood === 'drinking') return 'pet-drinking';
    if (mood === 'sleeping') return 'pet-sleeping';
    return 'pet-sad';
  }, [mood]);

  // Tail wag speed scales with mood
  const tailWagCls =
    mood === 'happy' ? 'tail-wag-fast' :
    mood === 'sad' || mood === 'sleeping' ? '' :
    'tail-wag-slow';

  const attentionCls =
    attentionAnim === 'yawn' ? 'pet-yawn' :
    attentionAnim === 'look-around' ? 'pet-look-around' :
    '';

  // ---- Drop-zone handlers ----

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    onTreatDragOver?.(true);
  };
  const handleDragLeave = () => {
    onTreatDragOver?.(false);
  };
  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    onTreatDragOver?.(false);
    onTreatDrop?.();
  };

  // ---- Render ----

  const cx = 100, cy = 95, r = 60;

  const isCustom = animal === 'custom';
  // Custom-pet image fills (mostly) the 200x200 viewBox.
  const CI_X = 5, CI_Y = 5, CI_W = 190, CI_H = 190;
  const customEyeLayout =
    isCustom && customEyes
      ? {
          leftCx: CI_X + customEyes.left.x * CI_W,
          rightCx: CI_X + customEyes.right.x * CI_W,
          eyeY: CI_Y + ((customEyes.left.y + customEyes.right.y) / 2) * CI_H,
          eyeR: Math.max(4, customEyes.radius * CI_W),
        }
      : undefined;

  return (
    <div
      ref={rootRef}
      style={{ width: size, height: size, display: 'inline-block', lineHeight: 0, position: 'relative' }}
      className={paused ? 'pet-paused' : undefined}
    >
      {/* Floor shadow — sits behind the pet, scales subtly on bounce */}
      {showShadow && (
        <svg
          viewBox="0 0 200 30"
          width={size}
          height={size * 0.18}
          style={{ position: 'absolute', bottom: -size * 0.02, left: 0, zIndex: 0, overflow: 'visible' }}
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

      {/* Figure wrapper — handles breathe/bounce/squash/squish/attention */}
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
        onDragOver={interactive ? handleDragOver : undefined}
        onDragLeave={interactive ? handleDragLeave : undefined}
        onDrop={interactive ? handleDrop : undefined}
      >
        <svg
          viewBox="0 0 200 200"
          width={size}
          height={size}
          style={{ overflow: 'visible' }}
        >
          {/* Gradients & filters — shared by all animals */}
          <defs>
            <radialGradient id="head-grad" cx="35%" cy="30%" r="75%">
              <stop offset="0%" stopColor="#fff8f0" />
              <stop offset="60%" stopColor="#f5e9d8" />
              <stop offset="100%" stopColor="#dfc9a6" />
            </radialGradient>
            <radialGradient id="body-grad" cx="35%" cy="20%" r="80%">
              <stop offset="0%" stopColor="#f9e4c8" />
              <stop offset="65%" stopColor="#e8cfa6" />
              <stop offset="100%" stopColor="#c8a575" />
            </radialGradient>
            <radialGradient id="ear-grad" cx="40%" cy="30%" r="80%">
              <stop offset="0%" stopColor="#fff8f0" />
              <stop offset="100%" stopColor="#d8bf94" />
            </radialGradient>
            <radialGradient id="green-grad" cx="35%" cy="20%" r="80%">
              <stop offset="0%" stopColor="#cce8c0" />
              <stop offset="100%" stopColor="#7fa874" />
            </radialGradient>
            <radialGradient id="pink-grad" cx="40%" cy="25%" r="80%">
              <stop offset="0%" stopColor="#ffe0ed" />
              <stop offset="100%" stopColor="#e88fa0" />
            </radialGradient>
          </defs>

          {/* Stage scaling applied to the whole pet */}
          <g style={{
            transformBox: 'fill-box',
            transformOrigin: '100px 160px',
            transform: `scale(${scale})`,
            transition: 'transform 600ms cubic-bezier(0.34, 1.56, 0.64, 1)',
          }}>
            {isCustom ? (
              customImage ? (
                <image
                  href={customImage}
                  x={CI_X}
                  y={CI_Y}
                  width={CI_W}
                  height={CI_H}
                  preserveAspectRatio="xMidYMid meet"
                />
              ) : (
                // Empty-state for a custom pet without a drawing yet — a soft
                // paper rectangle with a pencil glyph so the slot isn't blank.
                <g>
                  <rect x={CI_X} y={CI_Y} width={CI_W} height={CI_H} rx={20} fill="#f5e9d8" />
                  <text
                    x={100}
                    y={115}
                    fontSize="80"
                    textAnchor="middle"
                    style={{ pointerEvents: 'none' }}
                  >
                    ✏️
                  </text>
                </g>
              )
            ) : (
              <AnimalLayers animal={animal} mood={mood} tailWagCls={tailWagCls} />
            )}

            {/* Eyes — independent layer with iris tracking. For custom pets we
                only draw the eye overlay when the user has placed eyes. */}
            {(!isCustom || customEyeLayout) && (
              <PetEyes
                ref={eyesRef}
                cx={cx} cy={cy} r={r}
                mood={mood}
                rootRef={rootRef}
                layout={customEyeLayout}
              />
            )}

            {/* Standard face decoration — skipped for custom pets, since the
                drawing has its own mouth/cheeks/nose. */}
            {!isCustom && (
              <>
                <ellipse cx={cx - r * 0.42} cy={cy + r * 0.12} rx={r * 0.16} ry={r * 0.1} fill="#ffb3c1" opacity="0.55" />
                <ellipse cx={cx + r * 0.42} cy={cy + r * 0.12} rx={r * 0.16} ry={r * 0.1} fill="#ffb3c1" opacity="0.55" />
                <ellipse cx={cx} cy={cy + r * 0.04} rx={r * 0.05} ry={r * 0.034} fill="#e88fa0" />
                <Mouth mood={mood} cx={cx} cy={cy} r={r} />
              </>
            )}

            {/* Accessory layers — skipped for custom pets, which carry their
                own drawn-on details. */}
            {!isCustom && (
              <AccessoryLayer accessories={accessories} cx={cx} cy={cy} r={r} animal={animal} />
            )}

            {/* Mood overlays */}
            {mood === 'eating' && (
              <text x={cx + r * 0.85} y={cy + r * 0.25} fontSize={r * 0.4} textAnchor="middle">🍎</text>
            )}
            {mood === 'drinking' && (
              <text x={cx + r * 0.85} y={cy + r * 0.25} fontSize={r * 0.4} textAnchor="middle">💧</text>
            )}
            {mood === 'happy' && (
              <>
                <text x={cx - r * 0.9} y={cy - r * 0.6} fontSize={r * 0.3} className="pet-sparkle" style={{ animationDelay: '0s' }}>⭐</text>
                <text x={cx + r * 0.85} y={cy - r * 0.7} fontSize={r * 0.25} className="pet-sparkle" style={{ animationDelay: '0.4s' }}>⭐</text>
              </>
            )}
            {attentionAnim === 'yawn' && (
              <text x={cx + r * 0.7} y={cy - r * 0.6} fontSize={r * 0.3}>💤</text>
            )}
          </g>
        </svg>
      </div>
    </div>
  );
});

// ---- Mouth subcomponent ----

function Mouth({ mood, cx, cy, r }: { mood: PetMood; cx: number; cy: number; r: number }) {
  const mouthY = cy + r * 0.22;
  if (mood === 'sad') {
    return (
      <path d={`M ${cx - r * 0.14} ${mouthY + r * 0.04} Q ${cx} ${mouthY - r * 0.06} ${cx + r * 0.14} ${mouthY + r * 0.04}`}
        fill="none" stroke="#e88fa0" strokeWidth="2" strokeLinecap="round" />
    );
  }
  const happyMouth = mood === 'happy' || mood === 'eating';
  return (
    <path d={`M ${cx - r * 0.14} ${mouthY} Q ${cx} ${mouthY + r * (happyMouth ? 0.16 : 0.08)} ${cx + r * 0.14} ${mouthY}`}
      fill="none" stroke="#e88fa0" strokeWidth="2" strokeLinecap="round" />
  );
}

// ---- Per-animal layered SVG body parts ----

function AnimalLayers({
  animal, mood, tailWagCls,
}: { animal: PetAnimal; mood: PetMood; tailWagCls: string }) {
  switch (animal) {
    case 'cat':    return <CatLayers mood={mood} tailWagCls={tailWagCls} />;
    case 'dog':    return <DogLayers mood={mood} tailWagCls={tailWagCls} />;
    case 'bunny':  return <BunnyLayers mood={mood} tailWagCls={tailWagCls} />;
    case 'hamster':return <HamsterLayers mood={mood} tailWagCls={tailWagCls} />;
    case 'axolotl':return <AxolotlLayers mood={mood} tailWagCls={tailWagCls} />;
    case 'dragon': return <DragonLayers mood={mood} tailWagCls={tailWagCls} />;
    // 'custom' is handled by the caller before this point.
    default: return null;
  }
}

// Common geometry
const CX = 100, CY = 95, R = 60;

interface LayerProps {
  mood: PetMood;
  tailWagCls: string;
}

function Body({ fill = 'url(#body-grad)' }: { fill?: string }) {
  return <ellipse cx={CX} cy={CY + R * 0.72} rx={R * 0.6} ry={R * 0.45} fill={fill} />;
}

function Head({ fill = 'url(#head-grad)' }: { fill?: string }) {
  return <circle cx={CX} cy={CY} r={R} fill={fill} />;
}

function CatLayers({ mood, tailWagCls }: LayerProps) {
  void mood;
  return (
    <>
      {/* Tail — wraps in its own <g> for wag */}
      <g className={tailWagCls} style={{ transformOrigin: '155px 155px' }}>
        <path d="M 145 155 Q 175 170 170 140 Q 165 120 155 130"
          fill="none" stroke="url(#body-grad)" strokeWidth="9" strokeLinecap="round" />
      </g>
      <Body />
      <Head />
      {/* Ears — twitch on left */}
      <g className="ear-twitch" style={{ animationDelay: '2s' }}>
        <polygon points={`${CX - R * 0.65},${CY - R * 0.78} ${CX - R * 0.85},${CY - R * 1.18} ${CX - R * 0.35},${CY - R * 0.98}`} fill="url(#ear-grad)" />
        <polygon points={`${CX - R * 0.65},${CY - R * 0.82} ${CX - R * 0.8},${CY - R * 1.1} ${CX - R * 0.42},${CY - R * 0.98}`} fill="#ffc0cb" />
      </g>
      <g className="ear-twitch" style={{ animationDelay: '7s' }}>
        <polygon points={`${CX + R * 0.65},${CY - R * 0.78} ${CX + R * 0.85},${CY - R * 1.18} ${CX + R * 0.35},${CY - R * 0.98}`} fill="url(#ear-grad)" />
        <polygon points={`${CX + R * 0.65},${CY - R * 0.82} ${CX + R * 0.8},${CY - R * 1.1} ${CX + R * 0.42},${CY - R * 0.98}`} fill="#ffc0cb" />
      </g>
      {/* Whiskers */}
      <g>
        <line x1={CX - R * 0.08} y1={CY + R * 0.06} x2={CX - R * 0.6} y2={CY + R * 0.01} stroke="#c8bfb0" strokeWidth="1.2" strokeLinecap="round" />
        <line x1={CX - R * 0.08} y1={CY + R * 0.1} x2={CX - R * 0.62} y2={CY + R * 0.12} stroke="#c8bfb0" strokeWidth="1.2" strokeLinecap="round" />
        <line x1={CX - R * 0.08} y1={CY + R * 0.14} x2={CX - R * 0.58} y2={CY + R * 0.22} stroke="#c8bfb0" strokeWidth="1.2" strokeLinecap="round" />
        <line x1={CX + R * 0.08} y1={CY + R * 0.06} x2={CX + R * 0.6} y2={CY + R * 0.01} stroke="#c8bfb0" strokeWidth="1.2" strokeLinecap="round" />
        <line x1={CX + R * 0.08} y1={CY + R * 0.1} x2={CX + R * 0.62} y2={CY + R * 0.12} stroke="#c8bfb0" strokeWidth="1.2" strokeLinecap="round" />
        <line x1={CX + R * 0.08} y1={CY + R * 0.14} x2={CX + R * 0.58} y2={CY + R * 0.22} stroke="#c8bfb0" strokeWidth="1.2" strokeLinecap="round" />
      </g>
    </>
  );
}

function DogLayers({ mood, tailWagCls }: LayerProps) {
  return (
    <>
      <g className={tailWagCls} style={{ transformOrigin: '155px 148px' }}>
        <ellipse cx={155} cy={148} rx={10} ry={7} fill="url(#body-grad)" transform="rotate(-30 155 148)" />
      </g>
      <Body />
      <Head />
      {/* Floppy ears with twitch */}
      <g className="ear-twitch" style={{ animationDelay: '3s' }}>
        <ellipse cx={CX - R * 0.72} cy={CY - R * 0.55} rx={R * 0.26} ry={R * 0.38} fill="url(#ear-grad)" />
      </g>
      <g className="ear-twitch" style={{ animationDelay: '9s' }}>
        <ellipse cx={CX + R * 0.72} cy={CY - R * 0.55} rx={R * 0.26} ry={R * 0.38} fill="url(#ear-grad)" />
      </g>
      {/* Tongue (only when not sleeping/sad) */}
      {mood !== 'sleeping' && mood !== 'sad' && (
        <ellipse cx={CX} cy={CY + R * 0.33} rx={R * 0.1} ry={R * 0.08} fill="#ff9eb5" />
      )}
    </>
  );
}

function BunnyLayers({ mood, tailWagCls }: LayerProps) {
  void mood;
  return (
    <>
      <g className={tailWagCls} style={{ transformOrigin: '155px 155px' }}>
        <circle cx={155} cy={155} r={7} fill="#fff0f4" />
      </g>
      <Body />
      <Head />
      <g className="ear-twitch" style={{ animationDelay: '4s' }}>
        <ellipse cx={CX - R * 0.42} cy={CY - R * 1.15} rx={R * 0.2} ry={R * 0.5} fill="url(#ear-grad)" />
        <ellipse cx={CX - R * 0.42} cy={CY - R * 1.15} rx={R * 0.11} ry={R * 0.38} fill="#ffc0cb" />
      </g>
      <g className="ear-twitch" style={{ animationDelay: '11s' }}>
        <ellipse cx={CX + R * 0.42} cy={CY - R * 1.15} rx={R * 0.2} ry={R * 0.5} fill="url(#ear-grad)" />
        <ellipse cx={CX + R * 0.42} cy={CY - R * 1.15} rx={R * 0.11} ry={R * 0.38} fill="#ffc0cb" />
      </g>
    </>
  );
}

function HamsterLayers({ mood, tailWagCls }: LayerProps) {
  void mood; void tailWagCls;
  return (
    <>
      <Body />
      <Head />
      <g className="ear-twitch" style={{ animationDelay: '5s' }}>
        <circle cx={CX - R * 0.78} cy={CY - R * 0.7} r={R * 0.22} fill="url(#ear-grad)" />
        <circle cx={CX - R * 0.78} cy={CY - R * 0.7} r={R * 0.14} fill="#ffc0cb" />
      </g>
      <g className="ear-twitch" style={{ animationDelay: '12s' }}>
        <circle cx={CX + R * 0.78} cy={CY - R * 0.7} r={R * 0.22} fill="url(#ear-grad)" />
        <circle cx={CX + R * 0.78} cy={CY - R * 0.7} r={R * 0.14} fill="#ffc0cb" />
      </g>
      {/* Chubby cheek pouches */}
      <ellipse cx={CX - R * 0.7} cy={CY + R * 0.15} rx={R * 0.26} ry={R * 0.22} fill="#ffd8b0" opacity="0.7" />
      <ellipse cx={CX + R * 0.7} cy={CY + R * 0.15} rx={R * 0.26} ry={R * 0.22} fill="#ffd8b0" opacity="0.7" />
    </>
  );
}

function AxolotlLayers({ mood, tailWagCls }: LayerProps) {
  void mood; void tailWagCls;
  return (
    <>
      {/* Body fins */}
      <ellipse cx={CX - R * 0.85} cy={CY + R * 0.65} rx={R * 0.12} ry={R * 0.25} fill="url(#pink-grad)" transform={`rotate(-20 ${CX - R * 0.85} ${CY + R * 0.65})`} />
      <ellipse cx={CX + R * 0.85} cy={CY + R * 0.65} rx={R * 0.12} ry={R * 0.25} fill="url(#pink-grad)" transform={`rotate(20 ${CX + R * 0.85} ${CY + R * 0.65})`} />
      <Body fill="url(#pink-grad)" />
      <Head fill="url(#pink-grad)" />
      {/* External gills, left */}
      <g className="ear-twitch" style={{ animationDelay: '6s' }}>
        <line x1={CX - R * 0.72} y1={CY - R * 0.55} x2={CX - R * 0.95} y2={CY - R * 1.05} stroke="#ff9eb5" strokeWidth="3" strokeLinecap="round" />
        <line x1={CX - R * 0.84} y1={CY - R * 0.8} x2={CX - R * 1.1} y2={CY - R * 1.0} stroke="#ff9eb5" strokeWidth="2" strokeLinecap="round" />
        <line x1={CX - R * 0.84} y1={CY - R * 0.8} x2={CX - R * 0.82} y2={CY - R * 1.08} stroke="#ff9eb5" strokeWidth="2" strokeLinecap="round" />
        <line x1={CX - R * 0.88} y1={CY - R * 0.95} x2={CX - R * 1.05} y2={CY - R * 1.15} stroke="#ff9eb5" strokeWidth="1.5" strokeLinecap="round" />
        <line x1={CX - R * 0.9} y1={CY - R * 0.98} x2={CX - R * 0.78} y2={CY - R * 1.18} stroke="#ff9eb5" strokeWidth="1.5" strokeLinecap="round" />
      </g>
      <g className="ear-twitch" style={{ animationDelay: '13s' }}>
        <line x1={CX + R * 0.72} y1={CY - R * 0.55} x2={CX + R * 0.95} y2={CY - R * 1.05} stroke="#ff9eb5" strokeWidth="3" strokeLinecap="round" />
        <line x1={CX + R * 0.84} y1={CY - R * 0.8} x2={CX + R * 1.1} y2={CY - R * 1.0} stroke="#ff9eb5" strokeWidth="2" strokeLinecap="round" />
        <line x1={CX + R * 0.84} y1={CY - R * 0.8} x2={CX + R * 0.82} y2={CY - R * 1.08} stroke="#ff9eb5" strokeWidth="2" strokeLinecap="round" />
        <line x1={CX + R * 0.88} y1={CY - R * 0.95} x2={CX + R * 1.05} y2={CY - R * 1.15} stroke="#ff9eb5" strokeWidth="1.5" strokeLinecap="round" />
        <line x1={CX + R * 0.9} y1={CY - R * 0.98} x2={CX + R * 0.78} y2={CY - R * 1.18} stroke="#ff9eb5" strokeWidth="1.5" strokeLinecap="round" />
      </g>
      {/* Wide smile */}
      <path d={`M ${CX - R * 0.18} ${CY + R * 0.22} Q ${CX} ${CY + R * 0.36} ${CX + R * 0.18} ${CY + R * 0.22}`}
        fill="none" stroke="#e88fa0" strokeWidth="2.5" strokeLinecap="round" />
    </>
  );
}

function DragonLayers({ mood, tailWagCls }: LayerProps) {
  void mood; void tailWagCls;
  return (
    <>
      {/* Wings */}
      <polygon points={`${CX - R * 0.6},${CY + R * 0.2} ${CX - R * 1.2},${CY - R * 0.4} ${CX - R * 0.3},${CY - R * 0.1}`} fill="url(#green-grad)" opacity="0.85" />
      <polygon points={`${CX + R * 0.6},${CY + R * 0.2} ${CX + R * 1.2},${CY - R * 0.4} ${CX + R * 0.3},${CY - R * 0.1}`} fill="url(#green-grad)" opacity="0.85" />
      <Body fill="url(#green-grad)" />
      <Head fill="url(#green-grad)" />
      {/* Head spikes */}
      <polygon points={`${CX - R * 0.3},${CY - R * 0.98} ${CX - R * 0.22},${CY - R * 1.3} ${CX - R * 0.14},${CY - R * 0.98}`} fill="#a8d8a0" />
      <polygon points={`${CX - R * 0.06},${CY - R * 1.0} ${CX},${CY - R * 1.38} ${CX + R * 0.06},${CY - R * 1.0}`} fill="#a8d8a0" />
      <polygon points={`${CX + R * 0.14},${CY - R * 0.98} ${CX + R * 0.22},${CY - R * 1.3} ${CX + R * 0.3},${CY - R * 0.98}`} fill="#a8d8a0" />
    </>
  );
}

