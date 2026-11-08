import {
  afterNextRender,
  Component,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  InjectionToken,
  input,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import type ApexCharts from 'apexcharts';

import { ThemeStore, type Theme } from '../../../theme/theme-store';

export type ChartOptions = ApexCharts.ApexOptions;
export type ChartSeries = NonNullable<ChartOptions['series']>;
type ChartInstance = Pick<ApexCharts, 'render' | 'updateOptions' | 'updateSeries' | 'destroy'>;
export type ChartConstructor = new (element: HTMLElement, options: ChartOptions) => ChartInstance;

/** O `import()` dinâmico mantém a biblioteca fora do bundle inicial. */
export const APEX_CHARTS_LOADER = new InjectionToken<() => Promise<ChartConstructor>>(
  'APEX_CHARTS_LOADER',
  {
    providedIn: 'root',
    factory: () => () => import('apexcharts').then((module) => module.default),
  },
);

function withDefaults(options: ChartOptions, series: ChartSeries, mode: Theme): ChartOptions {
  return {
    ...options,
    series,
    theme: { mode },
    chart: {
      background: 'transparent',
      fontFamily: 'inherit',
      animations: { enabled: false },
      toolbar: { show: false },
      zoom: { enabled: false },
      ...options.chart,
    },
  };
}

/** Único ponto da aplicação que conhece o ApexCharts. */
@Component({
  selector: 'app-apex-chart',
  host: { class: 'block' },
  template: '<div #target></div>',
})
export class ApexChart {
  readonly options = input.required<ChartOptions>();
  readonly series = input.required<ChartSeries>();
  readonly loadFailed = output<void>();

  private readonly target = viewChild.required<ElementRef<HTMLElement>>('target');
  private readonly loader = inject(APEX_CHARTS_LOADER);
  private readonly theme = inject(ThemeStore).theme;
  private readonly rendered = signal<ChartInstance | null>(null);

  private instance: ChartInstance | undefined;
  private destroyed = false;
  private appliedOptions: ChartOptions | undefined;
  private appliedTheme: Theme | undefined;
  private appliedSeries: ChartSeries | undefined;

  constructor() {
    afterNextRender(() => void this.create());

    effect(() => {
      const chart = this.rendered();
      const options = this.options();
      const mode = this.theme();
      if (chart !== null && (options !== this.appliedOptions || mode !== this.appliedTheme)) {
        this.appliedOptions = options;
        this.appliedTheme = mode;
        void chart.updateOptions({ ...options, theme: { mode } }, false, false);
      }
    });

    effect(() => {
      const chart = this.rendered();
      const series = this.series();
      if (chart !== null && series !== this.appliedSeries) {
        this.appliedSeries = series;
        void chart.updateSeries(series, false);
      }
    });

    inject(DestroyRef).onDestroy(() => {
      this.destroyed = true;
      this.instance?.destroy();
    });
  }

  private async create(): Promise<void> {
    try {
      const Chart = await this.loader();
      if (this.destroyed) {
        return;
      }
      this.appliedOptions = untracked(this.options);
      this.appliedTheme = untracked(this.theme);
      this.appliedSeries = untracked(this.series);
      const chart = new Chart(
        this.target().nativeElement,
        withDefaults(this.appliedOptions, this.appliedSeries, this.appliedTheme),
      );
      this.instance = chart;
      await chart.render();
      if (!this.destroyed) {
        this.rendered.set(chart);
      }
    } catch (error) {
      console.error('Não foi possível carregar o gráfico.', error);
      if (!this.destroyed) {
        this.loadFailed.emit();
      }
    }
  }
}
