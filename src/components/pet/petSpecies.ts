// Pet species registry. Each species maps to a bundled Microsoft Fluent Emoji
// (3D) illustration in /public/pets. The roster is headshots only — every image
// is a face/head bust (no full bodies) so the pets read consistently. Legacy
// stored animal values ('bunny'/'axolotl' from the pre-illustrated overhaul,
// and 'penguin'/'turtle'/'fish' from the earlier full-body roster) are aliased
// to their nearest current head species so existing pets keep rendering.
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
  { animal: 'bear', label: 'Bear', emoji: '🐻', treat: '🍯', img: '/pets/bear.png' },
  { animal: 'dragon', label: 'Dragon', emoji: '🐲', treat: '🔥', img: '/pets/dragon.png' },
  { animal: 'unicorn', label: 'Unicorn', emoji: '🦄', treat: '🍓', img: '/pets/unicorn.png' },
  { animal: 'frog', label: 'Frog', emoji: '🐸', treat: '🪰', img: '/pets/frog.png' },
  { animal: 'koala', label: 'Koala', emoji: '🐨', treat: '🍃', img: '/pets/koala.png' },
  { animal: 'tiger', label: 'Tiger', emoji: '🐯', treat: '🥩', img: '/pets/tiger.png' },
];

// Options shown in the new-pet picker.
export const PET_PICKER: PetSpecies[] = PET_SPECIES;

// Lookup incl. legacy aliases. The retired 'custom' (draw-your-own), the old
// 'bunny'/'axolotl' values, and the retired full-body 'penguin'/'turtle'/'fish'
// species all map to the nearest current head species so existing pets keep
// rendering.
const byAnimal = (a: PetAnimal) => PET_SPECIES.find((s) => s.animal === a)!;
const META: Record<string, PetSpecies> = {
  ...Object.fromEntries(PET_SPECIES.map((s) => [s.animal, s])),
  custom: byAnimal('cat'),
  bunny: byAnimal('rabbit'),
  axolotl: byAnimal('frog'),
  penguin: byAnimal('koala'),
  turtle: byAnimal('koala'),
  fish: byAnimal('tiger'),
};

/** Metadata for any animal value (incl. custom + legacy), falling back to cat. */
export function speciesMeta(animal: string): PetSpecies {
  return META[animal] ?? PET_SPECIES[0];
}

/** Bundled illustration path for an animal value (empty for custom). */
export function petImage(animal: string): string {
  return META[animal]?.img ?? PET_SPECIES[0].img;
}
