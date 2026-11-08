import { DestroyRef, DOCUMENT, inject, Injectable, signal } from '@angular/core';

import { panelById, type PanelId } from './panel-catalog';
import {
  PANEL_WINDOW_BRIDGE,
  pageLockName,
  panelLockName,
  type PanelWindowChannel,
} from './panel-window-bridge';
import { parsePanelWindowMessage } from './panel-window-messages';

/**
 * A trava da janela também é liberada ao recarregar. O `ready` da recarga precisa chegar dentro
 * deste prazo para o painel não voltar à página.
 */
export const PANEL_RETURN_DELAY_MS = 1000;

/** Com `noopener`, a única forma de notar uma janela bloqueada é ela não iniciar. */
export const PANEL_OPEN_TIMEOUT_MS = 5000;

type Timer = ReturnType<typeof setTimeout>;

/** Janelas de painel abertas por esta página, cada uma em seu próprio processo. */
@Injectable({ providedIn: 'root' })
export class PanelWindows {
  private readonly window = inject(DOCUMENT).defaultView as Window;
  private readonly bridge = inject(PANEL_WINDOW_BRIDGE);
  private readonly pageId = this.bridge.createId();
  private readonly opening = new Map<PanelId, Timer>();
  private readonly pendingReturns = new Map<PanelId, Timer>();
  private readonly releaseWatchers = new Map<PanelId, () => void>();
  private channel: PanelWindowChannel | undefined;

  private readonly detachedState = signal<ReadonlySet<PanelId>>(new Set());
  private readonly blockedState = signal(false);

  readonly supported = this.bridge.supported;
  readonly detached = this.detachedState.asReadonly();
  readonly blocked = this.blockedState.asReadonly();

  constructor() {
    if (this.supported) {
      this.bridge.hold(pageLockName(this.pageId));
      this.channel = this.bridge.openChannel(this.pageId);
      this.channel.listen((data) => this.receive(data));
    }
    inject(DestroyRef).onDestroy(() => {
      this.channel?.close();
      this.opening.forEach((timer) => clearTimeout(timer));
      this.pendingReturns.forEach((timer) => clearTimeout(timer));
      this.releaseWatchers.forEach((cancel) => cancel());
    });
  }

  isDetached(panel: PanelId): boolean {
    return this.detachedState().has(panel);
  }

  open(panel: PanelId): void {
    const definition = panelById(panel);
    if (
      !this.supported ||
      definition === undefined ||
      this.isDetached(panel) ||
      this.opening.has(panel)
    ) {
      return;
    }
    const { slug, width, height } = definition;
    this.blockedState.set(false);
    this.window.open(
      `/janela/${slug}?pagina=${this.pageId}`,
      '_blank',
      `popup,noopener,width=${width},height=${height}`,
    );
    const timer = setTimeout(() => {
      this.opening.delete(panel);
      this.blockedState.set(true);
    }, PANEL_OPEN_TIMEOUT_MS);
    this.opening.set(panel, timer);
  }

  private receive(data: unknown): void {
    const message = parsePanelWindowMessage(data);
    if (message !== null) {
      this.markDetached(message.panel);
    }
  }

  /** Também atende à janela que recarregou mais devagar que o prazo de retorno. */
  private markDetached(panel: PanelId): void {
    clearTimeout(this.opening.get(panel));
    this.opening.delete(panel);
    clearTimeout(this.pendingReturns.get(panel));
    this.pendingReturns.delete(panel);
    this.blockedState.set(false);
    this.detachedState.update((detached) => new Set(detached).add(panel));

    if (!this.releaseWatchers.has(panel)) {
      const cancel = this.bridge.whenReleased(panelLockName(this.pageId, panel), () => {
        this.releaseWatchers.delete(panel);
        this.scheduleReturn(panel);
      });
      this.releaseWatchers.set(panel, cancel);
    }
  }

  private scheduleReturn(panel: PanelId): void {
    const timer = setTimeout(() => {
      this.pendingReturns.delete(panel);
      this.detachedState.update((detached) => {
        const remaining = new Set(detached);
        remaining.delete(panel);
        return remaining;
      });
    }, PANEL_RETURN_DELAY_MS);
    this.pendingReturns.set(panel, timer);
  }
}
