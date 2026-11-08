import type { Position } from '../../market-data/market-protocol';
import { portfolio } from '../../market-data/testing/market-fixtures';
import { portfolioAllocation } from './portfolio-allocation';

function position(symbol: string, marketValue: number): Position {
  return {
    symbol,
    quantity: 1,
    blockedQuantity: 0,
    averagePrice: 1,
    lastPrice: 1,
    marketValue,
    unrealizedPnl: 0,
    unrealizedPnlPercent: 0,
  };
}

function allocationOf(...positions: Position[]) {
  return portfolioAllocation(portfolio({ positions }));
}

describe('portfolioAllocation', () => {
  it('ordena por valor e calcula o percentual de cada posição', () => {
    expect(allocationOf(position('BETA4', 25), position('ALFA3', 75))).toEqual([
      { label: 'ALFA3', value: 75, percent: 75 },
      { label: 'BETA4', value: 25, percent: 25 },
    ]);
  });

  it('agrupa em "Outros" o que passa das cinco maiores', () => {
    const slices = allocationOf(
      position('A', 10),
      position('B', 50),
      position('C', 40),
      position('D', 30),
      position('E', 20),
      position('F', 25),
      position('G', 25),
    );

    expect(slices.map(({ label }) => label)).toEqual(['B', 'C', 'D', 'F', 'G', 'Outros']);
    expect(slices.at(-1)).toEqual({ label: 'Outros', value: 30, percent: 15 });
  });

  it('não cria "Outros" com até cinco posições', () => {
    const slices = allocationOf(...['A', 'B', 'C', 'D', 'E'].map((label) => position(label, 1)));

    expect(slices.map(({ label }) => label)).toEqual(['A', 'B', 'C', 'D', 'E']);
  });

  it('ignora posições sem valor de mercado positivo', () => {
    expect(allocationOf(position('A', 0))).toEqual([]);
    expect(allocationOf()).toEqual([]);
  });
});
