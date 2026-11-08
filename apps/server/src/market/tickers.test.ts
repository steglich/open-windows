import { describe, expect, it } from 'vitest';

import { TICKERS } from './tickers.js';

describe('TICKERS', () => {
  it('tem 500 códigos distintos', () => {
    expect(TICKERS).toHaveLength(500);
    expect(new Set(TICKERS).size).toBe(500);
  });

  it('segue o formato da B3', () => {
    for (const ticker of TICKERS) {
      expect(ticker).toMatch(/^[A-Z0-9]{4}(3|4|5|6|11|34)$/);
    }
  });

  it('começa pelos ativos mais conhecidos', () => {
    expect(TICKERS.slice(0, 2)).toEqual(['PETR4', 'VALE3']);
  });
});
