import { Observable, Subject } from 'rxjs';

import type { ClientMessage, ServerMessage } from '../market-protocol';
import type { MarketConnection } from './market-connection';
import type {
  ConnectionStatus,
  TabToWorkerMessage,
  WorkerToTabMessage,
} from './worker-messages';

/** Lado da aba: fala com o worker pela porta e avisa quando a aba sai. */
export class SharedWorkerMarketConnection implements MarketConnection {
  private readonly statusSubject = new Subject<ConnectionStatus>();
  private readonly messagesSubject = new Subject<ServerMessage>();

  readonly status: Observable<ConnectionStatus> = this.statusSubject.asObservable();
  readonly messages: Observable<ServerMessage> = this.messagesSubject.asObservable();

  private port: MessagePort | undefined;
  private releaseLock: (() => void) | undefined;

  private readonly onPageHide = (): void => this.detach();
  private readonly onPageShow = (event: PageTransitionEvent): void => {
    if (event.persisted && this.port === undefined) {
      this.attach();
    }
  };

  constructor(
    private readonly url: string,
    private readonly createWorker: () => SharedWorker,
  ) {}

  open(): void {
    window.addEventListener('pagehide', this.onPageHide);
    window.addEventListener('pageshow', this.onPageShow);
    this.attach();
  }

  send(message: ClientMessage): void {
    this.post({ type: 'send', message });
  }

  close(): void {
    window.removeEventListener('pagehide', this.onPageHide);
    window.removeEventListener('pageshow', this.onPageShow);
    this.detach();
  }

  private attach(): void {
    let worker: SharedWorker;
    try {
      worker = this.createWorker();
    } catch {
      this.statusSubject.next('unavailable');
      return;
    }
    worker.onerror = () => this.handleLoadFailure();
    worker.port.onmessage = (event: MessageEvent<WorkerToTabMessage>) => this.receive(event.data);
    this.port = worker.port;
    this.announce(worker.port);
  }

  /** A trava vem antes do `attach` para o worker sempre encontrá-la ocupada ao esperar por ela. */
  private announce(port: MessagePort): void {
    // `navigator.locks` só existe em contexto seguro, embora a lib `dom` o declare sempre.
    const locks = navigator.locks as LockManager | undefined;
    if (locks === undefined) {
      this.post({ type: 'attach', url: this.url });
      return;
    }
    const lock = `open-windows:tab:${crypto.randomUUID()}`;
    void locks.request(lock, () => {
      if (this.port !== port) {
        return;
      }
      this.post({ type: 'attach', url: this.url, lock });
      return new Promise<void>((resolve) => (this.releaseLock = resolve));
    });
  }

  /** Não fecha a porta aqui: o worker a fecha depois de processar o `detach`. */
  private detach(): void {
    this.post({ type: 'detach' });
    this.releasePort();
  }

  private handleLoadFailure(): void {
    this.releasePort();
    this.statusSubject.next('unavailable');
  }

  private releasePort(): void {
    if (this.port !== undefined) {
      this.port.onmessage = null;
      this.port = undefined;
    }
    this.releaseLock?.();
    this.releaseLock = undefined;
  }

  private receive(data: WorkerToTabMessage): void {
    if (data.type === 'status') {
      this.statusSubject.next(data.status);
    } else {
      this.messagesSubject.next(data.message);
    }
  }

  private post(message: TabToWorkerMessage): void {
    this.port?.postMessage(message);
  }
}
