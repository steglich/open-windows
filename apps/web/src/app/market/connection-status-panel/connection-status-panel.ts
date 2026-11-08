import { Component, computed, inject } from '@angular/core';

import type { ConnectionStatus } from '../../market-data/market-socket';
import { MarketStore } from '../../market-data/market-store';

const STATUS_DISPLAY: Record<ConnectionStatus, { label: string; tone: string; dot: string }> = {
  connecting: { label: 'Conectando…', tone: 'text-ink-muted', dot: 'bg-ink-muted' },
  connected: { label: 'Conectado', tone: 'text-gain', dot: 'bg-gain' },
  reconnecting: { label: 'Reconectando…', tone: 'text-warning', dot: 'bg-warning' },
  closed: { label: 'Desconectado', tone: 'text-loss', dot: 'bg-loss' },
  unavailable: { label: 'Indisponível neste navegador', tone: 'text-loss', dot: 'bg-loss' },
};

@Component({
  selector: 'app-connection-status-panel',
  templateUrl: './connection-status-panel.html',
})
export class ConnectionStatusPanel {
  protected readonly store = inject(MarketStore);
  protected readonly display = computed(() => STATUS_DISPLAY[this.store.status()]);
}
