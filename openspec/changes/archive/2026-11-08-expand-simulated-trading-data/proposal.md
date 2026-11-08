# Proposal

## Why

O simulador publica só 6 ativos, 5 níveis de book e uma carteira fixa de 3 posições. Isso não basta para exercitar uma tela de homebroker: não há histórico para gráficos, ordens nem saldo. Esta change gera um conjunto volumoso de dados de negociação, consistente entre as seções e reproduzível por seed.

## What Changes

- **BREAKING** Troca os tickers fictícios por 500 tickers reais da B3, com preços inventados.
- **BREAKING** Cotações passam a ser publicadas em lote: a mensagem `quote` por ativo dá lugar a `quotes`, com um frame por ciclo e por cliente. O frontend passa a consumir esse formato.
- Cotações ganham `financialVolume` e `updatedAt`, e `volume` passa a representar as ações negociadas no pregão.
- Book sobe para 50 níveis por lado e ganha `spread`, calculado a partir dos melhores preços.
- Histórico de candles de 1 minuto por requisição WebSocket: cinco pregões completos mais o pregão corrente, coerentes com as cotações.
- Histórico de 10.000 ordens por requisição paginada, cobrindo todos os status, inclusive execução parcial.
- Novo canal `account` com saldo disponível, saldo bloqueado e patrimônio total.
- Carteira sobe para 300 posições, derivadas das execuções do histórico de ordens, com P&L total em R$ e em %.
- Seed fixa pela variável `SEED`, que reproduz dados e timestamps.
- Requisição e resposta no mesmo WebSocket, correlacionadas por `requestId`, sem servidor HTTP.

Fora do escopo, por decisão do usuário: envio de ordens. O histórico de ordens e a conta são gerados na partida e não mudam por ação do cliente.

## Capabilities

### New Capabilities

- `simulation-generation`: volume padrão dos dados gerados, seed fixa e reprodutibilidade.
- `price-history`: consulta de candles e sua coerência com as cotações.
- `order-history`: consulta paginada de ordens, status e coerência de quantidades, preços e datas.
- `account-balance`: canal de saldo em conta e sua coerência com ordens abertas e carteira.

### Modified Capabilities

- `market-data-socket`: novo canal `account`, mensagens de requisição com `requestId` e estado inicial de cotações em lote.
- `quote-feed`: catálogo de tickers reais, publicação em lote e novos campos.
- `order-book-feed`: profundidade de 50 níveis e campo `spread`.
- `position-feed`: 300 posições derivadas das execuções, `blockedQuantity` e P&L total em %.
- `market-data-client`: aplicação do lote `quotes` no estado do frontend.

## Impact

- `apps/server/src/protocol.ts`, `gateway.ts`, `main.ts` e `market/`, com novo gerador, catálogo de tickers e PRNG com seed. Os testes do servidor mudam junto.
- `apps/web/src/app/market-data/`: `market-protocol.ts`, `market-socket.ts` e `market-store.ts` passam a tratar `quotes`. Os painéis não mudam.
- `turbo.json` precisa repassar `SEED` no `dev`.
- Memória do servidor sobe para dezenas de MB por causa dos candles, e a partida gera os dados antes de aceitar conexões.
- Sem dependências novas.
