import { TestBed, type ComponentFixture } from '@angular/core/testing';

import { FAKE_APEX_CHARTS_PROVIDERS, FakeApexCharts } from '../../market-data/testing/fake-apex-charts';
import { FakeWebSocket } from '../../market-data/testing/fake-web-socket';
import { IN_PROCESS_MARKET_CONNECTION_PROVIDERS } from '../../market-data/testing/in-process-market-connection';
import { welcome } from '../../market-data/testing/market-fixtures';
import { MarketStore } from '../../market-data/market-store';
import { PANELS, type PanelId } from '../panel-windows/panel-catalog';
import { PANEL_WINDOW_BRIDGE } from '../panel-windows/panel-window-bridge';
import {
  PANEL_OPEN_TIMEOUT_MS,
  PANEL_RETURN_DELAY_MS,
  PanelWindows,
} from '../panel-windows/panel-windows';
import {
  FAKE_PANEL_WINDOW_PROVIDERS,
  FakePanelWindowBridge,
} from '../panel-windows/testing/fake-panel-window';
import { Dashboard } from './dashboard';

const PANEL_SELECTORS = [
  'app-connection-status-panel',
  'app-quotes-panel',
  'app-order-book-panel',
  'app-portfolio-panel',
  'app-account-panel',
  'app-price-chart-panel',
];

describe('Dashboard', () => {
  beforeEach(async () => {
    vi.stubGlobal('WebSocket', FakeWebSocket);
    FakeWebSocket.instances = [];
    FakeApexCharts.instances = [];
    await TestBed.configureTestingModule({
      imports: [Dashboard],
      providers: [
        ...FAKE_APEX_CHARTS_PROVIDERS,
        ...IN_PROCESS_MARKET_CONNECTION_PROVIDERS,
        ...FAKE_PANEL_WINDOW_PROVIDERS,
      ],
    }).compileComponents();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  async function render(): Promise<{ fixture: ComponentFixture<Dashboard>; page: HTMLElement }> {
    const fixture = TestBed.createComponent(Dashboard);
    await fixture.whenStable();
    return { fixture, page: fixture.nativeElement as HTMLElement };
  }

  it('mostra o nome do homebroker', async () => {
    const { page } = await render();

    expect(page.querySelector('h1')?.textContent).toContain('Open Windows Homebroker');
  });

  it('cada item da barra lateral leva a uma seção existente', async () => {
    const { page } = await render();

    const links = Array.from(page.querySelectorAll('nav a'));
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) {
      expect(page.querySelector(link.getAttribute('href') as string)).not.toBeNull();
    }
  });

  it('exibe os seis painéis sem abrir conexão nem criar gráficos', async () => {
    const { page } = await render();

    for (const panel of PANEL_SELECTORS) {
      expect(page.querySelector(panel)).not.toBeNull();
    }
    expect(FakeWebSocket.instances).toHaveLength(0);
    expect(FakeApexCharts.instances).toHaveLength(0);
  });

  describe('com painéis em janelas', () => {
    let bridge: FakePanelWindowBridge;

    beforeEach(() => {
      bridge = TestBed.inject(PANEL_WINDOW_BRIDGE) as FakePanelWindowBridge;
      vi.spyOn(window, 'open').mockReturnValue(null);
    });

    async function detach(fixture: ComponentFixture<Dashboard>, ...panels: PanelId[]): Promise<void> {
      for (const panel of panels) {
        TestBed.inject(PanelWindows).open(panel);
        bridge.ready(panel);
      }
      await fixture.whenStable();
    }

    async function closeWindow(fixture: ComponentFixture<Dashboard>, panel: PanelId): Promise<void> {
      vi.useFakeTimers();
      bridge.releasePanel(panel);
      // A folga deixa o agendador do Angular rodar antes de voltar aos timers reais.
      vi.advanceTimersByTime(PANEL_RETURN_DELAY_MS + 50);
      vi.useRealTimers();
      await fixture.whenStable();
    }

    function navHrefs(page: HTMLElement): (string | null)[] {
      return Array.from(page.querySelectorAll('nav a')).map((link) => link.getAttribute('href'));
    }

    it('tira o painel aberto em janela e mantém os demais', async () => {
      const { fixture, page } = await render();

      await detach(fixture, 'book');

      expect(page.querySelector('app-order-book-panel')).toBeNull();
      for (const panel of PANEL_SELECTORS.filter((name) => name !== 'app-order-book-panel')) {
        expect(page.querySelector(panel)).not.toBeNull();
      }
    });

    it('devolve o painel à posição original ao fechar a janela', async () => {
      const { fixture, page } = await render();
      await detach(fixture, 'book');

      await closeWindow(fixture, 'book');

      const book = page.querySelector('app-order-book-panel')!;
      expect(book).not.toBeNull();
      expect(book.previousElementSibling?.tagName.toLowerCase()).toBe('app-quotes-panel');
      expect(book.nextElementSibling?.tagName.toLowerCase()).toBe('app-portfolio-panel');
    });

    it('dá largura total ao painel restante da visão geral', async () => {
      const { fixture, page } = await render();
      expect(page.querySelector('app-account-panel')?.classList).toContain('xl:col-span-5');

      await detach(fixture, 'chart');

      expect(page.querySelector('app-account-panel')?.classList).toContain('xl:col-span-12');
      expect(page.querySelector('app-account-panel')?.classList).toContain('block');
    });

    it('omite a visão geral quando os dois painéis estão em janelas', async () => {
      const { fixture, page } = await render();

      await detach(fixture, 'account', 'chart');

      expect(page.querySelector('#visao-geral')).toBeNull();
    });

    it('tira do cabeçalho o status aberto em janela e mantém o tema', async () => {
      const { fixture, page } = await render();

      await detach(fixture, 'status');

      expect(page.querySelector('header app-connection-status-panel')).toBeNull();
      expect(page.querySelector('header app-theme-toggle')).not.toBeNull();
      expect(page.querySelector('h1')).not.toBeNull();
    });

    it('omite da barra lateral somente as seções inteiramente em janelas', async () => {
      const { fixture, page } = await render();

      await detach(fixture, 'quotes', 'chart');

      expect(navHrefs(page)).toEqual(['#visao-geral', '#book', '#carteira']);
      for (const href of navHrefs(page)) {
        expect(page.querySelector(href as string)).not.toBeNull();
      }
    });

    it('recoloca o item da barra lateral quando a seção volta', async () => {
      const { fixture, page } = await render();
      await detach(fixture, 'quotes');

      await closeWindow(fixture, 'quotes');

      expect(navHrefs(page)).toContain('#cotacoes');
    });

    it('informa quando todos os painéis estão em janelas', async () => {
      const { fixture, page } = await render();
      expect(page.textContent).not.toContain('Todos os painéis estão em janelas separadas');

      await detach(fixture, ...PANELS.map(({ id }) => id));

      expect(page.textContent).toContain('Todos os painéis estão em janelas separadas');
    });

    function connect(): FakeWebSocket {
      TestBed.inject(MarketStore).start();
      const socket = FakeWebSocket.last;
      socket.open();
      socket.receive(welcome());
      return socket;
    }

    it('assina todos os canais com todos os painéis na página', async () => {
      await render();

      const channels = connect().sent.flatMap((message) =>
        message.type === 'subscribe' ? [message.channel] : [],
      );

      expect(channels).toEqual(['quote', 'positions', 'account', 'book', 'candle']);
    });

    it('para de receber a carteira aberta em janela e volta a assinar ao fechar', async () => {
      const { fixture } = await render();
      const socket = connect();
      socket.sent.splice(0);

      await detach(fixture, 'portfolio');
      expect(socket.sent.splice(0)).toEqual([{ type: 'unsubscribe', channel: 'positions' }]);

      await closeWindow(fixture, 'portfolio');
      expect(socket.sent).toEqual([{ type: 'subscribe', channel: 'positions' }]);
    });

    it('com as cotações em janela, mantém só a cotação usada pelo gráfico', async () => {
      const { fixture } = await render();
      const socket = connect();
      socket.sent.splice(0);

      await detach(fixture, 'quotes');

      expect(socket.sent).toEqual([
        { type: 'unsubscribe', channel: 'quote' },
        { type: 'subscribe', channel: 'quote', symbols: ['ALFA3'] },
      ]);
    });

    it('não assina nada com todos os painéis em janelas', async () => {
      const { fixture } = await render();
      await detach(fixture, ...PANELS.map(({ id }) => id));

      expect(connect().sent).toEqual([]);
    });

    it('avisa quando a janela não abre e mantém o painel', async () => {
      const { fixture, page } = await render();

      vi.useFakeTimers();
      TestBed.inject(PanelWindows).open('book');
      vi.advanceTimersByTime(PANEL_OPEN_TIMEOUT_MS + 50);
      vi.useRealTimers();
      await fixture.whenStable();

      expect(page.querySelector('[role="alert"]')?.textContent).toContain('não abriu');
      expect(page.querySelector('app-order-book-panel')).not.toBeNull();
    });
  });
});
