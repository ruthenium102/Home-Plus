// Pet species registry. Each species maps to a bundled Microsoft Fluent Emoji
// (3D) illustration in /public/pets. Legacy stored animal values ('bunny',
// 'axolotl') from before the illustrated overhaul are aliased to their nearest
// new species so existing pets keep rendering.
import type { PetAnimal } from '@/types';

export interface PetSpecies {
  animal: PetAnimal;
  label: string;
  emoji: string; // small glyph for headers / chips
  treat: string; // favourite treat emoji (treat tray)
  img: string; // bundled illustration path
}

export const PET_SPECIES: PetSpecies[] = [
  { animal: 'cat', label: 'Cat', emoji: '🐱', treat: '🐟', img: '/pets/cat.png' },
  { animal: 'dog', label: 'Dog', emoji: '🐶', treat: '🍖', img: '/pets/dog.png' },
  { animal: 'rabbit', label: 'Rabbit', emoji: '🐰', treat: '🥕', img: '/pets/rabbit.png' },
  { animal: 'hamster', label: 'Hamster', emoji: '🐹', treat: '🌰', img: '/pets/hamster.png' },
  { animal: 'fox', label: 'Fox', emoji: '🦊', treat: '🍇', img: '/pets/fox.png' },
  { animal: 'panda', label: 'Panda', emoji: '🐼', treat: '🎋', img: '/pets/panda.png' },
  { animal: 'penguin', label: 'Penguin', emoji: '🐧', treat: '🐟', img: '/pets/penguin.png' },
  { animal: 'dragon', label: 'Dragon', emoji: '🐲', treat: '🔥', img: '/pets/dragon.png' },
  { animal: 'unicorn', label: 'Unicorn', emoji: '🦄', treat: '🍓', img: '/pets/unicorn.png' },
  { animal: 'frog', label: 'Frog', emoji: '🐸', treat: '🪰', img: '/pets/frog.png' },
  { animal: 'turtle', label: 'Turtle', emoji: '🐢', treat: '🥬', img: '/pets/turtle.png' },
  { animal: 'fish', label: 'Fish', emoji: '🐠', treat: '🦐', img: '/pets/fish.png' },
];

// The "draw your own" option — picker only, no bundled image.
export const CUSTOM_SPECIES: PetSpecies = {
  animal: 'custom',
  label: 'My drawing',
  emoji: '✏️',
  treat: '🍪',
  img: '',
};

// Options shown in the new-pet picker (illustrated species + draw-your-own).
export const PET_PICKER: PetSpecies[] = [...PET_SPECIES, CUSTOM_SPECIES];

// Lookup incl. the custom option and legacy aliases.
const META: Record<string, PetSpecies> = {
  ...Object.fromEntries(PET_SPECIES.map((s) => [s.animal, s])),
  custom: CUSTOM_SPECIES,
  bunny: PET_SPECIES.find((s) => s.animal === 'rabbit')!,
  axolotl: PET_SPECIES.find((s) => s.animal === 'fish')!,
};

/** Metadata for any animal value (incl. custom + legacy), falling back to cat. */
export function speciesMeta(animal: string): PetSpecies {
  return META[animal] ?? PET_SPECIES[0];
}

/** Bundled illustration path for an animal value (empty for custom). */
export function petImage(animal: string): string {
  return META[animal]?.img ?? PET_SPECIES[0].img;
}
