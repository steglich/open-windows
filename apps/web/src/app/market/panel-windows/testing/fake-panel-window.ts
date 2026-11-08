import type { Provider } from '@angular/core';

import type { PanelId } from '../panel-catalog';
import {
  PANEL_WINDOW_BRIDGE,
  panelLockName,
  type PanelWindowBridge,
  type PanelWindowChannel,
} from '../panel-window-bridge';
import type { PanelWindowMessage } from '../panel-window-messages';

export const FAKE_PAGE_ID = 'pagina-1';

/** Web Locks e `BroadcastChannel` em memória, já que o jsdom não os oferece. */
export class FakePanelWindowBridge implements PanelWindowBridge {
  supported = true;
  readonly posted: PanelWindowMessage[] = [];
  readonly held: string[] = [];
  channelsOpened: string[] = [];
  private handler: ((data: unknown) => void) | undefined;
  private readonly watchers = new Map<string, () => void>();

  createId(): string {
    return FAKE_PAGE_ID;
  }

  openChannel(pageId: string): PanelWindowChannel {
    this.channelsOpened.push(pageId);
    return {
      post: (message) => this.posted.push(message),
      listen: (handler) => (this.handler = handler),
      close: () => (this.handler = undefined),
    };
  }

  hold(lock: string, onHeld?: () => void): void {
    this.held.push(lock);
    onHeld?.();
  }

  whenReleased(lock: string, onReleased: () => void): () => void {
    this.watchers.set(lock, onReleased);
    return () => this.watchers.delete(lock);
  }

  isWatching(lock: string): boolean {
    return this.watchers.has(lock);
  }

  /** Simula o `ready` que a janela do painel envia pelo canal. */
  deliver(data: unknown): void {
    this.handler?.(data);
  }

  ready(panel: PanelId): void {
    this.deliver({ type: 'panel-window-ready', panel });
  }

  /** Simula o navegador liberando uma trava porque o documento acabou. */
  release(lock: string): void {
    const watcher = this.watchers.get(lock);
    this.watchers.delete(lock);
    watcher?.();
  }

  releasePanel(panel: PanelId): void {
    this.release(panelLockName(FAKE_PAGE_ID, panel));
  }
}

export const FAKE_PANEL_WINDOW_PROVIDERS: Provider[] = [
  { provide: PANEL_WINDOW_BRIDGE, useClass: FakePanelWindowBridge },
];
