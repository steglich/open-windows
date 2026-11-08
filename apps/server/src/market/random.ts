import { randomBytes } from 'node:crypto';

export type RandomSource = () => number;

/** PRNG mulberry32: a mesma seed sempre gera a mesma sequência. */
export function seededRandom(seed: number): RandomSource {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

/** Deriva uma sub-seed por FNV-1a, para que cada fluxo de dados seja independente dos demais. */
export function deriveSeed(seed: number, label: string): number {
  let hash = 0x811c9dc5;
  const mix = (byte: number): void => {
    hash = Math.imul(hash ^ byte, 0x01000193);
  };

  for (let shift = 0; shift < 32; shift += 8) {
    mix((seed >>> shift) & 0xff);
  }
  for (let index = 0; index < label.length; index++) {
    mix(label.charCodeAt(index) & 0xff);
  }
  return hash >>> 0;
}

export function randomInt(random: RandomSource, min: number, max: number): number {
  return min + Math.floor(random() * (max - min + 1));
}

export function randomSeed(): number {
  return randomBytes(4).readUInt32BE();
}

/** Embaralha `items` no lugar (Fisher-Yates) e devolve o mesmo array. */
export function shuffle<T>(random: RandomSource, items: T[]): T[] {
  for (let index = items.length - 1; index > 0; index--) {
    const other = randomInt(random, 0, index);
    [items[index], items[other]] = [items[other]!, items[index]!];
  }
  return items;
}
