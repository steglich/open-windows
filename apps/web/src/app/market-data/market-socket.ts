import { DestroyRef, inject, Injectable, InjectionToken, signal } from '@angular/core';
import { Subject, Subscription } from 'rxjs';

import { MarketConnectionFactory, type MarketConnection } from './connection/market-connection';
import type { ConnectionStatus } from './connection/worker-messages';
import type { ClientMessage, ServerMessage } from './market-protocol';

export type { ConnectionStatus };

export const MARKET_SOCKET_URL = new InjectionToken<string>('MARKET_SOCKET_URL', {
  providedIn: 'root',
  factory: () => 'ws://127.0.0.1:8090',
});

/** Fachada da conexão criada pela Factory, com o estado exposto como signal. */
@Injectable({ providedIn: 'root' })
export class MarketSocket {
  private readonly url = inject(MARKET_SOCKET_URL);
  private readonly factory = inject(MarketConnectionFactory);
  private readonly statusState = signal<ConnectionStatus>('closed');
  private readonly messagesSubject = new Subject<ServerMessage>();

  readonly status = this.statusState.asReadonly();
  // Um signal guardaria só o último valor e perderia parte das rajadas de cada ciclo.
  readonly messages = this.messagesSubject.asObservable();

  private connection: MarketConnection | undefined;
  private links: Subscription | undefined;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.disconnect());
  }

  connect(): void {
    if (this.connection !== undefined) {
      return;
    }
    this.statusState.set('connecting');
    const connection = this.factory.create(this.url);
    this.links = connection.status.subscribe((status) => this.statusState.set(status));
    this.links.add(connection.messages.subscribe((message) => this.messagesSubject.next(message)));
    this.connection = connection;
    connection.open();
  }

  send(message: ClientMessage): void {
    this.connection?.send(message);
  }

  disconnect(): void {
    this.links?.unsubscribe();
    this.connection?.close();
    this.connection = undefined;
    this.statusState.set('closed');
  }
}
