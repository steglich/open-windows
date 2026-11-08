import { CurrencyPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';

import { MarketStore } from '../../market-data/market-store';
import { ThemeStore } from '../../theme/theme-store';
import { ApexChart, type ChartOptions } from '../shared/apex-chart/apex-chart';
import { formatPrice } from '../shared/chart-format';
import { CHART_COLORS } from '../shared/chart-theme';
import { FeedPanel } from '../shared/feed-panel/feed-panel';
import { SignedValue } from '../shared/signed-value/signed-value';
import { axisTimeLabel, toCandlestickSeries } from './candlestick-series';

@Component({
  selector: 'app-price-chart-panel',
  imports: [ApexChart, CurrencyPipe, FeedPanel, SignedValue],
  templateUrl: './price-chart-panel.html',
})
export class PriceChartPanel {
  protected readonly store = inject(MarketStore);
  private readonly theme = inject(ThemeStore).theme;

  protected readonly loadFailed = signal(false);
  protected readonly hasCandles = computed(() => (this.store.candles()?.length ?? 0) > 0);
  protected readonly series = computed(() => toCandlestickSeries(this.store.candles() ?? []));
  protected readonly subtitle = computed(() => {
    const symbol = this.store.selectedSymbol();
    return symbol === null ? 'Candles de 1 minuto' : `${symbol} · Candles de 1 minuto`;
  });
  protected readonly options = computed<ChartOptions>(() => {
    const colors = CHART_COLORS[this.theme()];
    return {
      chart: { type: 'candlestick', height: 300, foreColor: colors.text },
      grid: { borderColor: colors.grid, strokeDashArray: 4 },
      plotOptions: { candlestick: { colors: { upward: colors.up, downward: colors.down } } },
      xaxis: {
        type: 'category',
        tickAmount: 8,
        labels: { rotate: 0, formatter: (value) => axisTimeLabel(String(value)) },
        axisTicks: { show: false },
        tooltip: { enabled: false },
      },
      yaxis: { tooltip: { enabled: false }, labels: { formatter: formatPrice } },
      responsive: [{ breakpoint: 640, options: { xaxis: { tickAmount: 3 } } }],
    };
  });
}
