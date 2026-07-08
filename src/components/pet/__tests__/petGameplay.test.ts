import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  dailyQuests,
  rollQuestState,
  questProgress,
  isQuestComplete,
  localDateStr,
  QUEST_POOL,
} from '../petQuests';
import { xpToStage, STAGE_RANK } from '../PetCanvas';
import type { VirtualPet } from '@/types';

// Date-boundary logic is the bug class that has bitten this codebase before
// (recurrence fast-forward, habit streaks) — these tests pin down the pet
// quest rollover and growth-stage thresholds the same way habits.test.ts and
// recurrence.test.ts pin down theirs.

function makePet(overrides: Partial<VirtualPet> = {}): VirtualPet {
  return {
    id: 'pet-1',
    family_id: 'fam-1',
    member_id: 'mem-1',
    animal: 'panda',
    name: 'Mochi',
    hunger: 80,
    thirst: 80,
    happiness: 80,
    xp: 0,
    unlocked_actions: [],
    last_fed_at: null,
    last_watered_at: null,
    last_interacted_at: null,
    created_at: '2026-01-01T00:00:00.000Z',
    accessories: [],
    coins: 0,
    owned_accessories: [],
    care_streak: 0,
    last_care_date: null,
    achievements: [],
    lifetime_stats: {},
    quest_state: null,
    ...overrides,
  };
}

describe('rollQuestState', () => {
  it("keeps today's state untouched", () => {
    const today = localDateStr();
    const qs = { date: today, counts: { feed: 2 }, claimed: ['q_feed_2'] };
    expect(rollQuestState(makePet({ quest_state: qs }))).toBe(qs);
  });

  it('resets counts and claims when the stored date is stale (midnight rollover)', () => {
    const rolled = rollQuestState(
      makePet({ quest_state: { date: '2026-07-07', counts: { feed: 5 }, claimed: ['q_feed_2'] } }),
      '2026-07-08',
    );
    expect(rolled).toEqual({ date: '2026-07-08', counts: {}, claimed: [] });
  });

  it('produces a fresh state when quest_state is missing or malformed', () => {
    expect(rollQuestState(makePet(), '2026-07-08')).toEqual({
      date: '2026-07-08',
      counts: {},
      claimed: [],
    });
    const malformed = makePet({
      quest_state: { date: localDateStr(), counts: {}, claimed: null } as never,
    });
    expect(rollQuestState(malformed).claimed).toEqual([]);
  });
});

describe('dailyQuests', () => {
  it('picks exactly 3 distinct quests', () => {
    const quests = dailyQuests(makePet(), '2026-07-08');
    expect(quests).toHaveLength(3);
    expect(new Set(quests.map((q) => q.id)).size).toBe(3);
  });

  it('is deterministic for the same pet + date (cross-device consistency)', () => {
    const a = dailyQuests(makePet(), '2026-07-08').map((q) => q.id);
    const b = dailyQuests(makePet(), '2026-07-08').map((q) => q.id);
    expect(a).toEqual(b);
  });

  it('varies by pet id and by date', () => {
    // A single differing day/pet CAN coincidentally match, so check across a
    // spread of dates — at least one must differ if the seed matters at all.
    const dates = ['2026-07-01', '2026-07-02', '2026-07-03', '2026-07-04', '2026-07-05'];
    const petA = makePet({ id: 'pet-a' });
    const petB = makePet({ id: 'pet-b' });
    const seqA = dates.map((d) => dailyQuests(petA, d).map((q) => q.id).join(','));
    const seqB = dates.map((d) => dailyQuests(petB, d).map((q) => q.id).join(','));
    expect(seqA).not.toEqual(seqB); // pet id changes the pick
    expect(new Set(seqA).size).toBeGreaterThan(1); // date changes the pick
  });

  it('excludes the play quest until the pet has unlocked play', () => {
    const dates = ['2026-07-01', '2026-07-02', '2026-07-03', '2026-07-04', '2026-07-05'];
    for (const d of dates) {
      const locked = dailyQuests(makePet(), d);
      expect(locked.some((q) => q.event === 'play')).toBe(false);
    }
    // With play unlocked the pool includes it, so across many dates it should
    // show up at least once.
    const unlocked = makePet({ unlocked_actions: ['play'] });
    const seen = new Set(
      dates.flatMap((d) => dailyQuests(unlocked, d).map((q) => q.event)),
    );
    expect(seen.has('play')).toBe(true);
  });
});

describe('questProgress / isQuestComplete', () => {
  const quest = QUEST_POOL.find((q) => q.id === 'q_feed_2')!;

  it('caps displayed progress at the target', () => {
    const qs = { date: '2026-07-08', counts: { feed: 7 }, claimed: [] };
    expect(questProgress(quest, qs)).toBe(quest.target);
    expect(isQuestComplete(quest, qs)).toBe(true);
  });

  it('treats missing counters as zero', () => {
    const qs = { date: '2026-07-08', counts: {}, claimed: [] };
    expect(questProgress(quest, qs)).toBe(0);
    expect(isQuestComplete(quest, qs)).toBe(false);
  });
});

describe('xpToStage', () => {
  it('maps level boundaries to the documented stages', () => {
    expect(xpToStage(0)).toBe('baby'); // level 1
    expect(xpToStage(299)).toBe('baby'); // level 3
    expect(xpToStage(300)).toBe('child'); // level 4
    expect(xpToStage(699)).toBe('child'); // level 7
    expect(xpToStage(700)).toBe('adult'); // level 8
    expect(xpToStage(1399)).toBe('adult'); // level 14
    expect(xpToStage(1400)).toBe('legend'); // level 15
  });

  it('ranks stages strictly upward (drives the evolution-overlay trigger)', () => {
    expect(STAGE_RANK.baby).toBeLessThan(STAGE_RANK.child);
    expect(STAGE_RANK.child).toBeLessThan(STAGE_RANK.adult);
    expect(STAGE_RANK.adult).toBeLessThan(STAGE_RANK.legend);
  });
});

describe('pet sound mute persistence', () => {
  beforeEach(() => {
    vi.resetModules();
    const store = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    });
  });

  it('round-trips the muted flag through storage', async () => {
    const first = await import('@/lib/petSounds');
    expect(first.isPetSoundMuted()).toBe(false);
    expect(first.setPetSoundMuted()).toBe(true);

    // Fresh module load (a new app session) must read the persisted flag.
    vi.resetModules();
    const second = await import('@/lib/petSounds');
    expect(second.isPetSoundMuted()).toBe(true);
    expect(second.setPetSoundMuted(false)).toBe(false);
    expect(second.isPetSoundMuted()).toBe(false);
  });
});
