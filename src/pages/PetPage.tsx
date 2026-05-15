import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useFamily } from '@/context/FamilyContext';
import { PetCanvas, xpToStage, type PetMood, type PetCanvasHandle } from '@/components/pet/PetCanvas';
import { SpeechBubble } from '@/components/pet/SpeechBubble';
import { HeartBurst } from '@/components/pet/HeartBurst';
import { MiniGame } from '@/components/pet/MiniGame';
import { ACCESSORIES, nextUnlock, wornForSlot, type Accessory } from '@/components/pet/petAccessories';
import type { PetAnimal, VirtualPet } from '@/types';

const ANIMALS: { animal: PetAnimal; label: string; emoji: string; treat: string }[] = [
  { animal: 'cat',     label: 'Cat',     emoji: '🐱', treat: '🐟' },
  { animal: 'dog',     label: 'Dog',     emoji: '🐶', treat: '🍖' },
  { animal: 'bunny',   label: 'Bunny',   emoji: '🐰', treat: '🥕' },
  { animal: 'hamster', label: 'Hamster', emoji: '🐹', treat: '🌰' },
  { animal: 'axolotl', label: 'Axolotl', emoji: '🦎', treat: '🦐' },
  { animal: 'dragon',  label: 'Dragon',  emoji: '🐲', treat: '🔥' },
];

function getAnimalMeta(animal: PetAnimal) {
  return ANIMALS.find((a) => a.animal === animal) ?? ANIMALS[0];
}

function computeLiveStats(pet: VirtualPet) {
  const now = Date.now();
  const hoursSince = (ts: string | null) => ts ? (now - new Date(ts).getTime()) / 3600000 : null;

  const hungerElapsed = hoursSince(pet.last_fed_at);
  const hunger = hungerElapsed !== null
    ? Math.max(0, Math.min(100, pet.hunger - hungerElapsed * 8))
    : pet.hunger;

  const thirstElapsed = hoursSince(pet.last_watered_at);
  const thirst = thirstElapsed !== null
    ? Math.max(0, Math.min(100, pet.thirst - thirstElapsed * 12))
    : pet.thirst;

  const happinessElapsed = hoursSince(pet.last_interacted_at);
  const happiness = happinessElapsed !== null
    ? Math.max(0, Math.min(100, pet.happiness - happinessElapsed * 3))
    : pet.happiness;

  return { hunger, thirst, happiness };
}

function getMood(hunger: number, thirst: number, happiness: number): PetMood {
  if (hunger < 25 || thirst < 25) return 'sad';
  if (happiness < 25) return 'sad';
  if (happiness > 80 && hunger > 70 && thirst > 70) return 'happy';
  return 'idle';
}

function StatBar({ label, emoji, value }: { label: string; emoji: string; value: number }) {
  const pct = Math.round(value);
  const color = value > 60 ? '#4ade80' : value > 30 ? '#fb923c' : '#f87171';
  return (
    <div className="flex items-center gap-3">
      <span className="text-xl w-7 text-center shrink-0">{emoji}</span>
      <div className="flex-1">
        <div className="flex justify-between items-center mb-1">
          <span className="text-xs font-medium text-text-muted">{label}</span>
          <span className="text-xs font-bold text-text" style={{ color }}>{pct}%</span>
        </div>
        <div className="h-2.5 rounded-full bg-surface-2 overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{ width: `${pct}%`, backgroundColor: color }}
          />
        </div>
      </div>
    </div>
  );
}

interface ActionButtonProps {
  emoji: string;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  color: string;
}

function ActionButton({ emoji, label, onClick, disabled, color }: ActionButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex flex-col items-center gap-1.5 px-4 py-3 rounded-2xl font-medium text-white transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed shadow-sm"
      style={{ background: disabled ? undefined : color, minWidth: 72 }}
    >
      <span className="text-2xl">{emoji}</span>
      <span className="text-xs">{label}</span>
    </button>
  );
}

function SetupScreen({ memberId }: { memberId: string }) {
  const { createPet } = useFamily();
  const [selectedAnimal, setSelectedAnimal] = useState<PetAnimal | null>(null);
  const [petName, setPetName] = useState('');

  const handleCreate = () => {
    if (!selectedAnimal || !petName.trim()) return;
    createPet(memberId, selectedAnimal, petName.trim());
  };

  return (
    <div className="space-y-6 max-w-lg mx-auto">
      <div className="text-center">
        <div className="text-4xl mb-2">🐾</div>
        <h2 className="font-display text-2xl text-text mb-1">Meet your new pet!</h2>
        <p className="text-sm text-text-muted">Choose your companion and give them a name.</p>
      </div>

      <div className="card p-5">
        <h3 className="text-sm font-semibold text-text-muted uppercase tracking-wider mb-4">Pick your pet</h3>
        <div className="grid grid-cols-3 gap-3">
          {ANIMALS.map(({ animal, label, emoji }) => (
            <button
              key={animal}
              onClick={() => setSelectedAnimal(animal)}
              className={
                'flex flex-col items-center gap-2 p-3 rounded-2xl border-2 transition-all active:scale-95 ' +
                (selectedAnimal === animal
                  ? 'border-accent bg-accent-soft shadow-md'
                  : 'border-border hover:border-border-strong bg-surface-2/50')
              }
            >
              <PetCanvas animal={animal} mood="idle" size={72} />
              <span className="text-xs font-medium text-text">{label}</span>
              <span className="text-lg">{emoji}</span>
            </button>
          ))}
        </div>
      </div>

      {selectedAnimal && (
        <div className="card p-5 space-y-4">
          <h3 className="text-sm font-semibold text-text-muted uppercase tracking-wider">Name your {selectedAnimal}</h3>
          <input
            type="text"
            value={petName}
            onChange={(e) => setPetName(e.target.value)}
            placeholder="e.g. Mochi, Biscuit, Starfire…"
            className="input w-full text-base"
            maxLength={20}
            autoFocus
          />
          <button
            onClick={handleCreate}
            disabled={!petName.trim()}
            className="btn-primary w-full py-3 text-base rounded-xl"
          >
            Welcome {petName.trim() || '…'}! 🎉
          </button>
        </div>
      )}
    </div>
  );
}

interface PetViewProps {
  pet: VirtualPet;
  memberId: string;
}

const ATTENTION_TIMEOUT_MS = 30_000;

const FEEDING_LINES = ['Yum!', 'So tasty!', 'Mmm!', 'Nom nom!', 'More please!'];
const WATER_LINES = ['Refreshing!', 'Ahh~', 'So thirsty.', 'Glug glug!'];
const PAT_LINES = ['I love you!', '<3', 'Tee-hee!', 'Pet me more!', 'Best human!'];
const PLAY_LINES = ["Let's go!", 'Wheee!', "I'm so happy!", 'Again!'];
const SLEEP_LINES = ['Zzz…', '*snore*', 'mmm…sleepy'];
const ATTENTION_LINES = ['Hello?', '...bored', "Look at me!", 'play with me?'];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function PetView({ pet, memberId }: PetViewProps) {
  const { feedPet, waterPet, patPet, playWithPet, wearAccessory, removeAccessory, gainXp } = useFamily();
  const [activeMood, setActiveMood] = useState<PetMood | null>(null);
  const [tick, setTick] = useState(0);
  const [showMiniGame, setShowMiniGame] = useState(false);
  const [showAccessories, setShowAccessories] = useState(false);
  const [bubbleMessage, setBubbleMessage] = useState<string | null>(null);
  const [bubbleKey, setBubbleKey] = useState(0);
  const [heartBurstTrigger, setHeartBurstTrigger] = useState(0);
  const [heartOrigin, setHeartOrigin] = useState<{ x: number; y: number } | null>(null);
  const [dropHot, setDropHot] = useState(false);
  const [attentionTrigger, setAttentionTrigger] = useState(0);
  const [pagePaused, setPagePaused] = useState(false);
  const canvasRef = useRef<PetCanvasHandle>(null);
  const lastInteractionRef = useRef<number>(Date.now());

  // Re-compute live stats every 30 seconds so bars decay
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30000);
    return () => clearInterval(id);
  }, []);
  void tick;

  // Pause animations when document is hidden — Page Visibility API
  useEffect(() => {
    const onVis = () => setPagePaused(document.hidden);
    document.addEventListener('visibilitychange', onVis);
    setPagePaused(document.hidden);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  const { hunger, thirst, happiness } = computeLiveStats(pet);
  const baseMood = getMood(hunger, thirst, happiness);
  const mood = activeMood ?? baseMood;

  const triggerMood = useCallback((m: PetMood, ms = 2000) => {
    setActiveMood(m);
    window.setTimeout(() => setActiveMood(null), ms);
  }, []);

  const speak = useCallback((text: string) => {
    setBubbleMessage(text);
    setBubbleKey((k) => k + 1);
  }, []);

  const noteInteraction = useCallback(() => {
    lastInteractionRef.current = Date.now();
  }, []);

  // Attention idle: if no interaction for ATTENTION_TIMEOUT_MS, do something cute
  useEffect(() => {
    if (pagePaused) return;
    const id = window.setInterval(() => {
      const elapsed = Date.now() - lastInteractionRef.current;
      if (elapsed >= ATTENTION_TIMEOUT_MS) {
        setAttentionTrigger((t) => t + 1);
        speak(pick(ATTENTION_LINES));
        // Reset so we don't fire again immediately
        lastInteractionRef.current = Date.now() - ATTENTION_TIMEOUT_MS / 2;
      }
    }, 10_000);
    return () => window.clearInterval(id);
  }, [pagePaused, speak]);

  const level = Math.floor(pet.xp / 100) + 1;
  const xpInLevel = pet.xp % 100;
  const nextLevelXp = 100;
  const hasPlay = pet.unlocked_actions.includes('play');
  const hasSuperPat = pet.unlocked_actions.includes('super_pat');

  const animalMeta = getAnimalMeta(pet.animal);
  const stage = xpToStage(pet.xp);
  const stageLabel = stage === 'baby' ? 'Baby' : stage === 'child' ? 'Junior' : 'Adult';

  const accessoriesWorn = Array.isArray(pet.accessories) ? pet.accessories : [];

  // ---- Click-to-pat ----

  const handlePetClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    // Squash+bounce + heart burst + pat
    canvasRef.current?.reactSquash();
    const rect = e.currentTarget.getBoundingClientRect();
    setHeartOrigin({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    });
    setHeartBurstTrigger((t) => t + 1);
    patPet(memberId);
    triggerMood('happy', 1500);
    speak(pick(PAT_LINES));
    noteInteraction();
  }, [patPet, memberId, triggerMood, speak, noteInteraction]);

  // ---- Treat tray (drag-to-feed) ----

  const onTreatDragStart = (e: React.DragEvent<HTMLDivElement>) => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', 'pet-treat');
  };

  const handleTreatDrop = useCallback(() => {
    if (hunger >= 95) return;
    feedPet(memberId);
    triggerMood('eating', 1800);
    canvasRef.current?.reactSquish();
    speak(pick(FEEDING_LINES));
    noteInteraction();
  }, [feedPet, memberId, triggerMood, hunger, speak, noteInteraction]);

  // ---- Standard buttons ----

  const handleFeed = () => {
    if (hunger >= 95) return;
    feedPet(memberId);
    triggerMood('eating', 1800);
    canvasRef.current?.reactSquish();
    speak(pick(FEEDING_LINES));
    noteInteraction();
  };
  const handleWater = () => {
    if (thirst >= 95) return;
    waterPet(memberId);
    triggerMood('drinking', 1800);
    canvasRef.current?.reactSquish();
    speak(pick(WATER_LINES));
    noteInteraction();
  };
  const handlePat = () => {
    patPet(memberId);
    triggerMood('happy', 1500);
    canvasRef.current?.reactSquash();
    setHeartOrigin({ x: 90, y: 90 });
    setHeartBurstTrigger((t) => t + 1);
    speak(pick(PAT_LINES));
    noteInteraction();
  };
  const handlePlay = () => {
    playWithPet(memberId);
    triggerMood('happy', 1500);
    canvasRef.current?.reactSquash();
    speak(pick(PLAY_LINES));
    noteInteraction();
  };

  // ---- Sleeping idle bubble (lightweight: only triggered on mount + on mood change) ----

  useEffect(() => {
    if (mood === 'sleeping') {
      speak(pick(SLEEP_LINES));
    }
  }, [mood, speak]);

  // ---- Accessory wear/remove ----

  const onToggleAccessory = useCallback((a: Accessory) => {
    if (accessoriesWorn.includes(a.id)) {
      removeAccessory(memberId, a.id);
      return;
    }
    // Replace any currently-worn item in the same slot
    const sameSlot = wornForSlot(accessoriesWorn, a.slot);
    if (sameSlot) removeAccessory(memberId, sameSlot.id);
    wearAccessory(memberId, a.id);
  }, [accessoriesWorn, memberId, removeAccessory, wearAccessory]);

  const upcoming = useMemo(() => nextUnlock(pet.xp), [pet.xp]);

  return (
    <div className="max-w-lg mx-auto space-y-5">
      {/* Header */}
      <div className="card p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-3xl">{animalMeta.emoji}</span>
          <div>
            <h2 className="font-display text-xl text-text leading-tight">{pet.name}</h2>
            <p className="text-xs text-text-muted capitalize">
              {pet.animal} · {stageLabel}
            </p>
          </div>
        </div>
        <div className="text-right">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-bold text-white shadow-sm"
            style={{ background: 'linear-gradient(135deg, #f59e0b, #ef4444)' }}>
            ⭐ Level {level}
          </div>
        </div>
      </div>

      {/* Pet canvas — interactive */}
      <div className="card p-6 flex flex-col items-center gap-2 relative">
        <div className={'relative ' + (dropHot ? 'pet-drop-hot' : '')}>
          <PetCanvas
            ref={canvasRef}
            animal={pet.animal}
            mood={mood}
            size={200}
            xp={pet.xp}
            accessories={accessoriesWorn}
            interactive
            onPetClick={handlePetClick}
            onTreatDrop={handleTreatDrop}
            onTreatDragOver={setDropHot}
            attentionTrigger={attentionTrigger}
            paused={pagePaused}
          />
          {/* Speech bubble — anchored above the pet */}
          <SpeechBubble messageKey={bubbleKey} text={bubbleMessage} />
          {/* Heart burst — positioned at the click point */}
          <HeartBurst trigger={heartBurstTrigger} origin={heartOrigin} />
          {mood === 'sad' && (
            <div className="absolute top-2 left-1/2 -translate-x-1/2 text-lg opacity-70">😢</div>
          )}
        </div>
        <p className="text-xs text-text-faint italic mt-1">
          {mood === 'happy' ? `${pet.name} is absolutely thriving!` :
           mood === 'sad' ? `${pet.name} needs some attention…` :
           mood === 'eating' ? `${pet.name} is munching away!` :
           mood === 'drinking' ? `${pet.name} is drinking!` :
           mood === 'sleeping' ? `Shh… ${pet.name} is sleeping.` :
           `${pet.name} is relaxing. Click them or drag a treat!`}
        </p>

        {/* Treat tray — drag onto the pet to feed */}
        <div className="mt-3 flex items-center gap-2 px-3 py-2 rounded-xl bg-surface-2/70 border border-border">
          <span className="text-xs font-medium text-text-muted shrink-0">Drag a treat:</span>
          <div className="flex gap-1.5">
            {[animalMeta.treat, '🍎', '🍪', '🥩'].map((emoji, i) => (
              <div
                key={i}
                draggable
                onDragStart={onTreatDragStart}
                onDragEnd={() => setDropHot(false)}
                className="treat-drag select-none text-2xl px-2 py-1 rounded-lg bg-surface hover:bg-accent-soft transition-colors"
                title="Drag onto your pet"
                aria-label={`Drag ${emoji} onto your pet to feed them`}
              >
                {emoji}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="card p-5 space-y-4">
        <h3 className="text-sm font-semibold text-text-muted uppercase tracking-wider">Stats</h3>
        <StatBar emoji="😋" label="Hunger" value={hunger} />
        <StatBar emoji="💧" label="Thirst" value={thirst} />
        <StatBar emoji="😊" label="Happiness" value={happiness} />
      </div>

      {/* Actions */}
      <div className="card p-5">
        <h3 className="text-sm font-semibold text-text-muted uppercase tracking-wider mb-4">Actions</h3>
        <div className="flex flex-wrap gap-3 justify-center">
          <ActionButton emoji="🍎" label="Feed" color="#ef4444"
            disabled={hunger >= 95} onClick={handleFeed} />
          <ActionButton emoji="💧" label="Water" color="#3b82f6"
            disabled={thirst >= 95} onClick={handleWater} />
          <ActionButton emoji="❤️" label="Pat" color="#ec4899" onClick={handlePat} />
          {hasPlay && (
            <ActionButton emoji="🎮" label="Play" color="#8b5cf6" onClick={handlePlay} />
          )}
          {hasSuperPat && (
            <ActionButton emoji="🌟" label="Super Pat" color="#f59e0b" onClick={handlePat} />
          )}
          <ActionButton
            emoji="🎯"
            label="Mini-game"
            color="#0ea5e9"
            onClick={() => setShowMiniGame((v) => !v)}
          />
          <ActionButton
            emoji="👒"
            label="Wardrobe"
            color="#a855f7"
            onClick={() => setShowAccessories((v) => !v)}
          />
        </div>
      </div>

      {/* Mini-game */}
      {showMiniGame && (
        <MiniGame
          xpPerCatch={2}
          paused={pagePaused}
          onEnd={(score) => {
            if (score > 0) {
              gainXp(memberId, score * 2);
              speak(`+${score * 2} XP!`);
              noteInteraction();
            }
          }}
        />
      )}

      {/* Accessories */}
      {showAccessories && (
        <div className="card p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-text-muted uppercase tracking-wider">Wardrobe</h3>
            {upcoming && (
              <p className="text-xs text-text-faint">
                Next: <span className="font-medium">{upcoming.emoji} {upcoming.label}</span>
                {' '}at {upcoming.unlockXp} XP
              </p>
            )}
          </div>
          <div className="grid grid-cols-3 gap-2">
            {ACCESSORIES.map((a) => {
              const locked = pet.xp < a.unlockXp;
              const worn = accessoriesWorn.includes(a.id);
              return (
                <button
                  key={a.id}
                  disabled={locked}
                  onClick={() => onToggleAccessory(a)}
                  className={
                    'p-3 rounded-2xl border-2 text-center transition-all active:scale-95 ' +
                    (worn
                      ? 'border-accent bg-accent-soft shadow-md'
                      : locked
                        ? 'border-border bg-surface-2/40 opacity-50 cursor-not-allowed'
                        : 'border-border hover:border-border-strong bg-surface-2/50')
                  }
                  title={locked ? `Unlocks at ${a.unlockXp} XP` : a.hint}
                >
                  <div className="text-2xl mb-1">{locked ? '🔒' : a.emoji}</div>
                  <div className="text-xs font-medium text-text">{a.label}</div>
                  <div className="text-[10px] text-text-faint capitalize">{a.slot}</div>
                  {locked && (
                    <div className="text-[10px] text-text-faint mt-0.5">{a.unlockXp} XP</div>
                  )}
                  {worn && (
                    <div className="text-[10px] text-accent font-semibold mt-0.5">Wearing</div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* XP & Level */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-text-muted uppercase tracking-wider">Experience</h3>
          <span className="text-sm font-bold text-text">{pet.xp} XP</span>
        </div>
        <div className="mb-2">
          <div className="flex justify-between text-xs text-text-faint mb-1">
            <span>Level {level}</span>
            <span>Level {level + 1}</span>
          </div>
          <div className="h-3 rounded-full bg-surface-2 overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{
                width: `${(xpInLevel / nextLevelXp) * 100}%`,
                background: 'linear-gradient(90deg, #f59e0b, #ef4444)',
              }}
            />
          </div>
          <p className="text-xs text-text-faint mt-1.5 text-center">
            {xpInLevel} / {nextLevelXp} XP to Level {level + 1}
          </p>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2">
          <StageChip label="Baby" active={stage === 'baby'} hint="Lv 1–3" />
          <StageChip label="Junior" active={stage === 'child'} hint="Lv 4–7" />
          <StageChip label="Adult" active={stage === 'adult'} hint="Lv 8+" />
        </div>
        <div className="mt-3 p-3 rounded-xl bg-accent-soft/50 text-center">
          <p className="text-xs text-text-muted">
            Complete chores (+10 XP), habits (+5 XP), or play the mini-game (+2 XP each catch) to grow!
          </p>
        </div>
      </div>
    </div>
  );
}

function StageChip({ label, active, hint }: { label: string; active: boolean; hint: string }) {
  return (
    <div className={
      'text-center rounded-xl py-2 border ' +
      (active
        ? 'bg-accent text-white border-accent shadow-sm'
        : 'bg-surface-2/60 text-text-muted border-border')
    }>
      <div className="text-xs font-semibold">{label}</div>
      <div className={'text-[10px] ' + (active ? 'text-white/80' : 'text-text-faint')}>{hint}</div>
    </div>
  );
}

export function PetPage() {
  const { activeMember, getPet } = useFamily();

  if (!activeMember) return null;

  const pet = getPet(activeMember.id);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-2xl text-text">Virtual Pet</h1>
        <p className="text-sm text-text-muted">Your kawaii companion</p>
      </div>

      {!pet ? (
        <SetupScreen memberId={activeMember.id} />
      ) : (
        <PetView pet={pet} memberId={activeMember.id} />
      )}
    </div>
  );
}
