import type { Portfolio } from '../../market-data/market-protocol';

const LARGEST_POSITIONS = 5;

export interface AllocationSlice {
  label: string;
  value: number;
  percent: number;
}

/** As maiores posições por valor de mercado e, se houver mais, uma fatia com as demais. */
export function portfolioAllocation(portfolio: Portfolio): AllocationSlice[] {
  const held = portfolio.positions
    .filter(({ marketValue }) => marketValue > 0)
    .sort((a, b) => b.marketValue - a.marketValue);
  const total = held.reduce((sum, { marketValue }) => sum + marketValue, 0);

  const slice = (label: string, value: number): AllocationSlice => ({
    label,
    value,
    percent: (value / total) * 100,
  });
  const slices = held
    .slice(0, LARGEST_POSITIONS)
    .map(({ symbol, marketValue }) => slice(symbol, marketValue));

  const others = held.slice(LARGEST_POSITIONS);
  if (others.length > 0) {
    slices.push(slice('Outros', others.reduce((sum, { marketValue }) => sum + marketValue, 0)));
  }
  return slices;
}
