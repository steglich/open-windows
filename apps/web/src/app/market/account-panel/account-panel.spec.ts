import { ComponentFixture, TestBed } from '@angular/core/testing';

import { MarketStore } from '../../market-data/market-store';
import { FakeWebSocket } from '../../market-data/testing/fake-web-socket';
import {
  accountMessage,
  PT_BR_PROVIDERS,
  startConnected,
  textOf,
} from '../../market-data/testing/market-fixtures';
import { AccountPanel } from './account-panel';

describe('AccountPanel', () => {
  let fixture: ComponentFixture<AccountPanel>;
  let socket: FakeWebSocket;

  beforeEach(() => {
    vi.stubGlobal('WebSocket', FakeWebSocket);
    FakeWebSocket.instances = [];
    TestBed.configureTestingModule({ providers: PT_BR_PROVIDERS });
    const store = TestBed.inject(MarketStore);
    fixture = TestBed.createComponent(AccountPanel);
    socket = startConnected(store);
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    vi.unstubAllGlobals();
  });

  function element(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function cards(): string[][] {
    return Array.from(element().querySelectorAll('article')).map((card) =>
      Array.from(card.children)
        .slice(0, 2)
        .map((child) => textOf(child).trim()),
    );
  }

  it('avisa que está aguardando enquanto não há saldo', async () => {
    await fixture.whenStable();

    expect(textOf(element())).toContain('Aguardando dados');
    expect(cards()).toEqual([]);
  });

  it('mostra a conta e os quatro valores, derivando o valor em ativos', async () => {
    socket.receive(accountMessage());
    await fixture.whenStable();

    expect(textOf(element())).toContain('SIM-0001');
    expect(cards()).toEqual([
      ['Patrimônio total', 'R$ 1.000,00'],
      ['Saldo disponível', 'R$ 300,00'],
      ['Saldo bloqueado', 'R$ 200,00'],
      ['Valor em ativos', 'R$ 500,00'],
    ]);
  });

  it('atualiza os cards quando chega um novo saldo', async () => {
    socket.receive(accountMessage());
    await fixture.whenStable();

    socket.receive(accountMessage({ totalEquity: 2000 }));
    await fixture.whenStable();

    expect(cards()[0]).toEqual(['Patrimônio total', 'R$ 2.000,00']);
    expect(cards()[3]).toEqual(['Valor em ativos', 'R$ 1.500,00']);
  });

  it('mantém os valores com o aviso de desatualizado ao cair a conexão', async () => {
    socket.receive(accountMessage());
    socket.drop();
    await fixture.whenStable();

    expect(textOf(element())).toContain('Dados desatualizados');
    expect(cards()).toHaveLength(4);
  });
});
