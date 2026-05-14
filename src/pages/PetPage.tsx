import { useState, useEffect, useCallback } from 'react';
import { useFamily } from '@/context/FamilyContext';
import { PetCanvas, type PetMood } from '@/components/pet/PetCanvas';
import type { PetAnimal, VirtualPet } from '@/types';

const ANIMALS: { animal: PetAnimal; label: string; emoji: string }[] = [
  { animal: 'cat', label: 'Cat', emoji: '🐱' },
  { animal: 'dog', label: 'Dog', emoji: '🐶' },
  { animal: 'bunny', label: 'Bunny', emoji: '🐰' },
  { animal: 'hamster', label: 'Hamster', emoji: '🐹' },
  { animal: 'axolotl', label: 'Axolotl', emoji: '🦎' },
  { animal: 'dragon', label: 'Dragon', emoji: '🐲' },
];

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

function PetView({ pet, memberId }: PetViewProps) {
  const { feedPet, waterPet, patPet, playWithPet } = useFamily();
  const [activeMood, setActiveMood] = useState<PetMood | null>(null);
  const [tick, setTick] = useState(0);

  // Re-compute live stats every 30 seconds
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30000);
    return () => clearInterval(id);
  }, []);

  const { hunger, thirst, happiness } = computeLiveStats(pet);
  const baseMood = getMood(hunger, thirst, happiness);
  const mood = activeMood ?? baseMood;

  const triggerMood = useCallback((m: PetMood) => {
    setActiveMood(m);
    setTimeout(() => setActiveMood(null), 2000);
  }, []);

  const level = Math.floor(pet.xp / 100) + 1;
  const xpInLevel = pet.xp % 100;
  const nextLevelXp = 100;
  const nextUnlockXp = pet.xp < 50 ? 50 : pet.xp < 150 ? 150 : pet.xp < 300 ? 300 : null;
  const hasPlay = pet.unlocked_actions.includes('play');
  const hasSuperPat = pet.unlocked_actions.includes('super_pat');

  const animalEmoji = ANIMALS.find((a) => a.animal === pet.animal)?.emoji ?? '🐾';

  // suppress unused variable warning from tick
  void tick;

  return (
    <div className="max-w-lg mx-auto space-y-5">
      {/* Header */}
      <div className="card p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-3xl">{animalEmoji}</span>
          <div>
            <h2 className="font-display text-xl text-text leading-tight">{pet.name}</h2>
            <p className="text-xs text-text-muted capitalize">{pet.animal}</p>
          </div>
        </div>
        <div className="text-right">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-bold text-white shadow-sm"
            style={{ background: 'linear-gradient(135deg, #f59e0b, #ef4444)' }}>
            ⭐ Level {level}
          </div>
        </div>
      </div>

      {/* Pet canvas */}
      <div className="card p-6 flex flex-col items-center gap-2">
        <div className="relative">
          <PetCanvas animal={pet.animal} mood={mood} size={180} />
          {mood === 'happy' && (
            <div className="absolute -top-2 -right-2 text-2xl pet-sparkle" style={{ animationDelay: '0.2s' }}>✨</div>
          )}
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
           `${pet.name} is relaxing.`}
        </p>
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
          <ActionButton
            emoji="🍎"
            label="Feed"
            color="#ef4444"
            disabled={hunger >= 95}
            onClick={() => { feedPet(memberId); triggerMood('eating'); }}
          />
          <ActionButton
            emoji="💧"
            label="Water"
            color="#3b82f6"
            disabled={thirst >= 95}
            onClick={() => { waterPet(memberId); triggerMood('drinking'); }}
          />
          <ActionButton
            emoji="❤️"
            label="Pat"
            color="#ec4899"
            onClick={() => { patPet(memberId); triggerMood('happy'); }}
          />
          {hasPlay && (
            <ActionButton
              emoji="🎮"
              label="Play"
              color="#8b5cf6"
              onClick={() => { playWithPet(memberId); triggerMood('happy'); }}
            />
          )}
          {hasSuperPat && (
            <ActionButton
              emoji="🌟"
              label="Super Pat"
              color="#f59e0b"
              onClick={() => { patPet(memberId); triggerMood('happy'); }}
            />
          )}
        </div>
      </div>

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
        {nextUnlockXp && !hasPlay && (
          <div className="mt-3 p-3 rounded-xl bg-surface-2/60 text-center">
            <p className="text-xs text-text-muted">
              🎮 <span className="font-semibold">Play</span> unlocks at {nextUnlockXp} XP
              {' '}· {nextUnlockXp - pet.xp} XP to go
            </p>
          </div>
        )}
        {hasPlay && !hasSuperPat && (
          <div className="mt-3 p-3 rounded-xl bg-surface-2/60 text-center">
            <p className="text-xs text-text-muted">
              🌟 <span className="font-semibold">Super Pat</span> unlocks at 150 XP
              {' '}· {150 - pet.xp} XP to go
            </p>
          </div>
        )}
        {pet.xp < 300 && hasSuperPat && (
          <div className="mt-3 p-3 rounded-xl bg-surface-2/60 text-center">
            <p className="text-xs text-text-muted">
              🎪 <span className="font-semibold">Trick</span> unlocks at 300 XP
              {' '}· {300 - pet.xp} XP to go
            </p>
          </div>
        )}
        <div className="mt-3 p-3 rounded-xl bg-accent-soft/50 text-center">
          <p className="text-xs text-text-muted">
            Complete chores (+10 XP) and habits (+5 XP) to level up!
          </p>
        </div>
      </div>
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
