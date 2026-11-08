const PRICE = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

/** O ApexCharts formata fora do Angular, por isso os pipes de moeda não servem aqui. */
export function formatPrice(value: number): string {
  return PRICE.format(value).replace(/ /g, ' ');
}
