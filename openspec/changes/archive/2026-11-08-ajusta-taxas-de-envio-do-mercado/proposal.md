# Proposal

## Why

Hoje o servidor publica cotações e books em rajadas, a cada 500 ms, e os candles só chegam sob demanda. O simulador precisa enviar um fluxo contínuo e previsível, com taxa própria por tipo de dado: 1000 mensagens por segundo de book, 500 de quote e 350 de candle.

## What Changes

- O servidor passa a enviar, por conexão e por canal, 1000 mensagens `book`, 500 mensagens `quotes` e 350 mensagens `candle` por segundo, espaçadas ao longo do segundo em vez de em rajadas.
- **BREAKING** Cada mensagem de `quote`, `book` e `candle` passa a carregar um único ativo, em rodízio entre os ativos assinados pela conexão. A mensagem `quotes` mantém o formato, mas deixa de trazer todos os ativos em um frame por ciclo.
- A taxa vale por conexão e por canal, seja qual for a quantidade de ativos assinados. Com um único ativo assinado, todas as mensagens do canal são desse ativo.
- Novo canal `candle`, com a mensagem `candle` contendo o candle de 1 minuto em andamento do ativo. `getCandles` continua existindo para o histórico.
- O mercado continua avançando a cada 500 ms, e `positions` e `account` continuam sendo publicados a cada dois ciclos. As mensagens enviadas entre dois ciclos repetem o estado mais recente.
- **BREAKING** A ordem "cotações antes dos books" no mesmo ciclo deixa de existir. A coerência entre `quote` e `book` passa a valer para mensagens geradas no mesmo ciclo de mercado.
- Clientes que não conseguem acompanhar o fluxo deixam de receber mensagens de `quote`, `book` e `candle` até esvaziarem o buffer da conexão, sem afetar o servidor nem os demais clientes.
- O frontend assina o canal `candle` do ativo selecionado, atualiza o candle em andamento por ele e aplica cada mensagem ao estado assim que ela chega, sem limitador de tempo.

## Capabilities

### New Capabilities

Nenhuma. O canal `candle` fica em `price-history`, que já define os candles.

### Modified Capabilities

- `quote-feed`: a publicação passa a ter taxa fixa e uma cotação por mensagem, e a regra de variação de preços passa a ser medida entre ciclos de mercado.
- `order-book-feed`: a publicação passa a ter taxa fixa, e a coerência com a cotação deixa de depender da ordem de envio.
- `price-history`: adiciona o canal `candle` e sua taxa de publicação.
- `market-data-socket`: `welcome` e assinaturas passam a incluir `candle`, com estado inicial próprio, e surge a proteção contra clientes lentos.
- `simulation-generation`: a reprodutibilidade passa a ser definida por ativo e por ciclo de mercado.
- `market-data-client`: assina `candle` do ativo selecionado, atualiza e vira o candle por esse canal e aplica cada mensagem ao estado assim que ela chega.
- `price-chart`: o candle em andamento passa a ser atualizado pelo canal `candle`.

## Impact

- `apps/server/src/gateway.ts`: nova cadência de envio, separada do ciclo de mercado; `apps/server/src/protocol.ts` e `apps/server/src/test-utils.ts`.
- `apps/server/src/gateway.test.ts`: os testes que dependem de uma mensagem por ciclo precisam ser reescritos.
- `apps/web/src/app/market-data/`: `market-protocol.ts` e `market-store.ts`, com suas specs.
- `apps/server/PROTOCOL.md` e `CLAUDE.md` descrevem o ciclo atual e precisam acompanhar a mudança.
- Consumidores do protocolo: quem espera todos os ativos em um único `quotes` ou a ordem `quotes` antes de `book` precisa se adaptar.
- Carga: um navegador na configuração padrão passa a receber 1850 mensagens por segundo. O book do ativo selecionado sozinho soma cerca de 4,5 MB/s por conexão, contra cerca de 9 KB/s hoje.
