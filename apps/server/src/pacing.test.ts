import { describe, expect, it } from 'vitest';

import { ChannelPacer, MAX_CATCH_UP_MS } from './pacing.js';

const SLICE_MS = 10;

function setup(rate: number, symbols: readonly string[] = ['PETR4']) {
  let now = 1_000;
  const pacer = new ChannelPacer(rate, () => now);
  pacer.setSymbols(symbols);
  return {
    pacer,
    advance(ms: number) {
      now += ms;
    },
    /** Avança em fatias e devolve tudo o que foi enviado. */
    run(ms: number, blocked = false): string[] {
      const sent: string[] = [];
      for (let elapsed = 0; elapsed < ms; elapsed += SLICE_MS) {
        now += SLICE_MS;
        sent.push(...pacer.take(blocked));
      }
      return sent;
    },
  };
}

describe('ChannelPacer', () => {
  describe('taxa', () => {
    it.each([1000, 500, 350])('envia exatamente %i mensagens em um segundo', (rate) => {
      expect(setup(rate).run(1_000)).toHaveLength(rate);
    });

    it('não perde a parte fracionária da taxa entre as fatias', () => {
      const { pacer, advance } = setup(350);
      const perSlice: number[] = [];

      for (let slice = 0; slice < 4; slice++) {
        advance(SLICE_MS);
        perSlice.push(pacer.take().length);
      }

      expect(perSlice).toEqual([3, 4, 3, 4]);
    });

    it('espaça as mensagens ao longo do segundo', () => {
      const { pacer, advance } = setup(1000);

      for (let slice = 0; slice < 100; slice++) {
        advance(SLICE_MS);
        expect(pacer.take()).toHaveLength(10);
      }
    });

    it('não envia nada com taxa zero', () => {
      expect(setup(0).run(1_000)).toEqual([]);
    });

    it('não envia nada sem ativos assinados', () => {
      expect(setup(1000, []).run(1_000)).toEqual([]);
    });

    it('não conta o tempo em que não havia ativos assinados', () => {
      const { pacer, advance } = setup(1000, []);
      advance(5_000);

      pacer.setSymbols(['PETR4']);

      expect(pacer.take()).toEqual([]);
    });
  });

  describe('atraso do timer', () => {
    it('compensa um atraso curto', () => {
      const { pacer, advance } = setup(1000);

      advance(50);

      expect(pacer.take()).toHaveLength(50);
    });

    it('descarta o atraso além do limite', () => {
      const { pacer, advance } = setup(1000);

      advance(5_000);

      expect(pacer.take()).toHaveLength(MAX_CATCH_UP_MS);
      advance(SLICE_MS);
      expect(pacer.take()).toHaveLength(10);
    });
  });

  describe('rodízio', () => {
    it('alterna entre os ativos assinados', () => {
      expect(setup(1000, ['A', 'B', 'C']).run(10).slice(0, 7)).toEqual([
        'A',
        'B',
        'C',
        'A',
        'B',
        'C',
        'A',
      ]);
    });

    it('com um único ativo, todas as mensagens são dele', () => {
      expect(new Set(setup(1000).run(100))).toEqual(new Set(['PETR4']));
    });

    it('mantém o próximo ativo quando a lista muda', () => {
      const { pacer, advance } = setup(100, ['A', 'B', 'C']);
      advance(10);
      expect(pacer.take()).toEqual(['A']);

      pacer.setSymbols(['B', 'C', 'D']);
      advance(30);

      expect(pacer.take()).toEqual(['B', 'C', 'D']);
    });

    it('continua o rodízio quando o próximo ativo é removido', () => {
      const { pacer, advance } = setup(100, ['A', 'B', 'C']);
      advance(10);
      expect(pacer.take()).toEqual(['A']);

      pacer.setSymbols(['A', 'C']);
      advance(20);

      expect(pacer.take()).toEqual(['C', 'A']);
    });

    it('para de enviar quando todos os ativos são removidos', () => {
      const { pacer, advance } = setup(1000, ['A']);

      pacer.setSymbols([]);
      advance(SLICE_MS);

      expect(pacer.take()).toEqual([]);
    });
  });

  describe('conexão atrasada', () => {
    it('não envia nada enquanto estiver acima do limite', () => {
      expect(setup(1000).run(500, true)).toEqual([]);
    });

    it('volta sem rajada depois de abaixo do limite', () => {
      const { pacer, advance, run } = setup(1000);
      run(500, true);

      advance(SLICE_MS);

      expect(pacer.take()).toHaveLength(10);
    });
  });
});
