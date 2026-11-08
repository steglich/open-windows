import { TestBed } from '@angular/core/testing';
import { Title } from '@angular/platform-browser';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';

import { routes } from '../../app.routes';
import { FAKE_APEX_CHARTS_PROVIDERS } from '../../market-data/testing/fake-apex-charts';
import { FakeWebSocket } from '../../market-data/testing/fake-web-socket';
import { IN_PROCESS_MARKET_CONNECTION_PROVIDERS } from '../../market-data/testing/in-process-market-connection';
import { welcome } from '../../market-data/testing/market-fixtures';
import { MarketStore } from '../../market-data/market-store';
import { PANEL_WINDOW_BRIDGE, pageLockName, panelLockName } from './panel-window-bridge';
import { FAKE_PANEL_WINDOW_PROVIDERS, FakePanelWindowBridge } from './testing/fake-panel-window';

const PANELS_BY_SLUG = {
  status: { selector: 'app-connection-status-panel', title: 'Status da conexão' },
  saldo: { selector: 'app-account-panel', title: 'Saldo' },
  grafico: { selector: 'app-price-chart-panel', title: 'Gráfico de preço' },
  cotacoes: { selector: 'app-quotes-panel', title: 'Cotações' },
  book: { selector: 'app-order-book-panel', title: 'Book de ofertas' },
  carteira: { selector: 'app-portfolio-panel', title: 'Carteira' },
};
const ALL_SELECTORS = Object.values(PANELS_BY_SLUG).map(({ selector }) => selector);

describe('PanelWindowPage', () => {
  beforeEach(() => {
    vi.stubGlobal('WebSocket', FakeWebSocket);
    FakeWebSocket.instances = [];
    TestBed.configureTestingModule({
      providers: [
        provideRouter(routes),
        ...FAKE_APEX_CHARTS_PROVIDERS,
        ...IN_PROCESS_MARKET_CONNECTION_PROVIDERS,
        ...FAKE_PANEL_WINDOW_PROVIDERS,
      ],
    });
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  async function page(url: string): Promise<{ harness: RouterTestingHarness; element: HTMLElement }> {
    const harness = await RouterTestingHarness.create(url);
    await harness.fixture.whenStable();
    return { harness, element: harness.routeNativeElement as HTMLElement };
  }

  for (const [slug, { selector, title }] of Object.entries(PANELS_BY_SLUG)) {
    it(`renderiza somente o painel de ${slug}, sem controle de abrir`, async () => {
      const { element } = await page(`/janela/${slug}`);

      for (const other of ALL_SELECTORS) {
        expect(element.querySelector(other) !== null).toBe(other === selector);
      }
      expect(element.querySelector('button[aria-label^="Abrir"]')).toBeNull();
      expect(TestBed.inject(Title).getTitle()).toBe(`${title} · Open Windows Homebroker`);
    });
  }

  describe('assinaturas', () => {
    const expected: Record<string, unknown[]> = {
      status: [],
      saldo: [{ type: 'subscribe', channel: 'account' }],
      grafico: [
        { type: 'subscribe', channel: 'quote', symbols: ['ALFA3'] },
        { type: 'subscribe', channel: 'candle', symbols: ['ALFA3'] },
        { type: 'getCandles', requestId: 'candles-1', symbol: 'ALFA3', limit: 120 },
      ],
      cotacoes: [{ type: 'subscribe', channel: 'quote' }],
      book: [{ type: 'subscribe', channel: 'book', symbols: ['ALFA3'] }],
      carteira: [{ type: 'subscribe', channel: 'positions' }],
    };

    for (const [slug, messages] of Object.entries(expected)) {
      it(`a janela de ${slug} assina somente o que o painel usa`, async () => {
        await page(`/janela/${slug}`);

        TestBed.inject(MarketStore).start();
        const socket = FakeWebSocket.last;
        socket.open();
        socket.receive(welcome());

        expect(socket.sent).toEqual(messages);
      });
    }
  });

  describe('ligação com a página principal', () => {
    let bridge: FakePanelWindowBridge;

    beforeEach(() => {
      bridge = TestBed.inject(PANEL_WINDOW_BRIDGE) as FakePanelWindowBridge;
    });

    it('segura a trava da janela e só então avisa que iniciou', async () => {
      const order: string[] = [];
      const hold = bridge.hold.bind(bridge);
      vi.spyOn(bridge, 'hold').mockImplementation((lock, onHeld) => {
        order.push('hold');
        hold(lock, () => {
          order.push('held');
          onHeld?.();
        });
      });

      await page('/janela/book?pagina=p1');

      expect(order).toEqual(['hold', 'held']);
      expect(bridge.held).toEqual([panelLockName('p1', 'book')]);
      expect(bridge.channelsOpened).toEqual(['p1']);
      expect(bridge.posted).toEqual([{ type: 'panel-window-ready', panel: 'book' }]);
    });

    it('fecha a janela quando a trava da página principal é liberada', async () => {
      const close = vi.spyOn(window, 'close').mockImplementation(() => {});
      await page('/janela/book?pagina=p1');
      expect(close).not.toHaveBeenCalled();

      bridge.release(pageLockName('p1'));

      expect(close).toHaveBeenCalledTimes(1);
    });

    it('não se liga a nada sem o parâmetro da página', async () => {
      await page('/janela/book');

      expect(bridge.held).toEqual([]);
      expect(bridge.posted).toEqual([]);
      expect(bridge.channelsOpened).toEqual([]);
    });

    it('não se liga a nada sem os recursos de janela', async () => {
      bridge.supported = false;

      await page('/janela/book?pagina=p1');

      expect(bridge.held).toEqual([]);
      expect(bridge.posted).toEqual([]);
    });
  });

  it('leva à página principal quando o painel não existe', async () => {
    const { element } = await page('/janela/inexistente');

    expect(TestBed.inject(Router).url).toBe('/');
    expect(element.querySelector('h1')?.textContent).toContain('Open Windows Homebroker');
  });
});
