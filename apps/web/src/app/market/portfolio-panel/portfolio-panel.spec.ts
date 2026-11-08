import { ComponentFixture, TestBed } from '@angular/core/testing';

import { MarketStore } from '../../market-data/market-store';
import { FakeWebSocket } from '../../market-data/testing/fake-web-socket';
import { IN_PROCESS_MARKET_CONNECTION_PROVIDERS } from '../../market-data/testing/in-process-market-connection';
import {
  portfolio,
  PT_BR_PROVIDERS,
  positionsMessage,
  startConnected,
  textOf,
} from '../../market-data/testing/market-fixtures';
import {
  FAKE_APEX_CHARTS_PROVIDERS,
  FakeApexCharts,
  flushChartLoad,
} from '../../market-data/testing/fake-apex-charts';
import { PortfolioPanel } from './portfolio-panel';

describe('PortfolioPanel', () => {
  let fixture: ComponentFixture<PortfolioPanel>;
  let socket: FakeWebSocket;

  beforeEach(() => {
    vi.stubGlobal('WebSocket', FakeWebSocket);
    FakeWebSocket.instances = [];
    FakeApexCharts.instances = [];
    TestBed.configureTestingModule({
      providers: [...PT_BR_PROVIDERS, ...FAKE_APEX_CHARTS_PROVIDERS, ...IN_PROCESS_MARKET_CONNECTION_PROVIDERS],
    });
    const store = TestBed.inject(MarketStore);
    fixture = TestBed.createComponent(PortfolioPanel);
    socket = startConnected(store);
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    vi.unstubAllGlobals();
  });

  function element(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function rows(): string[][] {
    return Array.from(element().querySelectorAll('tbody tr')).map((row) =>
      Array.from(row.querySelectorAll('th, td')).map((cell) => textOf(cell).trim()),
    );
  }

  describe('distribuição', () => {
    async function settle(): Promise<void> {
      await fixture.whenStable();
      await flushChartLoad();
      await fixture.whenStable();
    }

    it('mostra a rosca e a legenda com ativo e percentual', async () => {
      socket.receive(positionsMessage());
      await settle();

      expect(FakeApexCharts.last.options.chart?.type).toBe('donut');
      expect(FakeApexCharts.last.options.series).toEqual([62_000, 32_500]);
      expect(FakeApexCharts.last.options.labels).toEqual(['OMEG3', 'ALFA3']);
      const legend = Array.from(element().querySelectorAll('li')).map((item) =>
        Array.from(item.children)
          .map((part) => textOf(part).trim())
          .filter((part) => part !== '')
          .join(' '),
      );
      expect(legend).toEqual(['OMEG3 65,6%', 'ALFA3 34,4%']);
    });

    it('só atualiza as opções quando as maiores posições mudam', async () => {
      socket.receive(positionsMessage());
      await settle();

      socket.receive(
        positionsMessage({
          positions: [
            { ...portfolio().positions[1], marketValue: 70_000 },
            portfolio().positions[0],
          ],
        }),
      );
      await settle();

      expect(FakeApexCharts.instances).toHaveLength(1);
      expect(FakeApexCharts.last.optionUpdates).toEqual([]);
      expect(FakeApexCharts.last.seriesUpdates.at(-1)?.series).toEqual([70_000, 32_500]);
    });

    it('não mostra a rosca sem valor de mercado, mantendo totais e tabela', async () => {
      socket.receive(positionsMessage({ positions: [] }));
      await settle();

      expect(FakeApexCharts.instances).toHaveLength(0);
      expect(element().querySelectorAll('dd')).toHaveLength(3);
      expect(element().querySelector('table')).not.toBeNull();
    });
  });

  it('avisa que está aguardando enquanto não há carteira', async () => {
    await fixture.whenStable();

    expect(textOf(element())).toContain('Aguardando dados');
  });

  it('mostra a conta e os totais em reais', async () => {
    socket.receive(positionsMessage());
    await fixture.whenStable();

    const values = Array.from(element().querySelectorAll('dd')).map((value) =>
      textOf(value).trim(),
    );
    expect(values).toEqual(['SIM-0001', 'R$ 1.234,50', '+R$ 100,00']);
  });

  it('mostra todas as posições com seus campos', async () => {
    socket.receive(positionsMessage());
    await fixture.whenStable();

    expect(rows()).toEqual([
      ['ALFA3', '1.000', 'R$ 31,80', 'R$ 32,50', 'R$ 32.500,00', '+R$ 700,00', '+2,20%'],
      ['OMEG3', '5.000', 'R$ 12,95', 'R$ 12,40', 'R$ 62.000,00', '-R$ 2.750,00', '-4,25%'],
    ]);
  });

  it('atualiza totais e posições quando chega uma nova carteira', async () => {
    socket.receive(positionsMessage());
    await fixture.whenStable();

    socket.receive(positionsMessage({ totalMarketValue: 2000, positions: [] }));
    await fixture.whenStable();

    expect(textOf(element())).toContain('R$ 2.000,00');
    expect(rows()).toEqual([]);
  });
});
