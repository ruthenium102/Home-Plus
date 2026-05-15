import { forwardRef, useImperativeHandle, useRef } from 'react';
import type { PetMood } from './PetCanvas';

export interface PetEyesHandle {
  /** Update iris positions toward a screen point (clientX/clientY). */
  lookAt: (clientX: number, clientY: number) => void;
  /** Reset iris to neutral center. */
  reset: () => void;
  /** Trigger a single quick blink. */
  blink: () => void;
}

interface Props {
  cx: number; cy: number; r: number;
  mood: PetMood;
  /** Center of the pet on the page — used to compute look direction. */
  rootRef: React.RefObject<HTMLDivElement | null>;
}

/**
 * Eye layer that tracks the cursor without re-rendering on mouse move.
 * The parent calls `lookAt(x, y)` via the imperative ref; we mutate the iris
 * `cx`/`cy` attributes directly for performance.
 */
export const PetEyes = forwardRef<PetEyesHandle, Props>(function PetEyes(
  { cx, cy, r, mood, rootRef },
  ref,
) {
  const eyeY = cy - r * 0.12;
  const eyeSpacing = r * 0.3;
  const leftEyeX = cx - eyeSpacing;
  const rightEyeX = cx + eyeSpacing;
  const eyeR = r * 0.16;        // slightly larger to host iris movement
  const pupilR = eyeR * 0.55;
  const shineR = pupilR * 0.42;
  const maxOffset = eyeR - pupilR - 1; // how far iris can travel inside sclera

  const leftPupilRef = useRef<SVGCircleElement>(null);
  const rightPupilRef = useRef<SVGCircleElement>(null);
  const leftShineRef = useRef<SVGCircleElement>(null);
  const rightShineRef = useRef<SVGCircleElement>(null);
  const leftLidRef = useRef<SVGGElement>(null);
  const rightLidRef = useRef<SVGGElement>(null);

  useImperativeHandle(ref, () => ({
    lookAt(clientX, clientY) {
      const root = rootRef.current;
      if (!root) return;
      const rect = root.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const dx = clientX - centerX;
      const dy = clientY - centerY;
      const dist = Math.hypot(dx, dy);
      if (dist === 0) return;
      // Normalize, then push by maxOffset (clamped to a soft falloff for nearby).
      const falloff = Math.min(1, dist / 200);
      const nx = (dx / dist) * maxOffset * falloff;
      const ny = (dy / dist) * maxOffset * falloff;

      if (leftPupilRef.current) {
        leftPupilRef.current.setAttribute('cx', String(leftEyeX + nx));
        leftPupilRef.current.setAttribute('cy', String(eyeY + ny));
      }
      if (rightPupilRef.current) {
        rightPupilRef.current.setAttribute('cx', String(rightEyeX + nx));
        rightPupilRef.current.setAttribute('cy', String(eyeY + ny));
      }
      if (leftShineRef.current) {
        leftShineRef.current.setAttribute('cx', String(leftEyeX + nx + shineR * 0.4));
        leftShineRef.current.setAttribute('cy', String(eyeY + ny - shineR * 0.6));
      }
      if (rightShineRef.current) {
        rightShineRef.current.setAttribute('cx', String(rightEyeX + nx + shineR * 0.4));
        rightShineRef.current.setAttribute('cy', String(eyeY + ny - shineR * 0.6));
      }
    },
    reset() {
      if (leftPupilRef.current) {
        leftPupilRef.current.setAttribute('cx', String(leftEyeX));
        leftPupilRef.current.setAttribute('cy', String(eyeY));
      }
      if (rightPupilRef.current) {
        rightPupilRef.current.setAttribute('cx', String(rightEyeX));
        rightPupilRef.current.setAttribute('cy', String(eyeY));
      }
      if (leftShineRef.current) {
        leftShineRef.current.setAttribute('cx', String(leftEyeX + shineR * 0.4));
        leftShineRef.current.setAttribute('cy', String(eyeY - shineR * 0.6));
      }
      if (rightShineRef.current) {
        rightShineRef.current.setAttribute('cx', String(rightEyeX + shineR * 0.4));
        rightShineRef.current.setAttribute('cy', String(eyeY - shineR * 0.6));
      }
    },
    blink() {
      [leftLidRef.current, rightLidRef.current].forEach((el) => {
        if (!el) return;
        el.classList.remove('pet-blink');
        // Force reflow so we can re-trigger the animation.
        // eslint-disable-next-line @typescript-eslint/no-unused-expressions
        void el.getBoundingClientRect();
        el.classList.add('pet-blink');
      });
    },
  }), [leftEyeX, rightEyeX, eyeY, maxOffset, rootRef, shineR]);

  // ---- Render mood-specific eye shapes ----

  if (mood === 'sleeping') {
    // Closed eyes — sleepy < > shapes
    return (
      <g>
        <path d={`M ${leftEyeX - eyeR * 0.9} ${eyeY + eyeR * 0.2} Q ${leftEyeX} ${eyeY - eyeR * 0.7} ${leftEyeX + eyeR * 0.9} ${eyeY + eyeR * 0.2}`}
          fill="none" stroke="#201c18" strokeWidth="2.5" strokeLinecap="round" />
        <path d={`M ${rightEyeX - eyeR * 0.9} ${eyeY + eyeR * 0.2} Q ${rightEyeX} ${eyeY - eyeR * 0.7} ${rightEyeX + eyeR * 0.9} ${eyeY + eyeR * 0.2}`}
          fill="none" stroke="#201c18" strokeWidth="2.5" strokeLinecap="round" />
        <text x={cx + r * 0.55} y={cy - r * 0.5} fontSize={r * 0.32} fill="#b8a8e8" textAnchor="middle">z</text>
        <text x={cx + r * 0.72} y={cy - r * 0.72} fontSize={r * 0.24} fill="#c8b8f8" textAnchor="middle">z</text>
      </g>
    );
  }

  if (mood === 'sad') {
    // Droopy eyes — half-closed teardrops
    return (
      <g>
        <circle cx={leftEyeX} cy={eyeY} r={eyeR} fill="#201c18" />
        <circle cx={rightEyeX} cy={eyeY} r={eyeR} fill="#201c18" />
        <rect x={leftEyeX - eyeR} y={eyeY - eyeR - 1} width={eyeR * 2} height={eyeR + 1} fill="#fff8f0" />
        <rect x={rightEyeX - eyeR} y={eyeY - eyeR - 1} width={eyeR * 2} height={eyeR + 1} fill="#fff8f0" />
        <circle cx={leftEyeX + shineR} cy={eyeY - shineR * 0.5} r={shineR * 0.7} fill="white" />
        <circle cx={rightEyeX + shineR} cy={eyeY - shineR * 0.5} r={shineR * 0.7} fill="white" />
      </g>
    );
  }

  // Default & happy — full eyes with iris that can move
  return (
    <g>
      {/* Sclera (white) */}
      <circle cx={leftEyeX} cy={eyeY} r={eyeR} fill="white" />
      <circle cx={rightEyeX} cy={eyeY} r={eyeR} fill="white" />
      {/* Iris/pupil — moved by lookAt */}
      <circle ref={leftPupilRef} cx={leftEyeX} cy={eyeY} r={pupilR} fill="#201c18" />
      <circle ref={rightPupilRef} cx={rightEyeX} cy={eyeY} r={pupilR} fill="#201c18" />
      {/* Catch-light */}
      <circle ref={leftShineRef}
        cx={leftEyeX + shineR * 0.4} cy={eyeY - shineR * 0.6}
        r={shineR} fill="white" />
      <circle ref={rightShineRef}
        cx={rightEyeX + shineR * 0.4} cy={eyeY - shineR * 0.6}
        r={shineR} fill="white" />
      {/* Happy: extra sparkle in iris */}
      {mood === 'happy' && (
        <>
          <text x={leftEyeX} y={eyeY + shineR * 0.6} fontSize={shineR * 2.2}
            textAnchor="middle" fill="#fff59e" style={{ pointerEvents: 'none' }}>✦</text>
          <text x={rightEyeX} y={eyeY + shineR * 0.6} fontSize={shineR * 2.2}
            textAnchor="middle" fill="#fff59e" style={{ pointerEvents: 'none' }}>✦</text>
        </>
      )}
      {/* Eyelid — a thin skin-colored arc curtain. We force scaleY to 0 by default
          so it's invisible; the `pet-blink` animation briefly stretches it to 1
          (covering the eye) and back, producing a blink. */}
      <g ref={leftLidRef}
        style={{ transformBox: 'fill-box', transformOrigin: 'center', transform: 'scaleY(0)' }}>
        <ellipse cx={leftEyeX} cy={eyeY} rx={eyeR + 0.5} ry={eyeR + 0.5} fill="#fff8f0" />
        <path d={`M ${leftEyeX - eyeR} ${eyeY} Q ${leftEyeX} ${eyeY + eyeR * 0.6} ${leftEyeX + eyeR} ${eyeY}`}
          fill="none" stroke="#201c18" strokeWidth="1.5" strokeLinecap="round" />
      </g>
      <g ref={rightLidRef}
        style={{ transformBox: 'fill-box', transformOrigin: 'center', transform: 'scaleY(0)' }}>
        <ellipse cx={rightEyeX} cy={eyeY} rx={eyeR + 0.5} ry={eyeR + 0.5} fill="#fff8f0" />
        <path d={`M ${rightEyeX - eyeR} ${eyeY} Q ${rightEyeX} ${eyeY + eyeR * 0.6} ${rightEyeX + eyeR} ${eyeY}`}
          fill="none" stroke="#201c18" strokeWidth="1.5" strokeLinecap="round" />
      </g>
    </g>
  );
});
