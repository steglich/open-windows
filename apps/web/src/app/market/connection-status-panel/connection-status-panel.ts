import { Component, computed, inject } from '@angular/core';

import type { ConnectionStatus } from '../../market-data/market-socket';
import { MarketStore } from '../../market-data/market-store';
import { FeedPanel } from '../shared/feed-panel/feed-panel';

const STATUS_DISPLAY: Record<ConnectionStatus, { label: string; tone: string }> = {
  connecting: { label: 'Conectando…', tone: 'text-slate-600' },
  connected: { label: 'Conectado', tone: 'text-emerald-700' },
  reconnecting: { label: 'Reconectando…', tone: 'text-amber-700' },
  closed: { label: 'Desconectado', tone: 'text-red-700' },
};

@Component({
  selector: 'app-connection-status-panel',
  imports: [FeedPanel],
  templateUrl: './connection-status-panel.html',
})
export class ConnectionStatusPanel {
  protected readonly store = inject(MarketStore);
  protected readonly display = computed(() => STATUS_DISPLAY[this.store.status()]);
}
