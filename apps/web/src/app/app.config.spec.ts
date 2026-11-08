import { ApplicationInitStatus } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { appConfig } from './app.config';
import { FakeWebSocket } from './market-data/testing/fake-web-socket';
import { IN_PROCESS_MARKET_CONNECTION_PROVIDERS } from './market-data/testing/in-process-market-connection';

describe('appConfig', () => {
  beforeEach(() => {
    vi.stubGlobal('WebSocket', FakeWebSocket);
    FakeWebSocket.instances = [];
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    vi.unstubAllGlobals();
  });

  it('abre uma única conexão ao iniciar a aplicação, sem depender dela para concluir', async () => {
    TestBed.configureTestingModule({ providers: [...appConfig.providers, ...IN_PROCESS_MARKET_CONNECTION_PROVIDERS] });

    await TestBed.inject(ApplicationInitStatus).donePromise;

    expect(FakeWebSocket.instances).toHaveLength(1);
    expect(FakeWebSocket.last.url).toBe('ws://127.0.0.1:8090');
  });
});
