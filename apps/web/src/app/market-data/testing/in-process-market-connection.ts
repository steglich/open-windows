import type { Provider } from '@angular/core';
import { Subject } from 'rxjs';

import { MarketConnectionFactory, type MarketConnection } from '../connection/market-connection';
import { UpstreamSocket } from '../connection/upstream-socket';
import type { ConnectionStatus } from '../connection/worker-messages';
import type { ClientMessage, ServerMessage } from '../market-protocol';

/** Fala direto com o `UpstreamSocket`, sem o roteamento entre abas do `MarketHub`. */
class InProcessMarketConnection implements MarketConnection {
  private readonly statusSubject = new Subject<ConnectionStatus>();
  private readonly messagesSubject = new Subject<ServerMessage>();
  private readonly upstream: UpstreamSocket;

  readonly status = this.statusSubject.asObservable();
  readonly messages = this.messagesSubject.asObservable();

  constructor(url: string) {
    this.upstream = new UpstreamSocket(url, {
      onStatus: (status) => this.statusSubject.next(status),
      onMessage: (message) => this.messagesSubject.next(message),
    });
  }

  open(): void {
    this.upstream.connect();
  }

  send(message: ClientMessage): void {
    this.upstream.send(message);
  }

  close(): void {
    this.upstream.disconnect();
  }
}

class InProcessMarketConnectionFactory implements MarketConnectionFactory {
  create(url: string): MarketConnection {
    return new InProcessMarketConnection(url);
  }
}

/** Mantém `FakeWebSocket` e asserções síncronas, já que `SharedWorker` não existe no jsdom. */
export const IN_PROCESS_MARKET_CONNECTION_PROVIDERS: Provider[] = [
  { provide: MarketConnectionFactory, useClass: InProcessMarketConnectionFactory },
];
