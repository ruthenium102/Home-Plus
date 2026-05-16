import { useEffect, useRef, useState } from 'react';
import type { CustomPetEyes } from '@/types';

interface Props {
  onConfirm: (result: { image: string; eyes: CustomPetEyes }) => void;
  onCancel: () => void;
  initial?: { image: string; eyes: CustomPetEyes } | null;
}

const DEFAULT_EYES: CustomPetEyes = {
  left: { x: 0.4, y: 0.38 },
  right: { x: 0.6, y: 0.38 },
  radius: 0.06,
};

export function CustomPetEditor({ onConfirm, onCancel, initial }: Props) {
  const [step, setStep] = useState<'pick' | 'place'>(initial ? 'place' : 'pick');
  const [image, setImage] = useState<string | null>(initial?.image ?? null);
  const [eyes, setEyes] = useState<CustomPetEyes>(initial?.eyes ?? DEFAULT_EYES);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    setBusy(true);
    setError(null);
    try {
      const dataUrl = await processDrawing(file);
      setImage(dataUrl);
      setEyes(DEFAULT_EYES);
      setStep('place');
    } catch (e) {
      console.error('processDrawing failed', e);
      setError("Couldn't process that photo — try another?");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="card max-w-md w-full p-5 space-y-4 max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg text-text">
            {step === 'pick' ? 'Take a photo of your drawing' : 'Place the eyes'}
          </h2>
          <button
            onClick={onCancel}
            className="text-text-muted hover:text-text text-xl leading-none"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {step === 'pick' && (
          <>
            <p className="text-sm text-text-muted">
              Draw your pet on white paper, then snap a photo. We'll clean up the
              background so it looks tidy.
            </p>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
                e.target.value = '';
              }}
            />
            <button
              onClick={() => fileRef.current?.click()}
              disabled={busy}
              className="btn-primary w-full py-4 text-base rounded-xl"
            >
              {busy ? 'Working…' : '📷  Take / choose photo'}
            </button>
            {error && <p className="text-sm text-red-500">{error}</p>}
          </>
        )}

        {step === 'place' && image && (
          <>
            <p className="text-sm text-text-muted">
              Drag the dots onto your drawing's eyes. They'll blink and follow the
              cursor in the app.
            </p>
            <EyePlacer image={image} eyes={eyes} onChange={setEyes} />
            <div className="space-y-2">
              <label className="text-xs font-medium text-text-muted flex items-center justify-between">
                <span>Eye size</span>
                <span>{Math.round(eyes.radius * 100)}%</span>
              </label>
              <input
                type="range"
                min="3"
                max="14"
                step="1"
                value={Math.round(eyes.radius * 100)}
                onChange={(e) =>
                  setEyes((prev) => ({ ...prev, radius: Number(e.target.value) / 100 }))
                }
                className="w-full"
              />
            </div>
            <div className="flex gap-2 pt-2">
              <button
                onClick={() => {
                  setStep('pick');
                  setImage(null);
                }}
                className="btn-secondary flex-1 py-3 rounded-xl"
              >
                Retake
              </button>
              <button
                onClick={() => onConfirm({ image, eyes })}
                className="btn-primary flex-1 py-3 rounded-xl"
              >
                Looks good
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Eye placer — image + two draggable dots, coordinates are 0..1 of image size.
// ---------------------------------------------------------------------------

interface EyePlacerProps {
  image: string;
  eyes: CustomPetEyes;
  onChange: (eyes: CustomPetEyes) => void;
}

function EyePlacer({ image, eyes, onChange }: EyePlacerProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState<'left' | 'right' | null>(null);

  useEffect(() => {
    if (!dragging) return;
    const move = (e: PointerEvent) => {
      const wrap = wrapRef.current;
      if (!wrap) return;
      const rect = wrap.getBoundingClientRect();
      const x = clamp01((e.clientX - rect.left) / rect.width);
      const y = clamp01((e.clientY - rect.top) / rect.height);
      onChange({ ...eyes, [dragging]: { x, y } });
    };
    const up = () => setDragging(null);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
  }, [dragging, eyes, onChange]);

  return (
    <div
      ref={wrapRef}
      className="relative rounded-2xl overflow-hidden bg-surface-2 select-none touch-none"
      style={{ aspectRatio: '1 / 1', maxWidth: 360, margin: '0 auto' }}
    >
      <img
        src={image}
        alt="Your drawing"
        draggable={false}
        className="absolute inset-0 w-full h-full object-contain"
      />
      <EyeHandle eye={eyes.left} active={dragging === 'left'} onDown={() => setDragging('left')} />
      <EyeHandle eye={eyes.right} active={dragging === 'right'} onDown={() => setDragging('right')} />
    </div>
  );
}

function EyeHandle({
  eye,
  active,
  onDown,
}: {
  eye: { x: number; y: number };
  active: boolean;
  onDown: () => void;
}) {
  return (
    <button
      type="button"
      onPointerDown={(e) => {
        e.preventDefault();
        onDown();
      }}
      className={
        'absolute -translate-x-1/2 -translate-y-1/2 w-7 h-7 rounded-full border-2 ' +
        'border-white shadow-lg ring-2 ring-black/30 ' +
        (active ? 'bg-accent scale-110' : 'bg-accent/90')
      }
      style={{ left: `${eye.x * 100}%`, top: `${eye.y * 100}%`, touchAction: 'none' }}
      aria-label="Eye position"
    />
  );
}

// ---------------------------------------------------------------------------
// Image processing — remove paper background, crop, downscale.
// ---------------------------------------------------------------------------

async function processDrawing(file: File): Promise<string> {
  const img = await loadImage(file);
  const MAX_DIM = 480;
  const scale = Math.min(1, MAX_DIM / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const h = Math.max(1, Math.round(img.naturalHeight * scale));

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('no 2d context');
  ctx.drawImage(img, 0, 0, w, h);

  const pixels = ctx.getImageData(0, 0, w, h);
  removePaperBackground(pixels);
  ctx.putImageData(pixels, 0, 0);

  const cropped = cropToContent(canvas);
  return cropped.toDataURL('image/png');
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = (e) => {
      URL.revokeObjectURL(url);
      reject(e);
    };
    img.src = url;
  });
}

// Sample the four corners (averaged) to estimate the paper colour, then knock
// out any pixel close to that colour. Also drops very-light pixels (white-ish),
// since paper is rarely pure white in a photo.
function removePaperBackground(imageData: ImageData) {
  const { data, width, height } = imageData;
  const sample = (x: number, y: number) => {
    const i = (y * width + x) * 4;
    return [data[i], data[i + 1], data[i + 2]] as const;
  };
  const corners = [
    sample(2, 2),
    sample(width - 3, 2),
    sample(2, height - 3),
    sample(width - 3, height - 3),
  ];
  const bgR = avg(corners.map((c) => c[0]));
  const bgG = avg(corners.map((c) => c[1]));
  const bgB = avg(corners.map((c) => c[2]));

  const DIST_THRESHOLD = 55; // distance from paper colour to treat as background
  const LIGHTNESS_FLOOR = 225; // very-light pixels always considered background

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const dist = Math.max(Math.abs(r - bgR), Math.abs(g - bgG), Math.abs(b - bgB));
    const lightness = (r + g + b) / 3;
    if (dist < DIST_THRESHOLD || lightness > LIGHTNESS_FLOOR) {
      data[i + 3] = 0;
    } else if (dist < DIST_THRESHOLD * 1.4) {
      // soft fade near the edge so cleanup doesn't look chunky
      const t = (dist - DIST_THRESHOLD) / (DIST_THRESHOLD * 0.4);
      data[i + 3] = Math.round(data[i + 3] * t);
    }
  }
}

function cropToContent(canvas: HTMLCanvasElement): HTMLCanvasElement {
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  const { width, height } = canvas;
  const data = ctx.getImageData(0, 0, width, height).data;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  const ALPHA_MIN = 32;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const a = data[(y * width + x) * 4 + 3];
      if (a > ALPHA_MIN) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return canvas; // nothing detected; bail
  const pad = Math.round(Math.max(width, height) * 0.04);
  minX = Math.max(0, minX - pad);
  minY = Math.max(0, minY - pad);
  maxX = Math.min(width - 1, maxX + pad);
  maxY = Math.min(height - 1, maxY + pad);

  // Square the crop so eye-placement coords map cleanly to a square render box.
  const cropW = maxX - minX + 1;
  const cropH = maxY - minY + 1;
  const side = Math.max(cropW, cropH);
  const offsetX = Math.max(0, minX - Math.floor((side - cropW) / 2));
  const offsetY = Math.max(0, minY - Math.floor((side - cropH) / 2));
  const realSide = Math.min(side, width - offsetX, height - offsetY);

  const out = document.createElement('canvas');
  out.width = realSide;
  out.height = realSide;
  const octx = out.getContext('2d');
  if (!octx) return canvas;
  octx.drawImage(
    canvas,
    offsetX,
    offsetY,
    realSide,
    realSide,
    0,
    0,
    realSide,
    realSide,
  );
  return out;
}

function avg(xs: number[]): number {
  return xs.reduce((s, n) => s + n, 0) / xs.length;
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}
