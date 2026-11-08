import { ComponentFixture, TestBed } from '@angular/core/testing';

import { MarketStore } from '../../market-data/market-store';
import {
  FAKE_APEX_CHARTS_PROVIDERS,
  FakeApexCharts,
  flushChartLoad,
} from '../../market-data/testing/fake-apex-charts';
import { FakeWebSocket } from '../../market-data/testing/fake-web-socket';
import {
  answerCandles,
  candle,
  PT_BR_PROVIDERS,
  quoteMessage,
  startConnected,
  textOf,
} from '../../market-data/testing/market-fixtures';
import { ThemeStore } from '../../theme/theme-store';
import { APEX_CHARTS_LOADER } from '../shared/apex-chart/apex-chart';
import { PriceChartPanel } from './price-chart-panel';

const MINUTE = 60_000;

describe('PriceChartPanel', () => {
  let fixture: ComponentFixture<PriceChartPanel>;
  let store: MarketStore;
  let socket: FakeWebSocket;

  beforeEach(() => {
    vi.stubGlobal('WebSocket', FakeWebSocket);
    FakeWebSocket.instances = [];
    FakeApexCharts.instances = [];
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    vi.unstubAllGlobals();
  });

  function setUp(providers = FAKE_APEX_CHARTS_PROVIDERS): void {
    TestBed.configureTestingModule({ providers: [...PT_BR_PROVIDERS, ...providers] });
    store = TestBed.inject(MarketStore);
    fixture = TestBed.createComponent(PriceChartPanel);
    socket = startConnected(store);
  }

  function text(): string {
    return textOf(fixture.nativeElement);
  }

  async function settle(): Promise<void> {
    await fixture.whenStable();
    await flushChartLoad();
    await fixture.whenStable();
  }

  it('avisa que está aguardando enquanto não há candles', async () => {
    setUp();
    await settle();

    expect(text()).toContain('Aguardando dados');
    expect(FakeApexCharts.instances).toHaveLength(0);
  });

  it('mostra o gráfico de candlestick, o ativo e o intervalo', async () => {
    setUp();
    answerCandles(socket, [candle(0), candle(MINUTE)]);
    await settle();

    expect(text()).toContain('ALFA3');
    expect(text()).toContain('1 minuto');
    expect(FakeApexCharts.last.options.chart?.type).toBe('candlestick');
    expect((FakeApexCharts.last.options.series as { data: unknown[] }[])[0].data).toHaveLength(2);
  });

  it('atualiza o último candle sem recriar o gráfico', async () => {
    setUp();
    answerCandles(socket, [candle(0), candle(MINUTE)]);
    await settle();

    socket.receive(quoteMessage('ALFA3', { last: 40, updatedAt: MINUTE + 500 }));
    await settle();

    expect(FakeApexCharts.instances).toHaveLength(1);
    const [update] = FakeApexCharts.last.seriesUpdates;
    const data = (update.series as { data: { y: number[] }[] }[])[0].data;
    expect(data[1].y).toEqual([32, 40, 31.5, 40]);
    expect(data[0].y).toEqual([32, 33, 31.5, 32.5]);
  });

  it('troca as cores dos candles com o tema sem recriar o gráfico', async () => {
    setUp();
    answerCandles(socket, [candle(0)]);
    await settle();
    const before = FakeApexCharts.last.options.plotOptions?.candlestick?.colors?.upward;

    TestBed.inject(ThemeStore).toggle();
    await settle();

    expect(FakeApexCharts.instances).toHaveLength(1);
    const update = FakeApexCharts.last.optionUpdates.at(-1)?.options;
    expect(update?.theme?.mode).toBe('dark');
    expect(update?.plotOptions?.candlestick?.colors?.upward).not.toBe(before);
    delete document.documentElement.dataset['theme'];
    localStorage.clear();
  });

  it('volta a aguardar ao trocar de ativo e mostra os candles do novo', async () => {
    setUp();
    answerCandles(socket, [candle(0)]);
    await settle();

    store.select('BETA4');
    await settle();
    expect(text()).toContain('Aguardando dados');
    expect(text()).toContain('BETA4');

    answerCandles(socket, [candle(MINUTE)]);
    await settle();
    expect(text()).not.toContain('Aguardando dados');
    expect(FakeApexCharts.last.destroyed).toBe(false);
  });

  it('mostra em texto o último preço e a variação', async () => {
    setUp();
    socket.receive(quoteMessage('ALFA3', { last: 32.5, change: 0.5 }));
    await settle();

    expect(text()).toContain('R$ 32,50');
    expect(text()).toContain('+R$ 0,50');
  });

  it('avisa que os dados estão desatualizados ao cair a conexão', async () => {
    setUp();
    answerCandles(socket, [candle(0)]);
    socket.drop();
    await settle();

    expect(text()).toContain('Dados desatualizados');
    expect(FakeApexCharts.instances).toHaveLength(1);
  });

  it('informa quando a biblioteca do gráfico não pode ser carregada', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    setUp([{ provide: APEX_CHARTS_LOADER, useValue: () => Promise.reject(new Error('rede')) }]);
    answerCandles(socket, [candle(0)]);
    await settle();

    expect(text()).toContain('Não foi possível carregar o gráfico');
    vi.restoreAllMocks();
  });
});
