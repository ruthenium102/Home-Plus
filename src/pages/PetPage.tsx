import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { storage } from '@/lib/storage';
import { useMembersData, usePetData, useFamilyActions } from '@/context/FamilyContext';
import { useTheme } from '@/context/ThemeContext';
import { getColorTokens, MEMBER_COLORS } from '@/lib/colors';
import { usePointerDragToDrop } from '@/hooks/usePointerDragToDrop';
import {
  PetCanvas,
  xpToStage,
  STAGE_RANK,
  type PetMood,
  type PetStage,
  type PetCanvasHandle,
} from '@/components/pet/PetCanvas';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { SpeechBubble } from '@/components/pet/SpeechBubble';
import { HeartBurst } from '@/components/pet/HeartBurst';
import { MiniGame } from '@/components/pet/MiniGame';
import {
  ACCESSORIES,
  findAccessory,
  wornForSlot,
  type Accessory,
} from '@/components/pet/petAccessories';
import {
  dailyQuests,
  rollQuestState,
  questProgress,
  isQuestComplete,
} from '@/components/pet/petQuests';
import { ACHIEVEMENTS, findAchievement } from '@/components/pet/petAchievements';
import { playPetSound, isPetSoundMuted, setPetSoundMuted } from '@/lib/petSounds';
import { hapticLight } from '@/lib/native';
import { Volume2, VolumeX } from 'lucide-react';
import { PET_PICKER, speciesMeta } from '@/components/pet/petSpecies';
import type { PetAnimal, VirtualPet } from '@/types';

function computeLiveStats(pet: VirtualPet) {
  const now = Date.now();
  const hoursSince = (ts: string | null) => (ts ? (now - new Date(ts).getTime()) / 3600000 : null);

  const hungerElapsed = hoursSince(pet.last_fed_at);
  const hunger =
    hungerElapsed !== null
      ? Math.max(0, Math.min(100, pet.hunger - hungerElapsed * 8))
      : pet.hunger;

  const thirstElapsed = hoursSince(pet.last_watered_at);
  const thirst =
    thirstElapsed !== null
      ? Math.max(0, Math.min(100, pet.thirst - thirstElapsed * 12))
      : pet.thirst;

  const happinessElapsed = hoursSince(pet.last_interacted_at);
  const happiness =
    happinessElapsed !== null
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

function StatBar({
  label,
  emoji,
  value,
  isDark,
}: {
  label: string;
  emoji: string;
  value: number;
  isDark: boolean;
}) {
  const pct = Math.round(value);
  // Warm-brand status palette: sage (good) → sand (warn) → terracotta (low),
  // theme-aware via the shared color tokens.
  const colorKey = value > 60 ? 'sage' : value > 30 ? 'sand' : 'terracotta';
  const color = getColorTokens(colorKey, isDark).base;
  return (
    <div className="flex items-center gap-3">
      <span className="text-xl w-7 text-center shrink-0">{emoji}</span>
      <div className="flex-1">
        <div className="flex justify-between items-center mb-1">
          <span className="text-xs font-medium text-text-muted">{label}</span>
          <span className="text-xs font-bold text-text" style={{ color }}>
            {pct}%
          </span>
        </div>
        <div className="h-2.5 rounded-full bg-surface-2 overflow-hidden">
          {/* translateX (compositor) instead of width (layout) — several bars
              can animate at once next to the pet's CSS loops */}
          <div
            className="h-full w-full rounded-full transition-transform duration-700"
            style={{ transform: `translateX(${pct - 100}%)`, backgroundColor: color }}
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
      className="flex flex-col items-center gap-1.5 px-4 py-3 rounded-2xl font-medium text-white transition-[transform,opacity,background-color,border-color,color,box-shadow] active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed shadow-sm"
      style={{ background: disabled ? undefined : color, minWidth: 72 }}
    >
      <span className="text-2xl">{emoji}</span>
      <span className="text-xs">{label}</span>
    </button>
  );
}

function SetupScreen({
  memberId,
  hasExisting = false,
  onCancel,
  onCreated,
}: {
  memberId: string;
  hasExisting?: boolean;
  onCancel?: () => void;
  onCreated?: () => void;
}) {
  const { createPet } = useFamilyActions();
  const [selectedAnimal, setSelectedAnimal] = useState<PetAnimal | null>(null);
  const [petName, setPetName] = useState('');

  const handleCreate = () => {
    if (!selectedAnimal || !petName.trim()) return;
    createPet(memberId, selectedAnimal, petName.trim());
    onCreated?.();
  };

  return (
    <div className="space-y-6 max-w-lg mx-auto">
      <div className="text-center">
        <div className="text-4xl mb-2">🐾</div>
        <h2 className="font-display text-2xl text-text mb-1">
          {hasExisting ? 'Choose a new pet' : 'Meet your new pet!'}
        </h2>
        <p className="text-sm text-text-muted">Choose your companion and give them a name.</p>
        {hasExisting && (
          <>
            <p className="text-xs text-text-faint mt-2">
              Heads up: this replaces your current pet.
            </p>
            {onCancel && (
              <button
                onClick={onCancel}
                className="mt-3 text-sm text-text-muted hover:text-text underline underline-offset-2"
              >
                ← Keep my current pet
              </button>
            )}
          </>
        )}
      </div>

      <div className="card p-5">
        <h3 className="text-sm font-semibold text-text-muted uppercase tracking-wider mb-4">
          Pick your pet
        </h3>
        <div className="grid grid-cols-3 gap-3">
          {PET_PICKER.map(({ animal, label, emoji }) => (
            <button
              key={animal}
              onClick={() => setSelectedAnimal(animal)}
              className={
                'flex flex-col items-center gap-2 p-3 rounded-2xl border-2 transition-[transform,opacity,background-color,border-color,color,box-shadow] active:scale-95 ' +
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
          <h3 className="text-sm font-semibold text-text-muted uppercase tracking-wider">
            Name {selectedAnimal}
          </h3>
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
  onNewPet: () => void;
}

const ATTENTION_TIMEOUT_MS = 30_000;

const FEEDING_LINES = ['Yum!', 'So tasty!', 'Mmm!', 'Nom nom!', 'More please!'];
const WATER_LINES = ['Refreshing!', 'Ahh~', 'So thirsty.', 'Glug glug!'];
const PAT_LINES = ['I love you!', '<3', 'Tee-hee!', 'Pet me more!', 'Best human!'];
const PLAY_LINES = ["Let's go!", 'Wheee!', "I'm so happy!", 'Again!'];
const SLEEP_LINES = ['Zzz…', '*snore*', 'mmm…sleepy'];
const ATTENTION_LINES = ['Hello?', '...bored', 'Look at me!', 'play with me?'];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function PetView({ pet, memberId, onNewPet }: PetViewProps) {
  const {
    feedPet,
    waterPet,
    patPet,
    playWithPet,
    wearAccessory,
    removeAccessory,
    buyAccessory,
    claimQuest,
    finishMiniGame,
  } = useFamilyActions();
  const { members } = useMembersData();
  const { resolved } = useTheme();
  const isDark = resolved === 'dark';
  const member = members.find((m) => m.id === memberId);
  const tokens = getColorTokens(member?.color ?? 'terracotta', isDark);

  // Action buttons drawn from the warm brand palette instead of bright web-app
  // primaries. `strong` (not `base`): these are filled controls with white
  // labels, and the lifted dark `base` values fail WCAG AA under white text.
  const actionColors = useMemo(
    () => ({
      feed: getColorTokens('terracotta', isDark).strong,
      water: getColorTokens('dusty-blue', isDark).strong,
      pat: getColorTokens('rose', isDark).strong,
      play: getColorTokens('plum', isDark).strong,
      superPat: getColorTokens('sand', isDark).strong,
      miniGame: getColorTokens('sage', isDark).strong,
      wardrobe: getColorTokens('olive', isDark).strong,
      awards: getColorTokens('sand', isDark).strong,
    }),
    [isDark],
  );
  const [activeMood, setActiveMood] = useState<PetMood | null>(null);
  const [tick, setTick] = useState(0);
  const [showMiniGame, setShowMiniGame] = useState(false);
  const [showAccessories, setShowAccessories] = useState(false);
  const [showAwards, setShowAwards] = useState(false);
  const [evolvedStage, setEvolvedStage] = useState<PetStage | null>(null);
  const [soundMuted, setSoundMuted] = useState(isPetSoundMuted);
  const [activeTreat, setActiveTreat] = useState<number | null>(null);
  const [confirmNewPet, setConfirmNewPet] = useState(false);
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

  const animalMeta = speciesMeta(pet.animal);
  const stage = xpToStage(pet.xp);
  const stageLabel =
    stage === 'baby'
      ? 'Baby'
      : stage === 'child'
        ? 'Junior'
        : stage === 'adult'
          ? 'Adult'
          : 'Legend';

  // ---- Evolution celebration (phase 4) ----
  // Remember the last stage this device has seen per pet; when the live stage
  // outranks it, throw a little party. First visit just records the baseline.
  useEffect(() => {
    // Through the shared `storage` wrapper (hp:-prefixed) like every other
    // persisted UI flag — with a one-time migration of the raw legacy key
    // written by v1.0.118–127 so nobody re-celebrates an old evolution.
    const key = `pet_stage_seen:${pet.id}`;
    let seen = storage.get<PetStage | null>(key, null);
    if (!seen) {
      const legacy = localStorage.getItem(key) as PetStage | null;
      if (legacy) {
        seen = legacy;
        localStorage.removeItem(key);
      }
    }
    if (seen && seen !== stage && STAGE_RANK[stage] > (STAGE_RANK[seen] ?? 0)) {
      setEvolvedStage(stage);
      playPetSound('evolve');
    }
    storage.set(key, stage);
  }, [pet.id, stage]);

  // ---- Daily quests + achievements (phase 4) ----
  const questState = rollQuestState(pet);
  const todaysQuests = dailyQuests(pet, questState.date);
  const earnedAchievements = pet.achievements ?? [];

  // Announce freshly earned achievements via the speech bubble. Track per pet
  // id so switching members doesn't produce phantom announcements.
  const achievementsSeenRef = useRef<{ petId: string; ids: string[] } | null>(null);
  useEffect(() => {
    const prev = achievementsSeenRef.current;
    if (prev && prev.petId === pet.id) {
      const added = earnedAchievements.filter((id) => !prev.ids.includes(id));
      const latest = added.length > 0 ? findAchievement(added[added.length - 1]) : undefined;
      if (latest) speak(`🏆 ${latest.label}!`);
    }
    achievementsSeenRef.current = { petId: pet.id, ids: earnedAchievements };
  }, [pet.id, earnedAchievements, speak]);

  const accessoriesWorn = Array.isArray(pet.accessories) ? pet.accessories : [];
  const owned = Array.isArray(pet.owned_accessories) ? pet.owned_accessories : [];
  const coins = pet.coins ?? 0;
  const careStreak = pet.care_streak ?? 0;
  const wornChips = accessoriesWorn
    .map(findAccessory)
    .filter((a): a is Accessory => Boolean(a));

  // ---- Click-to-pat ----

  const handlePetClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
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
      playPetSound('pat');
      noteInteraction();
    },
    [patPet, memberId, triggerMood, speak, noteInteraction],
  );

  // ---- Treat tray (drag-to-feed) ----
  //
  // HTML5 drag-and-drop does not work on iOS touch, so the treat chips use the
  // shared pointer-drag-to-drop helper: drag a chip onto the pet drop zone
  // (marked `data-pet-drop`) and release to feed.

  const handleTreatDrop = useCallback(() => {
    if (hunger >= 95) return;
    feedPet(memberId);
    triggerMood('eating', 1800);
    canvasRef.current?.reactSquish();
    speak(pick(FEEDING_LINES));
    playPetSound('feed');
    noteInteraction();
  }, [feedPet, memberId, triggerMood, hunger, speak, noteInteraction]);

  const treatDrag = usePointerDragToDrop<string>({
    dropAttr: 'pet-drop',
    onDrop: () => handleTreatDrop(),
    onOverChange: (dropId) => setDropHot(dropId !== null),
    // Hold to pick a treat up, then drag onto the pet — a brief long-press so a
    // scroll flick over the tray doesn't accidentally grab a treat. The chips
    // carry touch-action:none (below) so the hold isn't stolen by page scroll.
    holdToStart: 160,
    // Forgiving cancel threshold: there's no scroll to disambiguate from here,
    // so tolerate a little finger wobble during the hold before cancelling.
    threshold: 12,
    onPickUp: () => {
      void hapticLight();
      playPetSound('catch');
    },
    // Floating ghost: the treat emoji physically rides the finger to the pet,
    // the same lift-and-carry feel as the meal-planner recipe drag.
    makeGhost: (emoji) => {
      const el = document.createElement('div');
      el.textContent = emoji;
      el.style.cssText =
        'position:fixed;left:0;top:0;z-index:200;pointer-events:none;' +
        'font-size:40px;line-height:1;' +
        'filter:drop-shadow(0 10px 18px rgba(0,0,0,0.35));';
      return el;
    },
    // Centre the treat just above the fingertip so it stays visible under a
    // real finger (a +10/+10 corner offset reads fine for a mouse, not touch).
    ghostOffset: { x: -20, y: -48 },
  });

  // Clear the lifted-treat highlight once a drag finishes.
  useEffect(() => {
    if (!treatDrag.isDragging) setActiveTreat(null);
  }, [treatDrag.isDragging]);

  // ---- Standard buttons ----

  const handleFeed = () => {
    if (hunger >= 95) return;
    feedPet(memberId);
    triggerMood('eating', 1800);
    canvasRef.current?.reactSquish();
    speak(pick(FEEDING_LINES));
    playPetSound('feed');
    noteInteraction();
  };
  const handleWater = () => {
    if (thirst >= 95) return;
    waterPet(memberId);
    triggerMood('drinking', 1800);
    canvasRef.current?.reactSquish();
    speak(pick(WATER_LINES));
    playPetSound('water');
    noteInteraction();
  };
  const handlePat = () => {
    patPet(memberId);
    triggerMood('happy', 1500);
    canvasRef.current?.reactSquash();
    setHeartOrigin({ x: 90, y: 90 });
    setHeartBurstTrigger((t) => t + 1);
    speak(pick(PAT_LINES));
    playPetSound('pat');
    noteInteraction();
  };
  const handlePlay = () => {
    playWithPet(memberId);
    triggerMood('happy', 1500);
    canvasRef.current?.reactSquash();
    speak(pick(PLAY_LINES));
    playPetSound('play');
    noteInteraction();
  };

  // ---- Sleeping idle bubble (lightweight: only triggered on mount + on mood change) ----

  useEffect(() => {
    if (mood === 'sleeping') {
      speak(pick(SLEEP_LINES));
    }
  }, [mood, speak]);

  // ---- Quests: claim rewards ----

  const onClaimQuest = useCallback(
    (questId: string, rewardCoins: number) => {
      claimQuest(memberId, questId, rewardCoins);
      triggerMood('happy', 1500);
      speak(`+${rewardCoins} 🪙 Quest done!`);
      playPetSound('reward');
      noteInteraction();
    },
    [claimQuest, memberId, triggerMood, speak, noteInteraction],
  );

  // ---- Shop: buy / equip ----

  // Tap a shop item: buy it if not owned (and affordable), otherwise toggle it
  // on/off — equipping replaces any item already worn in the same slot.
  const onTapAccessory = useCallback(
    (a: Accessory) => {
      if (!owned.includes(a.id)) {
        if (coins < a.price) {
          speak('Not enough coins!');
          return;
        }
        buyAccessory(memberId, a.id, a.price);
        speak(`Got the ${a.label}!`);
        return;
      }
      if (accessoriesWorn.includes(a.id)) {
        removeAccessory(memberId, a.id);
        return;
      }
      const sameSlot = wornForSlot(accessoriesWorn, a.slot);
      if (sameSlot) removeAccessory(memberId, sameSlot.id);
      wearAccessory(memberId, a.id);
    },
    [owned, coins, accessoriesWorn, memberId, buyAccessory, removeAccessory, wearAccessory, speak],
  );

  return (
    // Phone: single centred column. lg+ (iPad landscape): two-column grid —
    // hero (canvas + stats) sticky on the left, the long interactive stack
    // (quests/actions/awards/shop/XP) on the right — matching the landscape
    // layouts every other page uses instead of a phone column with dead
    // margins.
    <div className="max-w-lg lg:max-w-5xl mx-auto space-y-5">
      {/* Header */}
      <div className="card p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-3xl">{animalMeta.emoji}</span>
          <div>
            <h2 className="font-display text-xl text-text leading-tight">{pet.name}</h2>
            <p className="text-xs text-text-muted capitalize">
              {animalMeta.label} · {stageLabel}
            </p>
            <div className="mt-1 flex items-center gap-2.5 text-xs">
              <span className="inline-flex items-center gap-1 font-semibold text-text" title="Coins">
                🪙 {coins}
              </span>
              {careStreak > 1 && (
                <span
                  className="inline-flex items-center gap-1 text-text-muted"
                  title="Daily care streak"
                >
                  🔥 {careStreak}-day
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              const next = setPetSoundMuted();
              setSoundMuted(next);
              if (!next) playPetSound('pat');
            }}
            className="icon-btn rounded-full text-text-muted border border-border hover:bg-surface-2 transition-colors"
            title={soundMuted ? 'Unmute pet sounds' : 'Mute pet sounds'}
            aria-label={soundMuted ? 'Unmute pet sounds' : 'Mute pet sounds'}
          >
            {soundMuted ? <VolumeX size={15} /> : <Volume2 size={15} />}
          </button>
          <button
            onClick={() => setConfirmNewPet(true)}
            className="px-3 py-1.5 rounded-full text-xs font-semibold border border-border hover:bg-surface-2 transition-colors"
            title="Start a new animal"
          >
            🔄 New pet
          </button>
          <div
            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-bold shadow-sm text-white"
            style={{
              // `strong` fills: white label passes AA in both themes.
              background: `linear-gradient(135deg, ${MEMBER_COLORS.sand.strong}, ${tokens.strong})`,
            }}
          >
            ⭐ Level {level}
          </div>
        </div>
      </div>

      <div className="lg:grid lg:grid-cols-[400px_minmax(0,1fr)] lg:gap-5 lg:items-start">
        <div className="space-y-5 lg:sticky lg:top-4">
      {/* Pet canvas — interactive */}
      <div className="card p-6 flex flex-col items-center gap-2 relative">
        <div data-pet-drop="pet" className={'relative ' + (dropHot ? 'pet-drop-hot' : '')}>
          <PetCanvas
            ref={canvasRef}
            animal={pet.animal}
            mood={mood}
            size={200}
            xp={pet.xp}
            interactive
            onPetClick={handlePetClick}
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

        {/* Currently wearing — shown as tidy chips rather than overlaid on the
            illustration (which can't align across species). */}
        {wornChips.length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap justify-center">
            <span className="text-[11px] text-text-faint">Wearing</span>
            {wornChips.map((a) => (
              <span
                key={a.id}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-surface-2 border border-border text-xs"
                title={a.label}
              >
                <span>{a.emoji}</span>
                <span className="text-text-muted">{a.label}</span>
              </span>
            ))}
          </div>
        )}
        <p className="text-xs text-text-faint italic mt-1">
          {mood === 'happy'
            ? `${pet.name} is absolutely thriving!`
            : mood === 'sad'
              ? `${pet.name} needs some attention…`
              : mood === 'eating'
                ? `${pet.name} is munching away!`
                : mood === 'drinking'
                  ? `${pet.name} is drinking!`
                  : mood === 'sleeping'
                    ? `Shh… ${pet.name} is sleeping.`
                    : `${pet.name} is relaxing. Click them or drag a treat!`}
        </p>

        {/* Treat tray — hold a treat to pick it up, then drag onto the pet */}
        <div className="mt-3 flex items-center gap-2 px-3 py-2 rounded-xl bg-surface-2/70 border border-border">
          <span className="text-xs font-medium text-text-muted shrink-0">Hold &amp; drag:</span>
          <div className="flex gap-1.5">
            {[animalMeta.treat, '🍎', '🍪', '🥩'].map((emoji, i) => (
              <div
                key={i}
                onPointerDown={(e) => {
                  setActiveTreat(i);
                  treatDrag.start(emoji, e);
                }}
                className={
                  'treat-drag select-none text-2xl px-2 py-1 rounded-lg bg-surface hover:bg-accent-soft transition-opacity ' +
                  // The picked-up treat rides the finger as a floating ghost,
                  // so its tray slot dims like an emptied slot (meal-planner
                  // pattern) instead of scaling in place.
                  (treatDrag.isDragging && activeTreat === i ? 'opacity-30' : '')
                }
                // touch-action:none always, so on touch the hold-to-pick-up
                // gesture is never stolen by the page scroller (the bug where
                // dragging a treat just scrolled the page).
                style={{ touchAction: 'none' }}
                title="Hold, then drag onto your pet"
                aria-label={`Hold ${emoji}, then drag onto your pet to feed them`}
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
        <StatBar emoji="😋" label="Hunger" value={hunger} isDark={isDark} />
        <StatBar emoji="💧" label="Thirst" value={thirst} isDark={isDark} />
        <StatBar emoji="😊" label="Happiness" value={happiness} isDark={isDark} />
      </div>
        </div>

        <div className="space-y-5 mt-5 lg:mt-0">
      {/* Daily quests — three per day, deterministic per pet */}
      <div className="card p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-text-muted uppercase tracking-wider">
            Today's Quests
          </h3>
          <span className="text-xs text-text-faint">
            {todaysQuests.filter((q) => questState.claimed.includes(q.id)).length}/
            {todaysQuests.length} done
          </span>
        </div>
        {todaysQuests.map((q) => {
          const claimed = questState.claimed.includes(q.id);
          const complete = isQuestComplete(q, questState);
          const progress = questProgress(q, questState);
          return (
            <div
              key={q.id}
              className={
                'flex items-center gap-3 p-3 rounded-xl border transition-colors ' +
                (claimed
                  ? 'bg-surface-2/40 border-border opacity-60'
                  : complete
                    ? 'bg-accent-soft/60 border-accent'
                    : 'bg-surface-2/60 border-border')
              }
            >
              <span className="text-2xl shrink-0">{q.emoji}</span>
              <div className="flex-1 min-w-0">
                <p className={'text-sm font-medium text-text ' + (claimed ? 'line-through' : '')}>
                  {q.label}
                </p>
                <div className="mt-1 flex items-center gap-2">
                  <div className="h-1.5 flex-1 rounded-full bg-surface-2 overflow-hidden">
                    <div
                      className="h-full w-full rounded-full bg-accent-strong transition-transform duration-500"
                      style={{ transform: `translateX(${(progress / q.target) * 100 - 100}%)` }}
                    />
                  </div>
                  <span className="text-[11px] text-text-faint shrink-0">
                    {progress}/{q.target}
                  </span>
                </div>
              </div>
              {claimed ? (
                <span className="text-xs font-semibold text-text-faint shrink-0">✓ Done</span>
              ) : complete ? (
                <button
                  onClick={() => onClaimQuest(q.id, q.rewardCoins)}
                  className="shrink-0 px-3 py-1.5 rounded-full text-xs font-bold text-white bg-accent-strong shadow-sm active:scale-95 transition-transform"
                >
                  Claim 🪙 {q.rewardCoins}
                </button>
              ) : (
                <span className="text-xs font-semibold text-text-muted shrink-0">
                  🪙 {q.rewardCoins}
                </span>
              )}
            </div>
          );
        })}
        {todaysQuests.every((q) => questState.claimed.includes(q.id)) && (
          <p className="text-xs text-text-muted text-center pt-1">
            All quests done — come back tomorrow for new ones! 🌟
          </p>
        )}
      </div>

      {/* Actions */}
      <div className="card p-5">
        <h3 className="text-sm font-semibold text-text-muted uppercase tracking-wider mb-4">
          Actions
        </h3>
        <div className="flex flex-wrap gap-3 justify-center">
          <ActionButton
            emoji="🍎"
            label="Feed"
            color={actionColors.feed}
            disabled={hunger >= 95}
            onClick={handleFeed}
          />
          <ActionButton
            emoji="💧"
            label="Water"
            color={actionColors.water}
            disabled={thirst >= 95}
            onClick={handleWater}
          />
          <ActionButton emoji="❤️" label="Pat" color={actionColors.pat} onClick={handlePat} />
          {hasPlay && (
            <ActionButton emoji="🎮" label="Play" color={actionColors.play} onClick={handlePlay} />
          )}
          {hasSuperPat && (
            <ActionButton emoji="🌟" label="Super Pat" color={actionColors.superPat} onClick={handlePat} />
          )}
          <ActionButton
            emoji="🎯"
            label="Mini-game"
            color={actionColors.miniGame}
            onClick={() => setShowMiniGame((v) => !v)}
          />
          <ActionButton
            emoji="🛍️"
            label="Shop"
            color={actionColors.wardrobe}
            onClick={() => setShowAccessories((v) => !v)}
          />
          <ActionButton
            emoji="🏆"
            label="Awards"
            color={actionColors.awards}
            onClick={() => setShowAwards((v) => !v)}
          />
        </div>
      </div>

      {/* Mini-game */}
      {showMiniGame && (
        <MiniGame
          xpPerCatch={2}
          paused={pagePaused}
          onCatch={() => playPetSound('catch')}
          onEnd={(score) => {
            if (score > 0) {
              finishMiniGame(memberId, score);
              speak(`+${score * 2} XP · +${score} 🪙`);
              playPetSound('reward');
              noteInteraction();
            }
          }}
        />
      )}

      {/* Awards — earned + locked achievements */}
      {showAwards && (
        <div className="card p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-text-muted uppercase tracking-wider">
              Awards
            </h3>
            <span className="text-sm font-bold text-text">
              🏆 {earnedAchievements.length}/{ACHIEVEMENTS.length}
            </span>
          </div>
          <p className="text-xs text-text-faint">
            Each award earns a 🪙 5 bonus. Keep caring for {pet.name} to unlock them all!
          </p>
          <div className="grid grid-cols-3 gap-2">
            {ACHIEVEMENTS.map((a) => {
              const isEarned = earnedAchievements.includes(a.id);
              return (
                <div
                  key={a.id}
                  className={
                    'p-3 rounded-2xl border-2 text-center ' +
                    (isEarned
                      ? 'border-accent bg-accent-soft shadow-sm'
                      : 'border-border bg-surface-2/40 opacity-60')
                  }
                  title={a.hint}
                >
                  <div className={'text-2xl mb-1 ' + (isEarned ? '' : 'grayscale')}>
                    {isEarned ? a.emoji : '🔒'}
                  </div>
                  <div className="text-xs font-medium text-text">{a.label}</div>
                  <div className="text-[10px] text-text-faint mt-0.5 leading-tight">
                    {isEarned ? 'Earned!' : a.hint}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Shop — buy accessories with coins, then tap to wear */}
      {showAccessories && (
        <div className="card p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-text-muted uppercase tracking-wider">Shop</h3>
            <span className="text-sm font-bold text-text">🪙 {coins}</span>
          </div>
          <p className="text-xs text-text-faint">
            Earn coins by feeding, watering &amp; playing. Tap to buy, then tap again to wear.
          </p>
          <div className="grid grid-cols-3 gap-2">
            {ACCESSORIES.map((a) => {
              const isOwned = owned.includes(a.id);
              const worn = accessoriesWorn.includes(a.id);
              const affordable = coins >= a.price;
              return (
                <button
                  key={a.id}
                  disabled={!isOwned && !affordable}
                  onClick={() => onTapAccessory(a)}
                  className={
                    'p-3 rounded-2xl border-2 text-center transition-[transform,opacity,background-color,border-color,color,box-shadow] active:scale-95 ' +
                    (worn
                      ? 'border-accent bg-accent-soft shadow-md'
                      : isOwned
                        ? 'border-border hover:border-border-strong bg-surface-2/50'
                        : affordable
                          ? 'border-border hover:border-border-strong bg-surface-2/50'
                          : 'border-border bg-surface-2/40 opacity-50 cursor-not-allowed')
                  }
                  title={a.hint}
                >
                  <div className="text-2xl mb-1">{a.emoji}</div>
                  <div className="text-xs font-medium text-text">{a.label}</div>
                  {worn ? (
                    <div className="text-[10px] text-accent font-semibold mt-0.5">Wearing</div>
                  ) : isOwned ? (
                    <div className="text-[10px] text-text-faint mt-0.5">Tap to wear</div>
                  ) : (
                    <div className="text-[10px] text-text-muted font-semibold mt-0.5">
                      🪙 {a.price}
                    </div>
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
          <h3 className="text-sm font-semibold text-text-muted uppercase tracking-wider">
            Experience
          </h3>
          <span className="text-sm font-bold text-text">{pet.xp} XP</span>
        </div>
        <div className="mb-2">
          <div className="flex justify-between text-xs text-text-faint mb-1">
            <span>Level {level}</span>
            <span>Level {level + 1}</span>
          </div>
          <div className="h-3 rounded-full bg-surface-2 overflow-hidden">
            <div
              className="h-full w-full rounded-full transition-transform duration-700"
              style={{
                transform: `translateX(${(xpInLevel / nextLevelXp) * 100 - 100}%)`,
                background: `linear-gradient(90deg, ${MEMBER_COLORS.sand.base}, ${tokens.base})`,
              }}
            />
          </div>
          <p className="text-xs text-text-faint mt-1.5 text-center">
            {xpInLevel} / {nextLevelXp} XP to Level {level + 1}
          </p>
        </div>
        <div className="mt-3 grid grid-cols-4 gap-2">
          <StageChip label="Baby" active={stage === 'baby'} hint="Lv 1–3" />
          <StageChip label="Junior" active={stage === 'child'} hint="Lv 4–7" />
          <StageChip label="Adult" active={stage === 'adult'} hint="Lv 8–14" />
          <StageChip label="Legend" active={stage === 'legend'} hint="Lv 15+" />
        </div>
        <div className="mt-3 p-3 rounded-xl bg-accent-soft/50 text-center">
          <p className="text-xs text-text-muted">
            Complete chores (+10 XP), habits (+5 XP), or play the mini-game (+2 XP each catch) to
            grow!
          </p>
        </div>
      </div>
        </div>
      </div>

      <ConfirmDialog
        open={confirmNewPet}
        onClose={() => setConfirmNewPet(false)}
        title="Start a new pet?"
        body={`${pet.name} will be replaced. Your earned level, coins and awards stay.`}
        confirmLabel="Replace pet"
        onConfirm={onNewPet}
      />

      {/* Evolution celebration — shown once per stage-up, per device */}
      {evolvedStage && (
        <div
          className="modal-backdrop fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6"
          onClick={() => setEvolvedStage(null)}
          role="dialog"
          aria-label={`${pet.name} grew up`}
        >
          <div
            className="modal-card card p-6 w-full max-w-sm text-center space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-3xl" aria-hidden>
              🎉 ✨ 🎉
            </div>
            <div className="flex justify-center">
              <PetCanvas animal={pet.animal} mood="happy" size={160} xp={pet.xp} />
            </div>
            <h3 className="font-display text-2xl text-text">{pet.name} grew up!</h3>
            <p className="text-sm text-text-muted">
              Say hello to your {stageLabel} {animalMeta.label.toLowerCase()}!
              {evolvedStage === 'legend' && ' Legends sparkle forever. ✨'}
            </p>
            <button
              onClick={() => setEvolvedStage(null)}
              className="btn-primary w-full py-3 text-base rounded-xl"
            >
              Yay! 🎊
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function StageChip({ label, active, hint }: { label: string; active: boolean; hint: string }) {
  return (
    <div
      className={
        'text-center rounded-xl py-2 border ' +
        (active
          ? 'bg-accent-strong text-white border-accent shadow-sm'
          : 'bg-surface-2/60 text-text-muted border-border')
      }
    >
      <div className="text-xs font-semibold">{label}</div>
      <div className={'text-[10px] ' + (active ? 'text-white/80' : 'text-text-faint')}>{hint}</div>
    </div>
  );
}

export function PetPage() {
  const { activeMember } = useMembersData();
  const { getPet } = usePetData();
  const [newPetMode, setNewPetMode] = useState(false);

  // Reset the "choose a new pet" flow whenever the active member changes, so we
  // don't strand a different child on the setup screen.
  const memberId = activeMember?.id ?? null;
  useEffect(() => {
    setNewPetMode(false);
  }, [memberId]);

  if (!activeMember) return null;

  const pet = getPet(activeMember.id);
  const showSetup = !pet || newPetMode;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-2xl text-text">Virtual Pet</h1>
        <p className="text-sm text-text-muted">Your kawaii companion</p>
      </div>

      {showSetup ? (
        <SetupScreen
          memberId={activeMember.id}
          hasExisting={!!pet}
          onCancel={() => setNewPetMode(false)}
          onCreated={() => setNewPetMode(false)}
        />
      ) : (
        <PetView pet={pet} memberId={activeMember.id} onNewPet={() => setNewPetMode(true)} />
      )}
    </div>
  );
}
