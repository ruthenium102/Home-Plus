// Daily quest catalog for the virtual pet (phase 4).
// Three quests are picked per pet per local day, deterministically from the
// pet id + date, so every device shows the same set without extra sync.
// Progress is tracked as per-day event counters in `pet.quest_state`.

import type { PetEvent, PetQuestState, VirtualPet } from '@/types';

export interface PetQuest {
  id: string;
  label: string;
  emoji: string;
  event: PetEvent; // counter this quest watches
  target: number; // count needed to complete
  rewardCoins: number;
}

export const QUEST_POOL: PetQuest[] = [
  { id: 'q_feed_2', label: 'Feed your pet 2 times', emoji: '🍎', event: 'feed', target: 2, rewardCoins: 8 },
  { id: 'q_water_2', label: 'Give water 2 times', emoji: '💧', event: 'water', target: 2, rewardCoins: 8 },
  { id: 'q_pat_5', label: 'Pat your pet 5 times', emoji: '❤️', event: 'pat', target: 5, rewardCoins: 8 },
  { id: 'q_play_1', label: 'Play together', emoji: '🎮', event: 'play', target: 1, rewardCoins: 10 },
  { id: 'q_catch_10', label: 'Catch 10 treats in the mini-game', emoji: '🎯', event: 'minigame_catch', target: 10, rewardCoins: 12 },
  { id: 'q_coins_15', label: 'Earn 15 coins', emoji: '🪙', event: 'coins_earned', target: 15, rewardCoins: 10 },
];

const QUESTS_PER_DAY = 3;

/** Local YYYY-MM-DD (matches the care-streak date format in FamilyContext). */
export function localDateStr(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Small deterministic PRNG (mulberry32) seeded from a string hash, so the
// daily pick is stable for a given pet + date on every device.
function seededRandom(seed: string): () => number {
  let h = 1779033703;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
}

/**
 * Today's quest set for a pet. Quests whose action the pet hasn't unlocked yet
 * (e.g. Play before xp 50) are excluded before picking.
 */
export function dailyQuests(pet: VirtualPet, date = localDateStr()): PetQuest[] {
  const pool = QUEST_POOL.filter(
    (q) => q.event !== 'play' || pet.unlocked_actions.includes('play'),
  );
  const rand = seededRandom(`${pet.id}:${date}`);
  const shuffled = [...pool];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, QUESTS_PER_DAY);
}

/** Quest state for today — resets counters/claims when the stored date is stale. */
export function rollQuestState(pet: VirtualPet, date = localDateStr()): PetQuestState {
  const qs = pet.quest_state;
  if (qs && qs.date === date && qs.counts && Array.isArray(qs.claimed)) return qs;
  return { date, counts: {}, claimed: [] };
}

export function questProgress(quest: PetQuest, qs: PetQuestState): number {
  return Math.min(quest.target, qs.counts[quest.event] ?? 0);
}

export function isQuestComplete(quest: PetQuest, qs: PetQuestState): boolean {
  return (qs.counts[quest.event] ?? 0) >= quest.target;
}
