import type { Theme } from '../../theme/theme-store';

export interface ChartColors {
  text: string;
  grid: string;
  up: string;
  down: string;
  slices: readonly string[];
}

/** Literais porque o ApexCharts precisa deles. Mantenha alinhados aos tokens de `styles.css`. */
export const CHART_COLORS: Record<Theme, ChartColors> = {
  light: {
    text: '#566b7d',
    grid: '#e0d5c2',
    up: '#2f6f99',
    down: '#c4521f',
    slices: ['#12304a', '#2f6f99', '#79a9b8', '#e8982f', '#c4521f', '#d9c7a6'],
  },
  dark: {
    text: '#a8a8a8',
    grid: '#2c2c2c',
    up: '#79a9b8',
    down: '#e8982f',
    slices: ['#79a9b8', '#3f83b0', '#fdf3e3', '#e8982f', '#dc6a35', '#5a5a5a'],
  },
};
