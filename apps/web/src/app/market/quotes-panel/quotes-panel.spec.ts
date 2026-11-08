import { ComponentFixture, TestBed } from '@angular/core/testing';

import { MarketStore } from '../../market-data/market-store';
import { FakeWebSocket } from '../../market-data/testing/fake-web-socket';
import {
  PT_BR_PROVIDERS,
  quoteMessage,
  startConnected,
  textOf,
} from '../../market-data/testing/market-fixtures';
import { QuotesPanel } from './quotes-panel';

describe('QuotesPanel', () => {
  let fixture: ComponentFixture<QuotesPanel>;
  let store: MarketStore;
  let socket: FakeWebSocket;

  beforeEach(() => {
    vi.stubGlobal('WebSocket', FakeWebSocket);
    FakeWebSocket.instances = [];
    TestBed.configureTestingModule({ providers: PT_BR_PROVIDERS });
    store = TestBed.inject(MarketStore);
    fixture = TestBed.createComponent(QuotesPanel);
    socket = startConnected(store);
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    vi.unstubAllGlobals();
  });

  function element(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function row(symbol: string): HTMLTableRowElement {
    const rows = Array.from(element().querySelectorAll('tbody tr'));
    return rows.find((candidate) => textOf(candidate).includes(symbol)) as HTMLTableRowElement;
  }

  it('avisa que está aguardando enquanto não há cotações', async () => {
    await fixture.whenStable();

    expect(textOf(element())).toContain('Aguardando dados');
  });

  it('mostra cada ativo uma única vez com todos os campos', async () => {
    socket.receive(quoteMessage('ALFA3'));
    socket.receive(quoteMessage('BETA4'));
    socket.receive(quoteMessage('ALFA3'));
    await fixture.whenStable();

    expect(element().querySelectorAll('tbody tr')).toHaveLength(2);
    const cells = Array.from(row('ALFA3').querySelectorAll('td')).map((cell) =>
      textOf(cell).trim(),
    );
    expect(cells).toEqual([
      'R$ 32,50',
      '+R$ 0,50',
      '+1,56%',
      'R$ 32,49',
      'R$ 32,51',
      'R$ 32,10',
      'R$ 33,00',
      'R$ 31,90',
      'R$ 32,00',
      '1.500.000',
    ]);
  });

  it('atualiza a linha quando chega uma nova cotação', async () => {
    socket.receive(quoteMessage('ALFA3'));
    await fixture.whenStable();

    socket.receive(quoteMessage('ALFA3', { last: 40.25 }));
    await fixture.whenStable();

    expect(textOf(row('ALFA3'))).toContain('R$ 40,25');
  });

  it('mantém os valores com aviso de desatualizado quando a conexão cai', async () => {
    socket.receive(quoteMessage('ALFA3'));
    socket.drop();
    await fixture.whenStable();

    expect(textOf(element())).toContain('R$ 32,50');
    expect(textOf(element())).toContain('Dados desatualizados');
  });

  describe('seleção', () => {
    beforeEach(async () => {
      socket.receive(quoteMessage('ALFA3'));
      socket.receive(quoteMessage('BETA4'));
      await fixture.whenStable();
    });

    it('seleciona ao clicar na linha e a destaca', async () => {
      row('BETA4').querySelector('td')!.click();
      await fixture.whenStable();

      expect(store.selectedSymbol()).toBe('BETA4');
      expect(row('BETA4').classList).toContain('bg-sky-100');
      expect(row('ALFA3').classList).not.toContain('bg-sky-100');
    });

    it('oferece um botão nativo na linha, que o Enter aciona', async () => {
      const button = row('BETA4').querySelector('button')!;
      expect(button.getAttribute('type')).toBe('button');
      expect(button.getAttribute('aria-pressed')).toBe('false');

      // O jsdom não converte Enter em click; o navegador faz isso em um botão nativo.
      button.click();
      await fixture.whenStable();

      expect(store.selectedSymbol()).toBe('BETA4');
      expect(button.getAttribute('aria-pressed')).toBe('true');
    });
  });
});
