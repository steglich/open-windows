import { Component, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';

import { ConnectionStatusPanel } from './market/connection-status-panel/connection-status-panel';
import { OrderBookPanel } from './market/order-book-panel/order-book-panel';
import { PortfolioPanel } from './market/portfolio-panel/portfolio-panel';
import { QuotesPanel } from './market/quotes-panel/quotes-panel';

@Component({
  imports: [ConnectionStatusPanel, OrderBookPanel, PortfolioPanel, QuotesPanel, RouterOutlet],
  selector: 'app-root',
  styleUrl: './app.css',
  templateUrl: './app.html',
})
export class App {
  protected readonly title = signal('Open Windows Homebroker');
}
