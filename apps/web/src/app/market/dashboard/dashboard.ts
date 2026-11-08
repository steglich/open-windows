import { Component, computed, effect, inject, signal, untracked } from '@angular/core';

import { MarketStore } from '../../market-data/market-store';
import { ThemeToggle } from '../../theme/theme-toggle';
import { AccountPanel } from '../account-panel/account-panel';
import { ConnectionStatusPanel } from '../connection-status-panel/connection-status-panel';
import { OrderBookPanel } from '../order-book-panel/order-book-panel';
import { HOMEBROKER_NAME, PANELS, type PanelId } from '../panel-windows/panel-catalog';
import { PanelWindows } from '../panel-windows/panel-windows';
import { PortfolioPanel } from '../portfolio-panel/portfolio-panel';
import { PriceChartPanel } from '../price-chart-panel/price-chart-panel';
import { QuotesPanel } from '../quotes-panel/quotes-panel';

interface Section {
  readonly id: string;
  readonly label: string;
  readonly icon: string;
  readonly panels: readonly PanelId[];
}

const SECTIONS: readonly Section[] = [
  { id: 'visao-geral', label: 'Visão geral', icon: 'M12 3a9 9 0 1 0 9 9h-9V3Z M15 3.5A9 9 0 0 1 20.5 9H15V3.5Z', panels: ['account', 'chart'] },
  { id: 'cotacoes', label: 'Cotações', icon: 'M4 6h16M4 12h16M4 18h16', panels: ['quotes'] },
  { id: 'book', label: 'Book de ofertas', icon: 'M4 17l5-5 4 4 7-8M4 21h16', panels: ['book'] },
  { id: 'carteira', label: 'Carteira', icon: 'M3 7h18v13H3V7Zm0 0 3-4h12l3 4M16 13.5h2', panels: ['portfolio'] },
];

/** Página principal, com todos os painéis que não estiverem em janela própria. */
@Component({
  imports: [
    AccountPanel,
    ConnectionStatusPanel,
    OrderBookPanel,
    PortfolioPanel,
    PriceChartPanel,
    QuotesPanel,
    ThemeToggle,
  ],
  selector: 'app-dashboard',
  templateUrl: './dashboard.html',
})
export class Dashboard {
  private readonly store = inject(MarketStore);
  protected readonly windows = inject(PanelWindows);

  protected readonly title = signal(HOMEBROKER_NAME);
  protected readonly activeSection = signal<string>(SECTIONS[0].id);
  protected readonly sections = computed(() =>
    SECTIONS.filter(({ panels }) => panels.some((panel) => !this.windows.isDetached(panel))),
  );
  protected readonly overviewHasBothPanels = computed(
    () => !this.windows.isDetached('account') && !this.windows.isDetached('chart'),
  );
  protected readonly allDetached = computed(
    () => this.windows.detached().size === PANELS.length,
  );

  constructor() {
    effect(() => {
      const feeds = PANELS.filter(({ id }) => !this.windows.isDetached(id)).flatMap(
        ({ feeds }) => feeds,
      );
      // Sem `untracked`, o efeito também dependeria dos signals lidos dentro do store.
      untracked(() => this.store.setFeeds(feeds));
    });
  }
}
