import type { ReactNode } from 'react';
import type { PetAnimal } from '@/types';

export type PetMood = 'idle' | 'eating' | 'drinking' | 'happy' | 'sad' | 'sleeping';

interface Props {
  animal: PetAnimal;
  mood: PetMood;
  size?: number;
}

function KawaiiBase({
  cx, cy, r,
  earLeft, earRight,
  tail,
  extras,
  mood,
}: {
  cx: number; cy: number; r: number;
  earLeft: ReactNode;
  earRight: ReactNode;
  tail?: ReactNode;
  extras?: ReactNode;
  mood: PetMood;
}) {
  const eyeY = cy - r * 0.12;
  const eyeSpacing = r * 0.3;

  const leftEyeX = cx - eyeSpacing;
  const rightEyeX = cx + eyeSpacing;

  const eyeR = r * 0.14;
  const pupilR = eyeR * 0.6;
  const shineR = pupilR * 0.38;

  const isSleeping = mood === 'sleeping';
  const isSad = mood === 'sad';
  const isHappy = mood === 'happy';

  const mouthY = cy + r * 0.22;

  return (
    <>
      {tail}
      {/* Body */}
      <ellipse cx={cx} cy={cy + r * 0.72} rx={r * 0.6} ry={r * 0.45} fill="#f9e4c8" />
      {/* Head */}
      <circle cx={cx} cy={cy} r={r} fill="#fff8f0" />
      {earLeft}
      {earRight}
      {/* Eyes */}
      {isSleeping ? (
        <>
          {/* Closed eyes — ZZZ arcs */}
          <path d={`M ${leftEyeX - eyeR} ${eyeY} Q ${leftEyeX} ${eyeY - eyeR * 1.2} ${leftEyeX + eyeR} ${eyeY}`}
            fill="none" stroke="#201c18" strokeWidth="2.5" strokeLinecap="round" />
          <path d={`M ${rightEyeX - eyeR} ${eyeY} Q ${rightEyeX} ${eyeY - eyeR * 1.2} ${rightEyeX + eyeR} ${eyeY}`}
            fill="none" stroke="#201c18" strokeWidth="2.5" strokeLinecap="round" />
          <text x={cx + r * 0.55} y={cy - r * 0.5} fontSize={r * 0.32} fill="#b8a8e8" textAnchor="middle">z</text>
          <text x={cx + r * 0.72} y={cy - r * 0.72} fontSize={r * 0.24} fill="#c8b8f8" textAnchor="middle">z</text>
        </>
      ) : isSad ? (
        <>
          {/* Droopy eyes — half-closed */}
          <circle cx={leftEyeX} cy={eyeY} r={eyeR} fill="#201c18" />
          <circle cx={rightEyeX} cy={eyeY} r={eyeR} fill="#201c18" />
          <rect x={leftEyeX - eyeR} y={eyeY - eyeR} width={eyeR * 2} height={eyeR} fill="#fff8f0" />
          <rect x={rightEyeX - eyeR} y={eyeY - eyeR} width={eyeR * 2} height={eyeR} fill="#fff8f0" />
          <circle cx={leftEyeX + shineR} cy={eyeY - pupilR + shineR} r={shineR} fill="white" />
          <circle cx={rightEyeX + shineR} cy={eyeY - pupilR + shineR} r={shineR} fill="white" />
        </>
      ) : (
        <>
          <circle cx={leftEyeX} cy={eyeY} r={eyeR} fill="white" />
          <circle cx={rightEyeX} cy={eyeY} r={eyeR} fill="white" />
          <circle cx={leftEyeX} cy={eyeY} r={pupilR} fill="#201c18" />
          <circle cx={rightEyeX} cy={eyeY} r={pupilR} fill="#201c18" />
          <circle cx={leftEyeX + shineR} cy={eyeY - pupilR + shineR} r={shineR} fill="white" />
          <circle cx={rightEyeX + shineR} cy={eyeY - pupilR + shineR} r={shineR} fill="white" />
          {isHappy && (
            <>
              <circle cx={leftEyeX + shineR * 0.5} cy={eyeY + pupilR - shineR * 0.5} r={shineR * 0.7} fill="white" />
              <circle cx={rightEyeX + shineR * 0.5} cy={eyeY + pupilR - shineR * 0.5} r={shineR * 0.7} fill="white" />
            </>
          )}
        </>
      )}
      {/* Rosy cheeks */}
      <ellipse cx={cx - r * 0.42} cy={cy + r * 0.12} rx={r * 0.16} ry={r * 0.1} fill="#ffb3c1" opacity="0.55" />
      <ellipse cx={cx + r * 0.42} cy={cy + r * 0.12} rx={r * 0.16} ry={r * 0.1} fill="#ffb3c1" opacity="0.55" />
      {/* Nose */}
      <ellipse cx={cx} cy={cy + r * 0.04} rx={r * 0.045} ry={r * 0.032} fill="#e88fa0" />
      {/* Mouth */}
      {isSad ? (
        <path d={`M ${cx - r * 0.14} ${mouthY + r * 0.04} Q ${cx} ${mouthY - r * 0.06} ${cx + r * 0.14} ${mouthY + r * 0.04}`}
          fill="none" stroke="#e88fa0" strokeWidth="2" strokeLinecap="round" />
      ) : (
        <path d={`M ${cx - r * 0.14} ${mouthY} Q ${cx} ${mouthY + r * (isHappy ? 0.14 : 0.08)} ${cx + r * 0.14} ${mouthY}`}
          fill="none" stroke="#e88fa0" strokeWidth="2" strokeLinecap="round" />
      )}
      {extras}
      {/* Mood overlays */}
      {mood === 'eating' && (
        <text x={cx + r * 0.75} y={cy + r * 0.2} fontSize={r * 0.4} textAnchor="middle">🍎</text>
      )}
      {mood === 'drinking' && (
        <text x={cx + r * 0.75} y={cy + r * 0.2} fontSize={r * 0.4} textAnchor="middle">💧</text>
      )}
      {mood === 'happy' && (
        <>
          <text x={cx - r * 0.9} y={cy - r * 0.6} fontSize={r * 0.3} className="pet-sparkle" style={{ animationDelay: '0s' }}>⭐</text>
          <text x={cx + r * 0.85} y={cy - r * 0.7} fontSize={r * 0.25} className="pet-sparkle" style={{ animationDelay: '0.4s' }}>⭐</text>
        </>
      )}
    </>
  );
}

function CatSVG({ mood, size }: { mood: PetMood; size: number }) {
  const cx = 100, cy = 95, r = 60;
  return (
    <svg viewBox="0 0 200 200" width={size} height={size}>
      {/* Tail */}
      <path d="M 145 155 Q 175 170 170 140 Q 165 120 155 130"
        fill="none" stroke="#f9e4c8" strokeWidth="8" strokeLinecap="round" />
      <KawaiiBase cx={cx} cy={cy} r={r} mood={mood}
        earLeft={
          <>
            <polygon points={`${cx - r * 0.65},${cy - r * 0.78} ${cx - r * 0.85},${cy - r * 1.18} ${cx - r * 0.35},${cy - r * 0.98}`} fill="#fff8f0" />
            <polygon points={`${cx - r * 0.65},${cy - r * 0.82} ${cx - r * 0.8},${cy - r * 1.1} ${cx - r * 0.42},${cy - r * 0.98}`} fill="#ffc0cb" />
          </>
        }
        earRight={
          <>
            <polygon points={`${cx + r * 0.65},${cy - r * 0.78} ${cx + r * 0.85},${cy - r * 1.18} ${cx + r * 0.35},${cy - r * 0.98}`} fill="#fff8f0" />
            <polygon points={`${cx + r * 0.65},${cy - r * 0.82} ${cx + r * 0.8},${cy - r * 1.1} ${cx + r * 0.42},${cy - r * 0.98}`} fill="#ffc0cb" />
          </>
        }
        extras={
          <>
            {/* Whiskers */}
            <line x1={cx - r * 0.08} y1={cy + r * 0.06} x2={cx - r * 0.6} y2={cy + r * 0.01} stroke="#c8bfb0" strokeWidth="1.2" strokeLinecap="round" />
            <line x1={cx - r * 0.08} y1={cy + r * 0.1} x2={cx - r * 0.62} y2={cy + r * 0.12} stroke="#c8bfb0" strokeWidth="1.2" strokeLinecap="round" />
            <line x1={cx - r * 0.08} y1={cy + r * 0.14} x2={cx - r * 0.58} y2={cy + r * 0.22} stroke="#c8bfb0" strokeWidth="1.2" strokeLinecap="round" />
            <line x1={cx + r * 0.08} y1={cy + r * 0.06} x2={cx + r * 0.6} y2={cy + r * 0.01} stroke="#c8bfb0" strokeWidth="1.2" strokeLinecap="round" />
            <line x1={cx + r * 0.08} y1={cy + r * 0.1} x2={cx + r * 0.62} y2={cy + r * 0.12} stroke="#c8bfb0" strokeWidth="1.2" strokeLinecap="round" />
            <line x1={cx + r * 0.08} y1={cy + r * 0.14} x2={cx + r * 0.58} y2={cy + r * 0.22} stroke="#c8bfb0" strokeWidth="1.2" strokeLinecap="round" />
          </>
        }
      />
    </svg>
  );
}

function DogSVG({ mood, size }: { mood: PetMood; size: number }) {
  const cx = 100, cy = 95, r = 60;
  return (
    <svg viewBox="0 0 200 200" width={size} height={size}>
      {/* Stubby tail */}
      <ellipse cx={155} cy={148} rx={10} ry={7} fill="#f9e4c8" transform="rotate(-30 155 148)" />
      <KawaiiBase cx={cx} cy={cy} r={r} mood={mood}
        earLeft={
          <ellipse cx={cx - r * 0.72} cy={cy - r * 0.55} rx={r * 0.26} ry={r * 0.38} fill="#f0dfc0" />
        }
        earRight={
          <ellipse cx={cx + r * 0.72} cy={cy - r * 0.55} rx={r * 0.26} ry={r * 0.38} fill="#f0dfc0" />
        }
        extras={
          /* Tongue */
          mood !== 'sleeping' && mood !== 'sad' ? (
            <ellipse cx={cx} cy={cy + r * 0.33} rx={r * 0.1} ry={r * 0.08} fill="#ff9eb5" />
          ) : undefined
        }
      />
    </svg>
  );
}

function BunnySVG({ mood, size }: { mood: PetMood; size: number }) {
  const cx = 100, cy = 100, r = 56;
  return (
    <svg viewBox="0 0 200 200" width={size} height={size}>
      {/* Pom tail */}
      <circle cx={155} cy={155} r={7} fill="#fff0f4" />
      <KawaiiBase cx={cx} cy={cy} r={r} mood={mood}
        earLeft={
          <>
            <ellipse cx={cx - r * 0.42} cy={cy - r * 1.15} rx={r * 0.2} ry={r * 0.5} fill="#fff8f0" />
            <ellipse cx={cx - r * 0.42} cy={cy - r * 1.15} rx={r * 0.11} ry={r * 0.38} fill="#ffc0cb" />
          </>
        }
        earRight={
          <>
            <ellipse cx={cx + r * 0.42} cy={cy - r * 1.15} rx={r * 0.2} ry={r * 0.5} fill="#fff8f0" />
            <ellipse cx={cx + r * 0.42} cy={cy - r * 1.15} rx={r * 0.11} ry={r * 0.38} fill="#ffc0cb" />
          </>
        }
      />
    </svg>
  );
}

function HamsterSVG({ mood, size }: { mood: PetMood; size: number }) {
  const cx = 100, cy = 98, r = 58;
  return (
    <svg viewBox="0 0 200 200" width={size} height={size}>
      <KawaiiBase cx={cx} cy={cy} r={r} mood={mood}
        earLeft={
          <>
            <circle cx={cx - r * 0.78} cy={cy - r * 0.7} r={r * 0.22} fill="#fff8f0" />
            <circle cx={cx - r * 0.78} cy={cy - r * 0.7} r={r * 0.14} fill="#ffc0cb" />
          </>
        }
        earRight={
          <>
            <circle cx={cx + r * 0.78} cy={cy - r * 0.7} r={r * 0.22} fill="#fff8f0" />
            <circle cx={cx + r * 0.78} cy={cy - r * 0.7} r={r * 0.14} fill="#ffc0cb" />
          </>
        }
        extras={
          <>
            {/* Chubby cheek pouches */}
            <ellipse cx={cx - r * 0.7} cy={cy + r * 0.15} rx={r * 0.26} ry={r * 0.22} fill="#ffd8b0" opacity="0.7" />
            <ellipse cx={cx + r * 0.7} cy={cy + r * 0.15} rx={r * 0.26} ry={r * 0.22} fill="#ffd8b0" opacity="0.7" />
          </>
        }
      />
    </svg>
  );
}

function AxolotlSVG({ mood, size }: { mood: PetMood; size: number }) {
  const cx = 100, cy = 95, r = 56;
  return (
    <svg viewBox="0 0 200 200" width={size} height={size}>
      {/* Body fins */}
      <ellipse cx={cx - r * 0.85} cy={cy + r * 0.65} rx={r * 0.12} ry={r * 0.25} fill="#ffb3c6" transform={`rotate(-20 ${cx - r * 0.85} ${cy + r * 0.65})`} />
      <ellipse cx={cx + r * 0.85} cy={cy + r * 0.65} rx={r * 0.12} ry={r * 0.25} fill="#ffb3c6" transform={`rotate(20 ${cx + r * 0.85} ${cy + r * 0.65})`} />
      <KawaiiBase cx={cx} cy={cy} r={r} mood={mood}
        earLeft={
          /* External gills — 3 branching lines left */
          <>
            <line x1={cx - r * 0.72} y1={cy - r * 0.55} x2={cx - r * 0.95} y2={cy - r * 1.05} stroke="#ff9eb5" strokeWidth="3" strokeLinecap="round" />
            <line x1={cx - r * 0.84} y1={cy - r * 0.8} x2={cx - r * 1.1} y2={cy - r * 1.0} stroke="#ff9eb5" strokeWidth="2" strokeLinecap="round" />
            <line x1={cx - r * 0.84} y1={cy - r * 0.8} x2={cx - r * 0.82} y2={cy - r * 1.08} stroke="#ff9eb5" strokeWidth="2" strokeLinecap="round" />
            <line x1={cx - r * 0.88} y1={cy - r * 0.95} x2={cx - r * 1.05} y2={cy - r * 1.15} stroke="#ff9eb5" strokeWidth="1.5" strokeLinecap="round" />
            <line x1={cx - r * 0.9} y1={cy - r * 0.98} x2={cx - r * 0.78} y2={cy - r * 1.18} stroke="#ff9eb5" strokeWidth="1.5" strokeLinecap="round" />
          </>
        }
        earRight={
          <>
            <line x1={cx + r * 0.72} y1={cy - r * 0.55} x2={cx + r * 0.95} y2={cy - r * 1.05} stroke="#ff9eb5" strokeWidth="3" strokeLinecap="round" />
            <line x1={cx + r * 0.84} y1={cy - r * 0.8} x2={cx + r * 1.1} y2={cy - r * 1.0} stroke="#ff9eb5" strokeWidth="2" strokeLinecap="round" />
            <line x1={cx + r * 0.84} y1={cy - r * 0.8} x2={cx + r * 0.82} y2={cy - r * 1.08} stroke="#ff9eb5" strokeWidth="2" strokeLinecap="round" />
            <line x1={cx + r * 0.88} y1={cy - r * 0.95} x2={cx + r * 1.05} y2={cy - r * 1.15} stroke="#ff9eb5" strokeWidth="1.5" strokeLinecap="round" />
            <line x1={cx + r * 0.9} y1={cy - r * 0.98} x2={cx + r * 0.78} y2={cy - r * 1.18} stroke="#ff9eb5" strokeWidth="1.5" strokeLinecap="round" />
          </>
        }
        extras={
          /* Wide smile */
          <path d={`M ${cx - r * 0.18} ${cy + r * 0.22} Q ${cx} ${cy + r * 0.36} ${cx + r * 0.18} ${cy + r * 0.22}`}
            fill="none" stroke="#e88fa0" strokeWidth="2.5" strokeLinecap="round" />
        }
      />
    </svg>
  );
}

function DragonSVG({ mood, size }: { mood: PetMood; size: number }) {
  const cx = 100, cy = 95, r = 58;
  return (
    <svg viewBox="0 0 200 200" width={size} height={size}>
      {/* Wings */}
      <polygon points={`${cx - r * 0.6},${cy + r * 0.2} ${cx - r * 1.2},${cy - r * 0.4} ${cx - r * 0.3},${cy - r * 0.1}`} fill="#b8e8b0" opacity="0.8" />
      <polygon points={`${cx + r * 0.6},${cy + r * 0.2} ${cx + r * 1.2},${cy - r * 0.4} ${cx + r * 0.3},${cy - r * 0.1}`} fill="#b8e8b0" opacity="0.8" />
      <KawaiiBase cx={cx} cy={cy} r={r} mood={mood}
        earLeft={<></>}
        earRight={<></>}
        extras={
          <>
            {/* Head spikes */}
            <polygon points={`${cx - r * 0.3},${cy - r * 0.98} ${cx - r * 0.22},${cy - r * 1.3} ${cx - r * 0.14},${cy - r * 0.98}`} fill="#a8d8a0" />
            <polygon points={`${cx - r * 0.06},${cy - r * 1.0} ${cx},${cy - r * 1.38} ${cx + r * 0.06},${cy - r * 1.0}`} fill="#a8d8a0" />
            <polygon points={`${cx + r * 0.14},${cy - r * 0.98} ${cx + r * 0.22},${cy - r * 1.3} ${cx + r * 0.3},${cy - r * 0.98}`} fill="#a8d8a0" />
            {/* Slightly narrowed eyes for cute-fierce — done via the base with no extras needed */}
          </>
        }
      />
    </svg>
  );
}

const moodClass: Record<PetMood, string> = {
  idle: 'pet-idle',
  happy: 'pet-happy',
  eating: 'pet-eating',
  drinking: 'pet-drinking',
  sad: 'pet-sad',
  sleeping: 'pet-sleeping',
};

export function PetCanvas({ animal, mood, size = 160 }: Props) {
  const cls = moodClass[mood];
  const Animal = {
    cat: CatSVG,
    dog: DogSVG,
    bunny: BunnySVG,
    hamster: HamsterSVG,
    axolotl: AxolotlSVG,
    dragon: DragonSVG,
  }[animal];

  return (
    <div className={cls} style={{ display: 'inline-block', lineHeight: 0 }}>
      <Animal mood={mood} size={size} />
    </div>
  );
}
