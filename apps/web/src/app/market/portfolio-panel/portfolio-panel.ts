import { CurrencyPipe, DecimalPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';

import { MarketStore } from '../../market-data/market-store';
import { ThemeStore } from '../../theme/theme-store';
import { ApexChart, type ChartOptions } from '../shared/apex-chart/apex-chart';
import { formatPrice } from '../shared/chart-format';
import { CHART_COLORS } from '../shared/chart-theme';
import { FeedPanel } from '../shared/feed-panel/feed-panel';
import { SignedValue } from '../shared/signed-value/signed-value';
import { portfolioAllocation } from './portfolio-allocation';

const SLICE_DOTS = [
  'bg-series-1',
  'bg-series-2',
  'bg-series-3',
  'bg-series-4',
  'bg-series-5',
  'bg-series-6',
];

@Component({
  selector: 'app-portfolio-panel',
  imports: [ApexChart, CurrencyPipe, DecimalPipe, FeedPanel, SignedValue],
  templateUrl: './portfolio-panel.html',
})
export class PortfolioPanel {
  protected readonly store = inject(MarketStore);
  private readonly theme = inject(ThemeStore).theme;
  protected readonly chartFailed = signal(false);

  protected readonly slices = computed(() => {
    const portfolio = this.store.portfolio();
    const slices = portfolio === null ? [] : portfolioAllocation(portfolio);
    return slices.map((slice, index) => ({ ...slice, dot: SLICE_DOTS[index] }));
  });
  protected readonly series = computed(() => this.slices().map(({ value }) => value));

  private readonly labels = computed(() => this.slices().map(({ label }) => label), {
    equal: (a, b) => a.length === b.length && a.every((label, index) => label === b[index]),
  });
  protected readonly chartOptions = computed<ChartOptions>(() => ({
    chart: { type: 'donut', height: 220 },
    labels: [...this.labels()],
    colors: [...CHART_COLORS[this.theme()].slices],
    dataLabels: { enabled: false },
    legend: { show: false },
    stroke: { width: 0 },
    plotOptions: { pie: { donut: { size: '58%' } } },
    tooltip: { y: { formatter: formatPrice } },
  }));
}
