import { ApplicationRef, inject, Injectable } from '@angular/core';
import { NEVER, Observable, of } from 'rxjs';

import type { ClientMessage, ServerMessage } from '../market-protocol';
import { SharedWorkerMarketConnection } from './shared-worker-market-connection';
import type { ConnectionStatus } from './worker-messages';

/** Conexão com o mercado. Assine `status` e `messages` antes de chamar `open`. */
export interface MarketConnection {
  readonly status: Observable<ConnectionStatus>;
  readonly messages: Observable<ServerMessage>;
  open(): void;
  send(message: ClientMessage): void;
  close(): void;
}

/** Conexão de navegadores sem SharedWorker: informa o estado e não faz mais nada. */
export class UnavailableMarketConnection implements MarketConnection {
  readonly status = of<ConnectionStatus>('unavailable');
  readonly messages = NEVER;

  open(): void {}
  send(): void {}
  close(): void {}
}

@Injectable({ providedIn: 'root' })
export class BrowserMarketConnectionFactory {
  private readonly appRef = inject(ApplicationRef);

  create(url: string): MarketConnection {
    if (typeof SharedWorker === 'undefined') {
      return new UnavailableMarketConnection();
    }
    return new SharedWorkerMarketConnection(
      url,
      // O builder só empacota o worker quando a expressão é escrita nesta forma.
      () => new SharedWorker(new URL('./market.worker', import.meta.url), { type: 'module' }),
      // Dentro do `requestAnimationFrame`, o agendador do Angular só renderizaria após a pintura.
      () => this.appRef.tick(),
    );
  }
}

/** Ponto único de criação da conexão, substituído nos specs. */
@Injectable({ providedIn: 'root', useExisting: BrowserMarketConnectionFactory })
export abstract class MarketConnectionFactory {
  abstract create(url: string): MarketConnection;
}
