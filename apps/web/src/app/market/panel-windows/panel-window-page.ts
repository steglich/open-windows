import { Component, DOCUMENT, inject } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { ActivatedRoute } from '@angular/router';

import { MarketStore } from '../../market-data/market-store';
import { AccountPanel } from '../account-panel/account-panel';
import { ConnectionStatusPanel } from '../connection-status-panel/connection-status-panel';
import { OrderBookPanel } from '../order-book-panel/order-book-panel';
import { PortfolioPanel } from '../portfolio-panel/portfolio-panel';
import { PriceChartPanel } from '../price-chart-panel/price-chart-panel';
import { QuotesPanel } from '../quotes-panel/quotes-panel';
import { HOMEBROKER_NAME, panelBySlug, type PanelDefinition } from './panel-catalog';
import { PANEL_WINDOW_BRIDGE, pageLockName, panelLockName } from './panel-window-bridge';
import { IN_PANEL_WINDOW } from './panel-window-button';

/** Conteúdo da janela de um painel. A rota só chega aqui com um painel existente. */
@Component({
  selector: 'app-panel-window-page',
  imports: [
    AccountPanel,
    ConnectionStatusPanel,
    OrderBookPanel,
    PortfolioPanel,
    PriceChartPanel,
    QuotesPanel,
  ],
  providers: [{ provide: IN_PANEL_WINDOW, useValue: true }],
  templateUrl: './panel-window-page.html',
})
export class PanelWindowPage {
  protected readonly panel: PanelDefinition;

  constructor() {
    const route = inject(ActivatedRoute);
    this.panel = panelBySlug(route.snapshot.paramMap.get('painel') as string) as PanelDefinition;

    inject(Title).setTitle(`${this.panel.title} · ${HOMEBROKER_NAME}`);
    inject(MarketStore).setFeeds(this.panel.feeds);

    const pageId = route.snapshot.queryParamMap.get('pagina');
    const bridge = inject(PANEL_WINDOW_BRIDGE);
    if (pageId === null || !bridge.supported) {
      return;
    }

    const view = inject(DOCUMENT).defaultView as Window;
    const channel = bridge.openChannel(pageId);
    const panel = this.panel.id;
    // O `ready` só sai com a trava obtida, para a página sempre encontrá-la ocupada.
    bridge.hold(panelLockName(pageId, panel), () =>
      channel.post({ type: 'panel-window-ready', panel }),
    );
    bridge.whenReleased(pageLockName(pageId), () => view.close());
  }
}
