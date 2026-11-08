import { ComponentFixture, TestBed } from '@angular/core/testing';

import { MarketStore } from '../../market-data/market-store';
import { FakeWebSocket } from '../../market-data/testing/fake-web-socket';
import {
  bookMessage,
  PT_BR_PROVIDERS,
  startConnected,
  textOf,
} from '../../market-data/testing/market-fixtures';
import { OrderBookPanel } from './order-book-panel';

describe('OrderBookPanel', () => {
  let fixture: ComponentFixture<OrderBookPanel>;
  let store: MarketStore;
  let socket: FakeWebSocket;

  beforeEach(() => {
    vi.stubGlobal('WebSocket', FakeWebSocket);
    FakeWebSocket.instances = [];
    TestBed.configureTestingModule({ providers: PT_BR_PROVIDERS });
    store = TestBed.inject(MarketStore);
    fixture = TestBed.createComponent(OrderBookPanel);
    socket = startConnected(store);
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    vi.unstubAllGlobals();
  });

  function element(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  /** Linhas de cada lado, com as células de cada linha já formatadas. */
  function sides(): string[][][] {
    return Array.from(element().querySelectorAll('table')).map((table) =>
      Array.from(table.querySelectorAll('tbody tr')).map((row) =>
        Array.from(row.querySelectorAll('td')).map((cell) => textOf(cell).trim()),
      ),
    );
  }

  it('destaca o melhor preço de cada lado e o spread', async () => {
    socket.receive(bookMessage('ALFA3'));
    await fixture.whenStable();

    const best = Array.from(element().querySelectorAll('[data-testid="best-price"]')).map((item) =>
      Array.from(item.children)
        .map((part) => textOf(part).trim())
        .join(' '),
    );
    expect(best).toEqual(['Melhor compra R$ 32,49', 'Melhor venda R$ 32,51']);
    expect(textOf(element().querySelector('[data-testid="spread"]')!)).toContain('R$ 0,02');
  });

  it('mostra o ativo selecionado e os dois lados na ordem recebida', async () => {
    socket.receive(bookMessage('ALFA3'));
    await fixture.whenStable();

    expect(textOf(element())).toContain('ALFA3');
    expect(Array.from(element().querySelectorAll('caption')).map(textOf)).toEqual([
      'Compra',
      'Venda',
    ]);
    expect(sides()).toEqual([
      [
        ['R$ 32,49', '100', '1'],
        ['R$ 32,48', '200', '2'],
      ],
      [
        ['R$ 32,51', '300', '3'],
        ['R$ 32,52', '400', '4'],
      ],
    ]);
  });

  it('atualiza os níveis quando chega um novo book', async () => {
    socket.receive(bookMessage('ALFA3'));
    await fixture.whenStable();

    socket.receive(bookMessage('ALFA3', { bids: [{ price: 30, quantity: 5, orders: 1 }] }));
    await fixture.whenStable();

    expect(sides()[0]).toEqual([['R$ 30,00', '5', '1']]);
  });

  it('volta a aguardar dados ao trocar de ativo, até chegar o novo book', async () => {
    socket.receive(bookMessage('ALFA3'));
    await fixture.whenStable();

    store.select('BETA4');
    await fixture.whenStable();

    expect(textOf(element())).toContain('BETA4');
    expect(textOf(element())).toContain('Aguardando dados');
    expect(element().querySelector('table')).toBeNull();

    socket.receive(bookMessage('BETA4'));
    await fixture.whenStable();

    expect(textOf(element())).not.toContain('Aguardando dados');
    expect(element().querySelectorAll('table')).toHaveLength(2);
  });
});
