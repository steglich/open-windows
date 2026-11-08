import { describe, expect, it } from 'vitest';

import { MINUTE_MS, PriceHistory, type CandleCents } from './history.js';
import { TICKERS } from './tickers.js';
import { resolveVolume } from './volume.js';

// Quarta-feira, 16:00 em Brasília.
const START_TIME = Date.parse('2026-01-07T16:00:00-03:00');
const SESSION_CANDLES = 390;
const volume = resolveVolume({
  assets: 6,
  bookDepth: 5,
  orders: 100,
  positions: 3,
  sessions: 5,
});
const symbols = TICKERS.slice(0, volume.assets);

function build(seed = 42, startTime = START_TIME): PriceHistory {
  return new PriceHistory({ seed, symbols, volume, startTime });
}

function allCandles(history: PriceHistory, symbol: string): CandleCents[] {
  return history.query(symbol, Number.MAX_SAFE_INTEGER);
}

const brazilDate = (time: number) => new Date(time - 3 * 3_600_000).toISOString().slice(0, 10);
const brazilHour = (time: number) => new Date(time - 3 * 3_600_000).toISOString().slice(11, 16);

describe('PriceHistory', () => {
  it('tem cinco pregões de 390 candles e o pregão corrente', () => {
    const candles = allCandles(build(), 'PETR4');
    expect(candles).toHaveLength(5 * SESSION_CANDLES + volume.currentSessionCandles);

    const closed = candles.slice(0, 5 * SESSION_CANDLES);
    const byDay = Map.groupBy(closed, ({ time }) => brazilDate(time));
    expect(byDay.size).toBe(5);
    for (const day of byDay.values()) {
      expect(day).toHaveLength(SESSION_CANDLES);
      expect(brazilHour(day[0]!.time)).toBe('10:00');
      expect(brazilHour(day.at(-1)!.time)).toBe('16:29');
    }
  });

  it('usa apenas dias úteis, pulando o fim de semana', () => {
    const closed = allCandles(build(), 'PETR4').slice(0, 5 * SESSION_CANDLES);
    const days = [...new Set(closed.map(({ time }) => brazilDate(time)))];
    expect(days).toEqual(['2025-12-31', '2026-01-01', '2026-01-02', '2026-01-05', '2026-01-06']);
  });

  it('termina o pregão corrente no minuto da partida', () => {
    const candles = allCandles(build(), 'VALE3');
    expect(candles.at(-1)!.time).toBe(START_TIME);
    expect(candles.at(-volume.currentSessionCandles)!.time).toBe(
      START_TIME - (volume.currentSessionCandles - 1) * MINUTE_MS,
    );
  });

  it('mantém as relações de preço e o tempo múltiplo de um minuto', () => {
    const history = build();
    for (const symbol of symbols) {
      let previousTime = 0;
      for (const candle of allCandles(history, symbol)) {
        const { time, open, high, low, close, volume: quantity, financialVolume } = candle;
        expect(time % MINUTE_MS).toBe(0);
        expect(time).toBeGreaterThan(previousTime);
        expect(low).toBeGreaterThan(0);
        expect(low).toBeLessThanOrEqual(Math.min(open, close));
        expect(high).toBeGreaterThanOrEqual(Math.max(open, close));
        expect(Number.isInteger(open + high + low + close)).toBe(true);
        expect(quantity).toBeGreaterThan(0);
        expect(quantity % 100).toBe(0);
        expect(financialVolume).toBeGreaterThan(0);
        previousTime = time;
      }
    }
  });

  it('informa o fechamento do pregão anterior', () => {
    const history = build();
    const candles = allCandles(history, 'PETR4');
    expect(history.previousClose('PETR4')).toBe(candles[5 * SESSION_CANDLES - 1]!.close);
  });

  it('é reproduzível pela seed e muda com seeds diferentes', () => {
    expect(allCandles(build(7), 'PETR4')).toEqual(allCandles(build(7), 'PETR4'));
    expect(allCandles(build(7), 'PETR4')).not.toEqual(allCandles(build(8), 'PETR4'));
  });

  it('gera ativos independentes entre si', () => {
    const history = build();
    expect(allCandles(history, 'PETR4')[0]).not.toEqual(allCandles(history, 'VALE3')[0]);
  });

  describe('consulta', () => {
    it('devolve os candles mais recentes em ordem crescente', () => {
      const history = build();
      const everything = allCandles(history, 'PETR4');
      expect(history.query('PETR4', 10)).toEqual(everything.slice(-10));
    });

    it('pagina para trás sem repetir nem perder candles', () => {
      const history = build();
      const everything = allCandles(history, 'PETR4');
      const pages: CandleCents[] = [];
      let before: number | undefined;

      for (;;) {
        const page = history.query('PETR4', 300, before);
        if (page.length === 0) {
          break;
        }
        pages.unshift(...page);
        before = page[0]!.time;
      }

      expect(pages).toEqual(everything);
    });

    it('exclui o próprio instante de before', () => {
      const history = build();
      const target = allCandles(history, 'PETR4')[100]!.time;
      const page = history.query('PETR4', 5, target);
      expect(page).toHaveLength(5);
      expect(page.every(({ time }) => time < target)).toBe(true);
    });

    it('rejeita ativo desconhecido', () => {
      expect(() => build().query('XXXX9', 10)).toThrow(/desconhecido/);
    });
  });
});
