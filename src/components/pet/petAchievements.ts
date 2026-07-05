// Achievement catalog for the virtual pet (phase 4).
// Achievements are earned once, stored permanently in `pet.achievements`, and
// judged by pure predicates over the pet row (lifetime counters, streaks,
// growth stage, wardrobe). Each earn grants a small coin bonus.

import type { VirtualPet } from '@/types';
import { xpToStage, STAGE_RANK, type PetStage } from './PetCanvas';
import { ACCESSORIES } from './petAccessories';

export const ACHIEVEMENT_COIN_BONUS = 5;

export interface PetAchievement {
  id: string;
  label: string;
  emoji: string;
  hint: string; // how to earn it — shown on locked entries
  earned: (pet: VirtualPet) => boolean;
}

const stat = (pet: VirtualPet, key: string) => pet.lifetime_stats?.[key] ?? 0;

const stageAtLeast = (pet: VirtualPet, s: PetStage) =>
  STAGE_RANK[xpToStage(pet.xp)] >= STAGE_RANK[s];

export const ACHIEVEMENTS: PetAchievement[] = [
  // Care basics
  { id: 'a_first_feed', label: 'First Bite', emoji: '🍎', hint: 'Feed your pet for the first time.', earned: (p) => stat(p, 'feed') >= 1 },
  { id: 'a_feeds_50', label: 'Snack Master', emoji: '🍱', hint: 'Feed your pet 50 times.', earned: (p) => stat(p, 'feed') >= 50 },
  { id: 'a_waters_50', label: 'Hydration Hero', emoji: '🚰', hint: 'Give water 50 times.', earned: (p) => stat(p, 'water') >= 50 },
  { id: 'a_pats_100', label: 'Best Buddies', emoji: '💞', hint: 'Pat your pet 100 times.', earned: (p) => stat(p, 'pat') >= 100 },
  { id: 'a_plays_25', label: 'Playtime Pro', emoji: '🎈', hint: 'Play together 25 times.', earned: (p) => stat(p, 'play') >= 25 },
  // Streaks (best_streak is the high-water mark of care_streak)
  { id: 'a_streak_3', label: 'On a Roll', emoji: '🔥', hint: 'Care for your pet 3 days in a row.', earned: (p) => stat(p, 'best_streak') >= 3 },
  { id: 'a_streak_7', label: 'Week Streak', emoji: '⚡', hint: 'Care for your pet 7 days in a row.', earned: (p) => stat(p, 'best_streak') >= 7 },
  { id: 'a_streak_30', label: 'Super Streak', emoji: '🌟', hint: 'Care for your pet 30 days in a row.', earned: (p) => stat(p, 'best_streak') >= 30 },
  // Economy
  { id: 'a_coins_100', label: 'Piggy Bank', emoji: '🪙', hint: 'Earn 100 coins in total.', earned: (p) => stat(p, 'coins_earned') >= 100 },
  { id: 'a_coins_500', label: 'Treasure Hoard', emoji: '💰', hint: 'Earn 500 coins in total.', earned: (p) => stat(p, 'coins_earned') >= 500 },
  // Wardrobe
  { id: 'a_shop_1', label: 'First Fashion', emoji: '🛍️', hint: 'Buy your first accessory.', earned: (p) => (p.owned_accessories?.length ?? 0) >= 1 },
  { id: 'a_shop_5', label: 'Stylist', emoji: '👗', hint: 'Own 5 accessories.', earned: (p) => (p.owned_accessories?.length ?? 0) >= 5 },
  { id: 'a_shop_all', label: 'Full Wardrobe', emoji: '👑', hint: 'Own every accessory in the shop.', earned: (p) => (p.owned_accessories?.length ?? 0) >= ACCESSORIES.length },
  // Quests
  { id: 'a_quests_5', label: 'Quest Novice', emoji: '🗺️', hint: 'Complete 5 daily quests.', earned: (p) => stat(p, 'quest_complete') >= 5 },
  { id: 'a_quests_25', label: 'Quest Hero', emoji: '🧭', hint: 'Complete 25 daily quests.', earned: (p) => stat(p, 'quest_complete') >= 25 },
  // Mini-game
  { id: 'a_catch_50', label: 'Sharp Catcher', emoji: '🎯', hint: 'Catch 50 treats in the mini-game.', earned: (p) => stat(p, 'minigame_catch') >= 50 },
  // Growth
  { id: 'a_stage_child', label: 'Growing Up', emoji: '🌱', hint: 'Grow into a Junior (level 4).', earned: (p) => stageAtLeast(p, 'child') },
  { id: 'a_stage_adult', label: 'All Grown Up', emoji: '🌳', hint: 'Grow into an Adult (level 8).', earned: (p) => stageAtLeast(p, 'adult') },
  { id: 'a_stage_legend', label: 'Legendary', emoji: '✨', hint: 'Reach the Legend stage (level 15).', earned: (p) => stageAtLeast(p, 'legend') },
];

export function findAchievement(id: string): PetAchievement | undefined {
  return ACHIEVEMENTS.find((a) => a.id === id);
}

/** Achievements the pet now qualifies for but hasn't earned yet. */
export function checkNewAchievements(pet: VirtualPet): PetAchievement[] {
  const earned = new Set(pet.achievements ?? []);
  return ACHIEVEMENTS.filter((a) => !earned.has(a.id) && a.earned(pet));
}
