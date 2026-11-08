import { describe, expect, it } from 'vitest';

import { deriveSeed, randomInt, seededRandom, shuffle } from './random.js';

function sequence(seed: number, length = 20): number[] {
  const random = seededRandom(seed);
  return Array.from({ length }, () => random());
}

describe('seededRandom', () => {
  it('repete a sequência com a mesma seed', () => {
    expect(sequence(42)).toEqual(sequence(42));
  });

  it('gera sequências diferentes com seeds diferentes', () => {
    expect(sequence(42)).not.toEqual(sequence(43));
  });

  it('gera valores no intervalo [0, 1)', () => {
    for (const value of sequence(7, 1_000)) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });
});

describe('deriveSeed', () => {
  it('é determinística', () => {
    expect(deriveSeed(42, 'history:PETR4')).toBe(deriveSeed(42, 'history:PETR4'));
  });

  it('gera sequências diferentes para rótulos diferentes', () => {
    expect(sequence(deriveSeed(42, 'history:PETR4'))).not.toEqual(
      sequence(deriveSeed(42, 'history:VALE3')),
    );
  });

  it('muda com a seed de origem', () => {
    expect(deriveSeed(1, 'orders')).not.toBe(deriveSeed(2, 'orders'));
  });

  it('devolve um inteiro de 32 bits sem sinal', () => {
    const derived = deriveSeed(4_294_967_295, 'tick');
    expect(Number.isInteger(derived)).toBe(true);
    expect(derived).toBeGreaterThanOrEqual(0);
    expect(derived).toBeLessThanOrEqual(4_294_967_295);
  });
});

describe('auxiliares', () => {
  it('randomInt inclui os dois limites', () => {
    const random = seededRandom(1);
    const values = new Set(Array.from({ length: 200 }, () => randomInt(random, 1, 3)));
    expect(values).toEqual(new Set([1, 2, 3]));
  });

  it('shuffle preserva os elementos', () => {
    const items = Array.from({ length: 50 }, (_, index) => index);
    expect([...shuffle(seededRandom(9), [...items])].sort((a, b) => a - b)).toEqual(items);
  });
});
