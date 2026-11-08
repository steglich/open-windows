import { Component, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';

import { AccountPanel } from './market/account-panel/account-panel';
import { ConnectionStatusPanel } from './market/connection-status-panel/connection-status-panel';
import { OrderBookPanel } from './market/order-book-panel/order-book-panel';
import { PortfolioPanel } from './market/portfolio-panel/portfolio-panel';
import { PriceChartPanel } from './market/price-chart-panel/price-chart-panel';
import { QuotesPanel } from './market/quotes-panel/quotes-panel';
import { ThemeToggle } from './theme/theme-toggle';

const SECTIONS = [
  { id: 'visao-geral', label: 'Visão geral', icon: 'M12 3a9 9 0 1 0 9 9h-9V3Z M15 3.5A9 9 0 0 1 20.5 9H15V3.5Z' },
  { id: 'cotacoes', label: 'Cotações', icon: 'M4 6h16M4 12h16M4 18h16' },
  { id: 'book', label: 'Book de ofertas', icon: 'M4 17l5-5 4 4 7-8M4 21h16' },
  { id: 'carteira', label: 'Carteira', icon: 'M3 7h18v13H3V7Zm0 0 3-4h12l3 4M16 13.5h2' },
] as const;

@Component({
  imports: [
    AccountPanel,
    ConnectionStatusPanel,
    OrderBookPanel,
    PortfolioPanel,
    PriceChartPanel,
    QuotesPanel,
    RouterOutlet,
    ThemeToggle,
  ],
  selector: 'app-root',
  styleUrl: './app.css',
  templateUrl: './app.html',
})
export class App {
  protected readonly title = signal('Open Windows Homebroker');
  protected readonly sections = SECTIONS;
  protected readonly activeSection = signal<string>(SECTIONS[0].id);
}
