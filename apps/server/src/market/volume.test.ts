import { describe, expect, it } from 'vitest';

import { DEFAULT_VOLUME, resolveVolume } from './volume.js';

describe('resolveVolume', () => {
  it('usa os volumes padrão', () => {
    expect(resolveVolume()).toEqual({
      assets: 500,
      bookDepth: 50,
      orders: 10_000,
      positions: 300,
      sessions: 5,
      currentSessionCandles: 120,
    });
  });

  it('aplica substituições parciais', () => {
    expect(resolveVolume({ assets: 10, positions: 2 })).toEqual({
      ...DEFAULT_VOLUME,
      assets: 10,
      positions: 2,
    });
  });

  it.each([
    ['assets acima do catálogo', { assets: 501 }],
    ['assets zerado', { assets: 0 }],
    ['book acima do limite', { bookDepth: 51 }],
    ['mais posições que ativos', { assets: 5, positions: 6 }],
    ['ordens insuficientes para as posições', { orders: 599 }],
    ['sem pregões anteriores', { sessions: 0 }],
    ['pregão corrente curto demais', { currentSessionCandles: 30 }],
    ['valor fracionário', { bookDepth: 1.5 }],
  ])('rejeita %s', (_name, overrides) => {
    expect(() => resolveVolume(overrides)).toThrow(/Volume inválido/);
  });
});
