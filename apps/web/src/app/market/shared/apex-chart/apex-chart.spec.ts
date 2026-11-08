import { ComponentFixture, TestBed } from '@angular/core/testing';

import {
  FAKE_APEX_CHARTS_PROVIDERS,
  FakeApexCharts,
  flushChartLoad,
} from '../../../market-data/testing/fake-apex-charts';
import { ThemeStore } from '../../../theme/theme-store';
import { APEX_CHARTS_LOADER, ApexChart, type ChartOptions, type ChartSeries } from './apex-chart';

const OPTIONS: ChartOptions = { chart: { type: 'donut', height: 200 } };
const SERIES: ChartSeries = [1, 2];

describe('ApexChart', () => {
  let fixture: ComponentFixture<ApexChart>;

  beforeEach(() => {
    FakeApexCharts.instances = [];
  });

  function create(): void {
    fixture = TestBed.createComponent(ApexChart);
    fixture.componentRef.setInput('options', OPTIONS);
    fixture.componentRef.setInput('series', SERIES);
  }

  async function createAndLoad(): Promise<FakeApexCharts> {
    TestBed.configureTestingModule({ providers: FAKE_APEX_CHARTS_PROVIDERS });
    create();
    await fixture.whenStable();
    await flushChartLoad();
    await fixture.whenStable();
    return FakeApexCharts.last;
  }

  it('cria o gráfico uma vez, com a série e sem animação', async () => {
    const chart = await createAndLoad();

    expect(FakeApexCharts.instances).toHaveLength(1);
    expect(chart.renderCount).toBe(1);
    expect(chart.options.series).toBe(SERIES);
    expect(chart.options.chart?.type).toBe('donut');
    expect(chart.options.chart?.animations?.enabled).toBe(false);
    expect(chart.seriesUpdates).toEqual([]);
    expect(chart.optionUpdates).toEqual([]);
  });

  it('atualiza a série sem recriar o gráfico', async () => {
    const chart = await createAndLoad();
    const series: ChartSeries = [3, 4];

    fixture.componentRef.setInput('series', series);
    await fixture.whenStable();

    expect(FakeApexCharts.instances).toHaveLength(1);
    expect(chart.seriesUpdates).toEqual([{ series, animate: false }]);
    expect(chart.optionUpdates).toEqual([]);
  });

  it('atualiza as opções sem redesenhar do zero nem animar', async () => {
    const chart = await createAndLoad();
    const options: ChartOptions = { labels: ['ALFA3'] };

    fixture.componentRef.setInput('options', options);
    await fixture.whenStable();

    expect(FakeApexCharts.instances).toHaveLength(1);
    expect(chart.optionUpdates).toEqual([
      { options: { ...options, theme: { mode: 'light' } }, redraw: false, animate: false },
    ]);
    expect(chart.seriesUpdates).toEqual([]);
  });

  it('acompanha a troca de tema sem recriar o gráfico', async () => {
    const chart = await createAndLoad();
    expect(chart.options.theme?.mode).toBe('light');

    TestBed.inject(ThemeStore).toggle();
    await fixture.whenStable();

    expect(FakeApexCharts.instances).toHaveLength(1);
    expect(chart.optionUpdates.at(-1)?.options.theme?.mode).toBe('dark');
    delete document.documentElement.dataset['theme'];
    localStorage.clear();
  });

  it('destrói o gráfico junto com o componente', async () => {
    const chart = await createAndLoad();

    fixture.destroy();

    expect(chart.destroyed).toBe(true);
  });

  it('não cria o gráfico se o componente for destruído durante o carregamento', async () => {
    let finishLoading: (value: never) => void = () => undefined;
    TestBed.configureTestingModule({
      providers: [
        {
          provide: APEX_CHARTS_LOADER,
          useValue: () => new Promise((resolve) => (finishLoading = resolve)),
        },
      ],
    });
    create();
    await fixture.whenStable();

    fixture.destroy();
    finishLoading(FakeApexCharts as never);
    await flushChartLoad();

    expect(FakeApexCharts.instances).toHaveLength(0);
  });

  it('avisa quando a biblioteca não pode ser carregada', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    TestBed.configureTestingModule({
      providers: [
        { provide: APEX_CHARTS_LOADER, useValue: () => Promise.reject(new Error('rede')) },
      ],
    });
    create();
    const failed = vi.fn();
    fixture.componentInstance.loadFailed.subscribe(failed);

    await fixture.whenStable();
    await flushChartLoad();

    expect(failed).toHaveBeenCalledOnce();
    vi.restoreAllMocks();
  });
});
