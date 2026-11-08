import type { Provider } from '@angular/core';

import {
  APEX_CHARTS_LOADER,
  type ChartConstructor,
  type ChartOptions,
  type ChartSeries,
} from '../../market/shared/apex-chart/apex-chart';

/** Substituto do ApexCharts, que não consegue medir nem desenhar SVG no jsdom. */
export class FakeApexCharts {
  static instances: FakeApexCharts[] = [];

  static get last(): FakeApexCharts {
    return FakeApexCharts.instances[FakeApexCharts.instances.length - 1];
  }

  destroyed = false;
  renderCount = 0;
  seriesUpdates: { series: ChartSeries; animate: boolean | undefined }[] = [];
  optionUpdates: {
    options: ChartOptions;
    redraw: boolean | undefined;
    animate: boolean | undefined;
  }[] = [];

  constructor(
    readonly element: Element,
    readonly options: ChartOptions,
  ) {
    FakeApexCharts.instances.push(this);
  }

  render(): Promise<never> {
    this.renderCount++;
    return Promise.resolve(this as never);
  }

  updateSeries(series: ChartSeries, animate?: boolean): Promise<never> {
    this.seriesUpdates.push({ series, animate });
    return Promise.resolve(this as never);
  }

  updateOptions(options: ChartOptions, redraw?: boolean, animate?: boolean): Promise<never> {
    this.optionUpdates.push({ options, redraw, animate });
    return Promise.resolve(this as never);
  }

  destroy(): void {
    this.destroyed = true;
  }
}

export const FAKE_APEX_CHARTS_PROVIDERS: Provider[] = [
  {
    provide: APEX_CHARTS_LOADER,
    useValue: () => Promise.resolve(FakeApexCharts as unknown as ChartConstructor),
  },
];

/** Deixa o carregamento assíncrono do gráfico terminar. */
export async function flushChartLoad(): Promise<void> {
  for (let turn = 0; turn < 5; turn++) {
    await Promise.resolve();
  }
}
