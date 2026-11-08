import { Observable, Subject } from 'rxjs';

import type { ClientMessage, ServerMessage } from '../market-protocol';
import type { MarketConnection } from './market-connection';
import type {
  ConnectionStatus,
  TabToWorkerMessage,
  WorkerToTabMessage,
} from './worker-messages';

/** Sem quadros, como em documento oculto, os frames pendentes são aplicados depois deste tempo. */
const FRAME_FALLBACK_MS = 100;

/** Lado da aba: fala com o worker pela porta e avisa quando a aba sai. */
export class SharedWorkerMarketConnection implements MarketConnection {
  private readonly statusSubject = new Subject<ConnectionStatus>();
  private readonly messagesSubject = new Subject<ServerMessage>();

  readonly status: Observable<ConnectionStatus> = this.statusSubject.asObservable();
  readonly messages: Observable<ServerMessage> = this.messagesSubject.asObservable();

  private port: MessagePort | undefined;
  private releaseLock: (() => void) | undefined;
  private latestFrames = new Map<string, string>();
  private candleFrames: string[] = [];
  private animationFrameId: number | undefined;
  private fallbackTimer: ReturnType<typeof setTimeout> | undefined;

  private readonly onPageHide = (): void => this.detach();
  private readonly onPageShow = (event: PageTransitionEvent): void => {
    if (event.persisted && this.port === undefined) {
      this.attach();
    }
  };

  constructor(
    private readonly url: string,
    private readonly createWorker: () => SharedWorker,
    private readonly afterFlush: () => void = () => undefined,
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
    this.cancelScheduledFlush();
    this.latestFrames.clear();
    this.candleFrames = [];
  }

  private receive(data: WorkerToTabMessage): void {
    if (data.type === 'frame') {
      this.hold(data.frame, data.key);
      return;
    }
    // Mantém a ordem de chegada: o que veio antes de uma mensagem de controle é aplicado antes dela.
    this.flush();
    if (data.type === 'status') {
      this.statusSubject.next(data.status);
    } else {
      this.messagesSubject.next(data.message);
    }
  }

  private hold(frame: string, key: string | null): void {
    if (key === null) {
      this.candleFrames.push(frame);
    } else {
      this.latestFrames.set(key, frame);
    }
    if (this.fallbackTimer === undefined) {
      this.fallbackTimer = setTimeout(() => this.flush(), FRAME_FALLBACK_MS);
      this.animationFrameId = requestAnimationFrame(() => {
        this.flush();
        this.afterFlush();
      });
    }
  }

  private cancelScheduledFlush(): void {
    if (this.fallbackTimer !== undefined) {
      clearTimeout(this.fallbackTimer);
      this.fallbackTimer = undefined;
    }
    if (this.animationFrameId !== undefined) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = undefined;
    }
  }

  /** Só os frames que sobraram chegam a ser parseados. */
  private flush(): void {
    this.cancelScheduledFlush();
    const latest = this.latestFrames;
    const candles = this.candleFrames;
    this.latestFrames = new Map();
    this.candleFrames = [];
    latest.forEach((frame) => this.publishFrame(frame));
    candles.forEach((frame) => this.publishFrame(frame));
  }

  /** O worker já validou o frame. */
  private publishFrame(frame: string): void {
    this.messagesSubject.next(JSON.parse(frame) as ServerMessage);
  }

  private post(message: TabToWorkerMessage): void {
    this.port?.postMessage(message);
  }
}
