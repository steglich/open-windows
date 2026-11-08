/** Atraso máximo do timer que ainda é compensado com mensagens extras. */
export const MAX_CATCH_UP_MS = 100;

export type Clock = () => number;

/** Decide quais ativos enviar em um canal de uma conexão, na taxa definida e em rodízio. */
export class ChannelPacer {
  private symbols: readonly string[] = [];
  private cursor = 0;
  private startedAt = 0;
  private sent = 0;

  constructor(
    private readonly messagesPerSecond: number,
    private readonly clock: Clock,
  ) {}

  /** Troca a lista do rodízio mantendo o próximo ativo, se ele continuar assinado. */
  setSymbols(symbols: readonly string[]): void {
    if (this.symbols.length === 0) {
      this.startedAt = this.clock();
      this.sent = 0;
    }

    const next = this.symbols[this.cursor];
    const kept = next === undefined ? -1 : symbols.indexOf(next);
    if (kept >= 0) {
      this.cursor = kept;
    } else {
      this.cursor = symbols.length === 0 ? 0 : this.cursor % symbols.length;
    }
    this.symbols = symbols;
  }

  /**
   * Devolve os ativos das mensagens devidas agora. Com `blocked`, a conexão está atrasada:
   * as mensagens devidas são descartadas, para não virarem uma rajada quando ela se recuperar.
   */
  take(blocked = false): string[] {
    if (this.symbols.length === 0 || this.messagesPerSecond <= 0) {
      return [];
    }

    const due = this.collectDue();
    if (blocked) {
      return [];
    }

    const symbols: string[] = [];
    for (let index = 0; index < due; index++) {
      symbols.push(this.symbols[this.cursor]!);
      this.cursor = (this.cursor + 1) % this.symbols.length;
    }
    return symbols;
  }

  /** Conta pelo tempo total, e não por fatia, para não perder a parte fracionária da taxa. */
  private collectDue(): number {
    const elapsedMs = this.clock() - this.startedAt;
    const owed = Math.floor((this.messagesPerSecond * elapsedMs) / 1000) - this.sent;
    const limit = Math.ceil((this.messagesPerSecond * MAX_CATCH_UP_MS) / 1000);
    const due = Math.min(owed, limit);
    this.sent += owed;
    return due;
  }
}
