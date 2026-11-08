import { CurrencyPipe } from '@angular/common';
import { Component, computed, inject } from '@angular/core';

import { MarketStore } from '../../market-data/market-store';
import { FeedPanel } from '../shared/feed-panel/feed-panel';

@Component({
  selector: 'app-account-panel',
  imports: [CurrencyPipe, FeedPanel],
  templateUrl: './account-panel.html',
})
export class AccountPanel {
  protected readonly store = inject(MarketStore);

  protected readonly cards = computed(() => {
    const account = this.store.account();
    if (account === null) {
      return [];
    }
    const { totalEquity, availableBalance, blockedBalance } = account;
    return [
      { label: 'Patrimônio total', value: totalEquity, hint: 'Saldos e ativos' },
      { label: 'Saldo disponível', value: availableBalance, hint: 'Livre para novas ordens' },
      { label: 'Saldo bloqueado', value: blockedBalance, hint: 'Reservado em ordens abertas' },
      {
        label: 'Valor em ativos',
        value: totalEquity - availableBalance - blockedBalance,
        hint: 'Posições a preço de mercado',
      },
    ];
  });
}
