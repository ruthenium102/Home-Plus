// Accessory catalog for the virtual pet.
// Accessories are unlocked at XP milestones, rendered as additional SVG layers
// on top of the base pet, and persisted on the VirtualPet record.

export type AccessorySlot = 'hat' | 'face' | 'neck';

export interface Accessory {
  id: string;
  label: string;
  emoji: string;       // shown in shop / picker
  slot: AccessorySlot; // only one item per slot can be worn at a time
  unlockXp: number;    // pet xp threshold
  hint: string;        // short description
}

export const ACCESSORIES: Accessory[] = [
  // Hats
  { id: 'beanie',   label: 'Beanie',   emoji: '🧢', slot: 'hat',  unlockXp: 20,  hint: 'A cozy little beanie.' },
  { id: 'top_hat',  label: 'Top Hat',  emoji: '🎩', slot: 'hat',  unlockXp: 80,  hint: 'For the dapper pet about town.' },
  { id: 'crown',    label: 'Crown',    emoji: '👑', slot: 'hat',  unlockXp: 250, hint: 'Royalty earns it.' },
  { id: 'party',    label: 'Party Hat',emoji: '🥳', slot: 'hat',  unlockXp: 400, hint: 'Time to celebrate!' },
  // Face
  { id: 'glasses',  label: 'Glasses',  emoji: '🤓', slot: 'face', unlockXp: 40,  hint: 'Smart-looking spectacles.' },
  { id: 'shades',   label: 'Shades',   emoji: '😎', slot: 'face', unlockXp: 150, hint: 'Too cool.' },
  // Neck
  { id: 'red_collar', label: 'Red Collar', emoji: '❤️', slot: 'neck', unlockXp: 10,  hint: 'A classic.' },
  { id: 'bow_tie',    label: 'Bow Tie',    emoji: '🎀', slot: 'neck', unlockXp: 60,  hint: 'Fancy!' },
  { id: 'scarf',      label: 'Scarf',      emoji: '🧣', slot: 'neck', unlockXp: 180, hint: 'Stylish and warm.' },
];

export function unlockedAccessories(xp: number): Accessory[] {
  return ACCESSORIES.filter((a) => xp >= a.unlockXp);
}

export function nextUnlock(xp: number): Accessory | null {
  return ACCESSORIES.find((a) => xp < a.unlockXp) ?? null;
}

export function findAccessory(id: string): Accessory | undefined {
  return ACCESSORIES.find((a) => a.id === id);
}

// Helper: pick the single accessory worn for a given slot (defensive against
// multiple entries for the same slot).
export function wornForSlot(accessoryIds: string[], slot: AccessorySlot): Accessory | undefined {
  for (const id of accessoryIds) {
    const a = findAccessory(id);
    if (a && a.slot === slot) return a;
  }
  return undefined;
}
