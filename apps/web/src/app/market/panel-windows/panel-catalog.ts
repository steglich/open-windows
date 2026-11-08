import type { MarketFeed } from '../../market-data/market-store';

export const HOMEBROKER_NAME = 'Open Windows Homebroker';

export type PanelId = 'status' | 'account' | 'chart' | 'quotes' | 'book' | 'portfolio';

export interface PanelDefinition {
  readonly id: PanelId;
  /** Trecho da rota `janela/:painel`. */
  readonly slug: string;
  readonly title: string;
  readonly width: number;
  readonly height: number;
  /** Dados lidos pelo painel. Precisa acompanhar o que o componente usa do `MarketStore`. */
  readonly feeds: readonly MarketFeed[];
}

/** Única fonte dos painéis que podem ser abertos em janela. */
export const PANELS: readonly PanelDefinition[] = [
  { id: 'status', slug: 'status', title: 'Status da conexão', width: 480, height: 200, feeds: [] },
  { id: 'account', slug: 'saldo', title: 'Saldo', width: 720, height: 560, feeds: ['account'] },
  { id: 'chart', slug: 'grafico', title: 'Gráfico de preço', width: 960, height: 560, feeds: ['selectedQuote', 'candles'] },
  { id: 'quotes', slug: 'cotacoes', title: 'Cotações', width: 1200, height: 680, feeds: ['quotes'] },
  { id: 'book', slug: 'book', title: 'Book de ofertas', width: 900, height: 640, feeds: ['book'] },
  { id: 'portfolio', slug: 'carteira', title: 'Carteira', width: 1200, height: 720, feeds: ['positions'] },
];

export function panelById(id: string): PanelDefinition | undefined {
  return PANELS.find((panel) => panel.id === id);
}

export function panelBySlug(slug: string): PanelDefinition | undefined {
  return PANELS.find((panel) => panel.slug === slug);
}
