import type { Candle } from '../../market-data/market-protocol';
import type { ChartSeries } from '../shared/apex-chart/apex-chart';

// O pregão simulado segue o horário de Brasília, seja qual for o fuso do navegador.
const TIME_ZONE = 'America/Sao_Paulo';
const DAY = new Intl.DateTimeFormat('pt-BR', {
  timeZone: TIME_ZONE,
  day: '2-digit',
  month: '2-digit',
});
const TIME = new Intl.DateTimeFormat('pt-BR', {
  timeZone: TIME_ZONE,
  hour: '2-digit',
  minute: '2-digit',
});

/** Rótulo único do candle, com o dia e o horário, por exemplo `05/01 10:00`. */
export function candleLabel(time: number): string {
  return `${DAY.format(time)} ${TIME.format(time)}`;
}

/** Só o horário do rótulo, que é o que cabe no eixo. */
export function axisTimeLabel(label: string): string {
  return label.slice(-5);
}

/** Pontos por categoria, para o eixo não abrir um vazio entre um pregão e outro. */
export function toCandlestickSeries(candles: readonly Candle[]): ChartSeries {
  return [
    {
      name: 'Preço',
      data: candles.map(({ time, open, high, low, close }) => ({
        x: candleLabel(time),
        y: [open, high, low, close],
      })),
    },
  ];
}
