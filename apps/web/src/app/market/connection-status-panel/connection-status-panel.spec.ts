import { ComponentFixture, TestBed } from '@angular/core/testing';

import { MarketSocket } from '../../market-data/market-socket';
import { MarketStore } from '../../market-data/market-store';
import { FakeWebSocket } from '../../market-data/testing/fake-web-socket';
import { startConnected, textOf } from '../../market-data/testing/market-fixtures';
import { ConnectionStatusPanel } from './connection-status-panel';

describe('ConnectionStatusPanel', () => {
  let fixture: ComponentFixture<ConnectionStatusPanel>;
  let store: MarketStore;

  beforeEach(() => {
    vi.stubGlobal('WebSocket', FakeWebSocket);
    FakeWebSocket.instances = [];
    store = TestBed.inject(MarketStore);
    fixture = TestBed.createComponent(ConnectionStatusPanel);
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    vi.unstubAllGlobals();
  });

  async function text(): Promise<string> {
    await fixture.whenStable();
    return textOf(fixture.nativeElement);
  }

  it('indica que está desconectado antes de iniciar', async () => {
    expect(await text()).toContain('Desconectado');
  });

  it('indica que está conectando', async () => {
    store.start();

    expect(await text()).toContain('Conectando');
  });

  it('indica que está conectado', async () => {
    startConnected(store);

    expect(await text()).toContain('Conectado');
  });

  it('indica que está reconectando', async () => {
    startConnected(store).drop();

    expect(await text()).toContain('Reconectando');
  });

  it('indica que a conexão foi encerrada', async () => {
    startConnected(store);
    TestBed.inject(MarketSocket).disconnect();

    expect(await text()).toContain('Desconectado');
  });

  it('exibe o código e a mensagem do erro do servidor', async () => {
    startConnected(store).receive({
      type: 'error',
      code: 'UNKNOWN_SYMBOL',
      message: 'Ativo desconhecido: XXXX1.',
    });

    const content = await text();
    expect(content).toContain('UNKNOWN_SYMBOL');
    expect(content).toContain('Ativo desconhecido: XXXX1.');
  });
});
