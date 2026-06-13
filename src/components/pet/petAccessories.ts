// Accessory catalog for the virtual pet shop (phase 3).
// Accessories are bought with coins (earned by caring for the pet), then can be
// equipped. One item per slot can be worn at a time.

export type AccessorySlot = 'hat' | 'face' | 'neck';

export interface Accessory {
  id: string;
  label: string;
  emoji: string; // shown in shop / picker / worn chips
  slot: AccessorySlot; // only one item per slot can be worn at a time
  price: number; // coin cost in the shop
  hint: string; // short description
}

export const ACCESSORIES: Accessory[] = [
  // Hats
  { id: 'beanie', label: 'Beanie', emoji: '🧢', slot: 'hat', price: 25, hint: 'A cozy little beanie.' },
  { id: 'flower', label: 'Flower', emoji: '🌸', slot: 'hat', price: 55, hint: 'Pretty in bloom.' },
  { id: 'top_hat', label: 'Top Hat', emoji: '🎩', slot: 'hat', price: 80, hint: 'For the dapper pet about town.' },
  { id: 'party', label: 'Party Hat', emoji: '🥳', slot: 'hat', price: 120, hint: 'Time to celebrate!' },
  { id: 'crown', label: 'Crown', emoji: '👑', slot: 'hat', price: 200, hint: 'Royalty earns it.' },
  // Face
  { id: 'glasses', label: 'Glasses', emoji: '🤓', slot: 'face', price: 35, hint: 'Smart-looking spectacles.' },
  { id: 'goggles', label: 'Goggles', emoji: '🥽', slot: 'face', price: 50, hint: 'Ready for adventure.' },
  { id: 'shades', label: 'Shades', emoji: '😎', slot: 'face', price: 90, hint: 'Too cool.' },
  // Neck
  { id: 'red_collar', label: 'Collar', emoji: '❤️', slot: 'neck', price: 15, hint: 'A classic.' },
  { id: 'bell', label: 'Bell', emoji: '🔔', slot: 'neck', price: 30, hint: 'Jingle jingle.' },
  { id: 'bow_tie', label: 'Bow Tie', emoji: '🎀', slot: 'neck', price: 45, hint: 'Fancy!' },
  { id: 'scarf', label: 'Scarf', emoji: '🧣', slot: 'neck', price: 100, hint: 'Stylish and warm.' },
];

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
