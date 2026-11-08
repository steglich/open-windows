# Protocolo do simulador

Toda a comunicação usa um único WebSocket, por padrão em `ws://127.0.0.1:8090`. Cada mensagem é um objeto JSON em um frame de texto, com um campo `type`.

Os tickers são reais da B3, mas **todos os preços, volumes, ordens e saldos são fictícios** e não correspondem ao mercado.

Valores monetários estão em reais, com até duas casas decimais. Datas e `timestamp` estão em milissegundos desde a época Unix. Os tipos TypeScript ficam em [`src/protocol.ts`](src/protocol.ts).

## Volume e seed

| Dado | Volume padrão |
| --- | --- |
| Ativos | 500 |
| Níveis de book por lado | 50 |
| Ordens | 10.000 |
| Posições | 300 |
| Histórico | 5 pregões completos de 390 candles de 1 minuto, mais o pregão corrente |

| Variável | Padrão | Descrição |
| --- | --- | --- |
| `PORT` | `8090` | Porta do WebSocket |
| `HOST` | `127.0.0.1` | Interface de rede |
| `SEED` | sorteada | Inteiro de `0` a `4294967295`. Um valor inválido encerra a partida com erro |

Com `SEED`, dados e timestamps se repetem a cada execução, pois o relógio simulado parte de `2026-01-05T16:00:00-03:00` e avança um intervalo de ciclo por ciclo. Sem `SEED`, uma seed é sorteada e registrada no log, e o relógio é o real.

## Conexão

Ao conectar, o servidor envia:

```json
{ "type": "welcome", "channels": ["quote", "book", "positions", "account"], "symbols": ["PETR4", "VALE3"] }
```

A cada 500 ms, o servidor avança o mercado e publica, nesta ordem, `quotes`, `book` e, a cada dois ciclos, `positions` e `account`.

## Canais

### Assinatura

```json
{ "type": "subscribe", "channel": "quote", "symbols": ["PETR4"] }
{ "type": "unsubscribe", "channel": "quote", "symbols": ["PETR4"] }
```

Nos canais `quote` e `book`, a ausência de `symbols` significa todos os ativos. Nos canais `positions` e `account`, `symbols` é ignorado. O servidor confirma com `subscribed` ou `unsubscribed` (`channel`, `symbols`) e, na assinatura, envia o estado atual em seguida. As assinaturas valem por conexão.

### `quote`: mensagem `quotes`

Um frame por ciclo e por cliente, com todos os ativos assinados: `{ "type": "quotes", "timestamp": n, "data": [Quote] }`.

| Campo de `Quote` | Tipo | Descrição |
| --- | --- | --- |
| `symbol` | string | Ticker |
| `last` | number | Último preço negociado |
| `bid`, `ask` | number | Melhores preços de compra e venda, iguais aos do book |
| `open`, `high`, `low` | number | Abertura, máxima e mínima do pregão |
| `previousClose` | number | Fechamento do pregão anterior |
| `change` | number | `last - previousClose` |
| `changePercent` | number | `change` em percentual de `previousClose` |
| `volume` | number | Ações negociadas no pregão |
| `financialVolume` | number | Valor negociado no pregão |
| `updatedAt` | number | Instante da última atualização |

### `book`: mensagem `book`

Uma por ativo assinado e por ciclo: `{ "type": "book", "timestamp": n, "data": OrderBook }`.

| Campo de `OrderBook` | Tipo | Descrição |
| --- | --- | --- |
| `symbol` | string | Ticker |
| `spread` | number | Melhor venda menos melhor compra |
| `bids` | `BookLevel[]` | Compras, do maior para o menor preço |
| `asks` | `BookLevel[]` | Vendas, do menor para o maior preço |

Cada `BookLevel` tem `price`, `quantity` (total agregado no preço) e `orders`.

### `positions`: mensagem `positions`

`{ "type": "positions", "timestamp": n, "data": Portfolio }`.

| Campo de `Portfolio` | Tipo | Descrição |
| --- | --- | --- |
| `accountId` | string | Conta simulada |
| `totalMarketValue` | number | Soma de `marketValue` |
| `totalUnrealizedPnl` | number | Soma de `unrealizedPnl` |
| `totalUnrealizedPnlPercent` | number | P&L total em percentual do custo da carteira |
| `positions` | `Position[]` | Posições em custódia |

| Campo de `Position` | Tipo | Descrição |
| --- | --- | --- |
| `symbol` | string | Ticker |
| `quantity` | number | Compras menos vendas executadas no histórico de ordens |
| `blockedQuantity` | number | Restante das vendas abertas e parcialmente executadas |
| `averagePrice` | number | Preço médio das compras |
| `lastPrice` | number | Igual ao `last` da cotação |
| `marketValue` | number | `quantity * lastPrice` |
| `unrealizedPnl` | number | `(lastPrice - averagePrice) * quantity` |
| `unrealizedPnlPercent` | number | P&L em percentual de `averagePrice` |

### `account`: mensagem `account`

Publicada depois de `positions`, no mesmo ciclo: `{ "type": "account", "timestamp": n, "data": AccountBalance }`.

| Campo de `AccountBalance` | Tipo | Descrição |
| --- | --- | --- |
| `accountId` | string | Mesma conta de `positions` |
| `availableBalance` | number | Disponível para operar, constante |
| `blockedBalance` | number | Soma de `price * (requestedQuantity - filledQuantity)` das compras abertas e parcialmente executadas |
| `totalEquity` | number | `availableBalance + blockedBalance + totalMarketValue` |

## Consultas

Toda consulta tem um `requestId`, string não vazia, devolvido na resposta e nos erros.

### `getCandles`

```json
{ "type": "getCandles", "requestId": "1", "symbol": "PETR4", "limit": 390, "before": 1767639600000 }
```

`limit` vai de 1 a 3000, com padrão 390. `before` é opcional. A resposta traz os `limit` candles mais recentes anteriores a `before`, em ordem crescente de `time`, incluindo o candle em andamento:

```json
{ "type": "candles", "requestId": "1", "timestamp": 0, "data": { "symbol": "PETR4", "interval": "1m", "candles": [] } }
```

Cada `Candle` tem `time`, `open`, `high`, `low`, `close`, `volume` e `financialVolume`. No pregão corrente, os candles somam o `volume` e o `financialVolume` da cotação. Para paginar, use `before` igual ao `time` do candle mais antigo recebido.

### `getOrders`

```json
{ "type": "getOrders", "requestId": "2", "status": "OPEN", "symbol": "PETR4", "offset": 0, "limit": 100 }
```

`status` e `symbol` são filtros opcionais. `offset` tem padrão 0, e `limit` vai de 1 a 500, com padrão 100. A resposta vem da ordem mais recente para a mais antiga:

```json
{ "type": "orders", "requestId": "2", "timestamp": 0, "data": { "items": [], "total": 0, "offset": 0, "limit": 100 } }
```

| Campo de `Order` | Tipo | Descrição |
| --- | --- | --- |
| `id` | string | Identificador único |
| `symbol` | string | Ticker |
| `side` | `BUY` \| `SELL` | Compra ou venda |
| `type` | `LIMIT` \| `MARKET` | Limitada ou a mercado |
| `validity` | `DAY` \| `GTC` | Válida no dia ou até cancelar |
| `price` | number \| null | Limite, `null` em ordens a mercado |
| `requestedQuantity` | number | Quantidade solicitada, em lotes de 100 |
| `filledQuantity` | number | Quantidade executada, em lotes de 100 |
| `averageFillPrice` | number \| null | Preço médio de execução, `null` sem execução |
| `status` | ver abaixo | Situação da ordem |
| `createdAt` | number | Envio |
| `updatedAt` | number | Última atualização |

| `status` | Significado | `filledQuantity` |
| --- | --- | --- |
| `OPEN` | Aberta | `0` |
| `PARTIALLY_FILLED` | Parcialmente executada | Maior que `0` e menor que a solicitada |
| `FILLED` | Executada | Igual à solicitada |
| `CANCELLED` | Cancelada | Menor que a solicitada |

As ordens são geradas na partida e não mudam. A simulação não aceita envio de ordens.

## Erros

```json
{ "type": "error", "code": "UNKNOWN_SYMBOL", "message": "Ativo desconhecido: XXXX9.", "requestId": "1" }
```

| `code` | Quando |
| --- | --- |
| `INVALID_MESSAGE` | JSON inválido, `type` desconhecido (inclusive envio de ordem) ou campo inválido |
| `UNKNOWN_CHANNEL` | Canal inexistente |
| `UNKNOWN_SYMBOL` | Ativo fora do catálogo |

`requestId` só aparece em erros de consultas. A conexão continua aberta depois de um erro, exceto se o frame exceder 16 KiB.
