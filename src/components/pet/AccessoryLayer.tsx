import type { PetAnimal } from '@/types';
import { findAccessory } from './petAccessories';

interface Props {
  /** Accessory ids currently worn. */
  accessories: string[];
  /** Pet head center + radius so we can position items correctly. */
  cx: number;
  cy: number;
  r: number;
  animal: PetAnimal;
}

/**
 * Renders cosmetic accessory layers on top of the base pet SVG.
 * Each slot ('hat' | 'face' | 'neck') has its own renderer; we only draw
 * the *first* accessory we find per slot in `accessories`.
 */
export function AccessoryLayer({ accessories, cx, cy, r, animal }: Props) {
  if (!accessories || accessories.length === 0) return null;

  // Find which item is currently worn for each slot
  let hat: ReturnType<typeof findAccessory> | undefined;
  let face: ReturnType<typeof findAccessory> | undefined;
  let neck: ReturnType<typeof findAccessory> | undefined;
  for (const id of accessories) {
    const a = findAccessory(id);
    if (!a) continue;
    if (a.slot === 'hat' && !hat) hat = a;
    else if (a.slot === 'face' && !face) face = a;
    else if (a.slot === 'neck' && !neck) neck = a;
  }

  // Some animals have ears that occupy the top — nudge hats lower for them.
  const hatLift = animal === 'bunny' ? 1.5 : animal === 'cat' ? 1.15 : 1.05;
  const hatY = cy - r * hatLift;

  return (
    <g style={{ pointerEvents: 'none' }}>
      {neck && <NeckAccessory id={neck.id} cx={cx} cy={cy} r={r} />}
      {hat && <HatAccessory id={hat.id} cx={cx} cy={hatY} r={r} />}
      {face && <FaceAccessory id={face.id} cx={cx} cy={cy} r={r} />}
    </g>
  );
}

// ---- Hats ----

function HatAccessory({ id, cx, cy, r }: { id: string; cx: number; cy: number; r: number }) {
  if (id === 'beanie') {
    return (
      <g>
        <path d={`M ${cx - r * 0.55} ${cy + r * 0.1} Q ${cx} ${cy - r * 0.6} ${cx + r * 0.55} ${cy + r * 0.1} Z`}
          fill="#c44d2e" stroke="#8a3520" strokeWidth="1.5" />
        <rect x={cx - r * 0.58} y={cy + r * 0.05} width={r * 1.16} height={r * 0.15} rx={r * 0.05}
          fill="#a8b5d4" stroke="#7d8aab" strokeWidth="1" />
        <circle cx={cx} cy={cy - r * 0.55} r={r * 0.08} fill="#fff" />
      </g>
    );
  }
  if (id === 'top_hat') {
    return (
      <g>
        <rect x={cx - r * 0.55} y={cy + r * 0.1} width={r * 1.1} height={r * 0.08} fill="#201c18" />
        <rect x={cx - r * 0.4} y={cy - r * 0.55} width={r * 0.8} height={r * 0.7} fill="#201c18" />
        <rect x={cx - r * 0.4} y={cy - r * 0.1} width={r * 0.8} height={r * 0.08} fill="#c44d2e" />
      </g>
    );
  }
  if (id === 'crown') {
    return (
      <g>
        <polygon
          points={`
            ${cx - r * 0.5},${cy + r * 0.1}
            ${cx - r * 0.5},${cy - r * 0.2}
            ${cx - r * 0.3},${cy + r * 0.02}
            ${cx - r * 0.1},${cy - r * 0.35}
            ${cx + r * 0.1},${cy + r * 0.02}
            ${cx + r * 0.3},${cy - r * 0.35}
            ${cx + r * 0.5},${cy + r * 0.02}
            ${cx + r * 0.5},${cy + r * 0.1}
          `}
          fill="#facc15" stroke="#b78a05" strokeWidth="1.5" strokeLinejoin="round" />
        <circle cx={cx - r * 0.3} cy={cy - r * 0.04} r={r * 0.05} fill="#ef4444" />
        <circle cx={cx} cy={cy - r * 0.16} r={r * 0.05} fill="#22c55e" />
        <circle cx={cx + r * 0.3} cy={cy - r * 0.04} r={r * 0.05} fill="#3b82f6" />
      </g>
    );
  }
  if (id === 'party') {
    return (
      <g>
        <polygon
          points={`${cx - r * 0.32},${cy + r * 0.1} ${cx + r * 0.32},${cy + r * 0.1} ${cx},${cy - r * 0.65}`}
          fill="#ec4899" stroke="#9d2466" strokeWidth="1.2" />
        <polygon points={`${cx - r * 0.32},${cy + r * 0.05} ${cx},${cy - r * 0.1} ${cx + r * 0.32},${cy + r * 0.05}`}
          fill="#f9a8d4" opacity="0.6" />
        <circle cx={cx} cy={cy - r * 0.7} r={r * 0.08} fill="#fde68a" />
      </g>
    );
  }
  return null;
}

// ---- Face accessories ----

function FaceAccessory({ id, cx, cy, r }: { id: string; cx: number; cy: number; r: number }) {
  const eyeY = cy - r * 0.12;
  const eyeSpacing = r * 0.3;
  const eyeR = r * 0.16;

  if (id === 'glasses') {
    return (
      <g fill="none" stroke="#201c18" strokeWidth="2" strokeLinecap="round">
        <circle cx={cx - eyeSpacing} cy={eyeY} r={eyeR + 2} fill="rgba(180, 200, 220, 0.18)" />
        <circle cx={cx + eyeSpacing} cy={eyeY} r={eyeR + 2} fill="rgba(180, 200, 220, 0.18)" />
        <line x1={cx - eyeSpacing + eyeR + 2} y1={eyeY}
          x2={cx + eyeSpacing - eyeR - 2} y2={eyeY} />
      </g>
    );
  }
  if (id === 'shades') {
    return (
      <g>
        <ellipse cx={cx - eyeSpacing} cy={eyeY} rx={eyeR + 3} ry={eyeR + 1} fill="#1a1a1a" />
        <ellipse cx={cx + eyeSpacing} cy={eyeY} rx={eyeR + 3} ry={eyeR + 1} fill="#1a1a1a" />
        <line x1={cx - eyeSpacing + eyeR + 3} y1={eyeY}
          x2={cx + eyeSpacing - eyeR - 3} y2={eyeY}
          stroke="#1a1a1a" strokeWidth="2.5" />
        <line x1={cx - eyeSpacing - eyeR * 0.4} y1={eyeY - eyeR * 0.6}
          x2={cx - eyeSpacing + eyeR * 0.2} y2={eyeY - eyeR * 0.2}
          stroke="white" strokeWidth="2.5" strokeLinecap="round" opacity="0.7" />
        <line x1={cx + eyeSpacing - eyeR * 0.4} y1={eyeY - eyeR * 0.6}
          x2={cx + eyeSpacing + eyeR * 0.2} y2={eyeY - eyeR * 0.2}
          stroke="white" strokeWidth="2.5" strokeLinecap="round" opacity="0.7" />
      </g>
    );
  }
  return null;
}

// ---- Neck accessories ----

function NeckAccessory({ id, cx, cy, r }: { id: string; cx: number; cy: number; r: number }) {
  // Position at base of head where it meets the body
  const neckY = cy + r * 0.72;

  if (id === 'red_collar') {
    return (
      <g>
        <ellipse cx={cx} cy={neckY} rx={r * 0.42} ry={r * 0.12} fill="#dc2626" stroke="#7f1d1d" strokeWidth="1.2" />
        <circle cx={cx} cy={neckY + r * 0.06} r={r * 0.08} fill="#facc15" stroke="#b78a05" strokeWidth="1" />
      </g>
    );
  }
  if (id === 'bow_tie') {
    return (
      <g>
        <polygon points={`${cx - r * 0.32},${neckY - r * 0.1} ${cx - r * 0.05},${neckY} ${cx - r * 0.32},${neckY + r * 0.1}`}
          fill="#dc2626" stroke="#7f1d1d" strokeWidth="1" />
        <polygon points={`${cx + r * 0.32},${neckY - r * 0.1} ${cx + r * 0.05},${neckY} ${cx + r * 0.32},${neckY + r * 0.1}`}
          fill="#dc2626" stroke="#7f1d1d" strokeWidth="1" />
        <rect x={cx - r * 0.06} y={neckY - r * 0.08} width={r * 0.12} height={r * 0.16} rx={r * 0.03}
          fill="#7f1d1d" />
      </g>
    );
  }
  if (id === 'scarf') {
    return (
      <g>
        <path
          d={`M ${cx - r * 0.5} ${neckY - r * 0.05}
              Q ${cx} ${neckY + r * 0.18} ${cx + r * 0.5} ${neckY - r * 0.05}
              L ${cx + r * 0.5} ${neckY + r * 0.1}
              Q ${cx} ${neckY + r * 0.3} ${cx - r * 0.5} ${neckY + r * 0.1} Z`}
          fill="#0ea5e9" stroke="#075985" strokeWidth="1.2" />
        <path d={`M ${cx + r * 0.18} ${neckY + r * 0.12}
                  L ${cx + r * 0.32} ${neckY + r * 0.5}
                  L ${cx + r * 0.1} ${neckY + r * 0.5} Z`}
          fill="#0ea5e9" stroke="#075985" strokeWidth="1.2" />
        <line x1={cx - r * 0.4} y1={neckY + r * 0.02} x2={cx + r * 0.4} y2={neckY + r * 0.02}
          stroke="#fff" strokeWidth="1" strokeDasharray="3 4" opacity="0.5" />
      </g>
    );
  }
  return null;
}
