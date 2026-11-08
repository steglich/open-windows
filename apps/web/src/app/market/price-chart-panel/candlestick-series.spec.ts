import { candle } from '../../market-data/testing/market-fixtures';
import { formatPrice } from '../shared/chart-format';
import { axisTimeLabel, candleLabel, toCandlestickSeries } from './candlestick-series';

describe('candlestick-series', () => {
  const OPEN_UTC = Date.UTC(2026, 0, 5, 13, 0);

  it('exibe o horário do candle no fuso de Brasília', () => {
    expect(candleLabel(OPEN_UTC)).toBe('05/01 10:00');
    expect(axisTimeLabel(candleLabel(OPEN_UTC))).toBe('10:00');
  });

  it('formata o preço do eixo em reais', () => {
    expect(formatPrice(32.5)).toBe('R$ 32,50');
  });

  it('gera um ponto por candle com abertura, máxima, mínima e fechamento', () => {
    const series = toCandlestickSeries([
      candle(OPEN_UTC, { open: 1, high: 4, low: 0.5, close: 2 }),
      candle(OPEN_UTC + 60_000, { open: 2, high: 3, low: 1, close: 2.5 }),
    ]);

    expect(series).toEqual([
      {
        name: 'Preço',
        data: [
          { x: '05/01 10:00', y: [1, 4, 0.5, 2] },
          { x: '05/01 10:01', y: [2, 3, 1, 2.5] },
        ],
      },
    ]);
  });

  it('mantém rótulos distintos para o mesmo horário em pregões diferentes', () => {
    const day = 24 * 60 * 60_000;

    expect(candleLabel(OPEN_UTC)).not.toBe(candleLabel(OPEN_UTC + day));
  });
});
