# price-history Specification

## Purpose

Define a consulta de candles de 1 minuto por ativo e sua coerência com as cotações, para alimentar gráficos de preço.

## Requirements

### Requirement: Consulta de candles
O servidor SHALL aceitar `{"type":"getCandles","requestId":<string>,"symbol":<ativo>,"limit":<1..3000>,"before":<ms>}`, em que `limit` (padrão 390) e `before` são opcionais, e responder com os `limit` candles mais recentes anteriores a `before`.

#### Scenario: Consulta sem filtros
- **WHEN** um cliente envia `getCandles` para `PETR4` só com `requestId` e `symbol`
- **THEN** ele recebe os 390 candles mais recentes de `PETR4`

#### Scenario: Paginação para trás
- **WHEN** um cliente envia `getCandles` com `before` igual ao `time` do candle mais antigo recebido
- **THEN** a resposta traz somente candles com `time` menor que `before`

### Requirement: Formato da resposta de candles
A resposta SHALL ter `type` igual a `candles`, o `requestId` recebido, `timestamp` e `data` com `symbol`, `interval` igual a `1m` e `candles`, em ordem crescente de `time`. Cada candle MUST ter `time`, `open`, `high`, `low`, `close`, `volume` e `financialVolume`.

#### Scenario: Campos presentes
- **WHEN** um cliente recebe uma resposta `candles`
- **THEN** todos os campos definidos estão presentes e os candles estão em ordem crescente de `time`

### Requirement: Cobertura do histórico
O histórico de cada ativo SHALL conter cinco pregões completos de 390 candles em dias úteis, seguidos do pregão corrente, cujo último candle fica em andamento e é atualizado a cada ciclo.

#### Scenario: Histórico completo
- **WHEN** um cliente pagina todos os candles de um ativo
- **THEN** ele recebe 390 candles para cada um dos cinco pregões anteriores e os candles do pregão corrente

### Requirement: Coerência interna do candle
Em cada candle, `low` MUST ser menor ou igual a `open` e `close`, `high` MUST ser maior ou igual a `open` e `close`, os preços MUST ser positivos com até duas casas decimais, e `time` MUST ser múltiplo de 60.000 ms.

#### Scenario: Valores coerentes
- **WHEN** um cliente recebe qualquer candle
- **THEN** os valores respeitam as relações definidas

### Requirement: Coerência com a cotação
No pregão corrente, `open` da cotação MUST ser o `open` do primeiro candle, `high` e `low` MUST ser o máximo e o mínimo dos candles, `last` MUST ser o `close` do último candle, e `volume` e `financialVolume` MUST ser a soma dos candles. `previousClose` MUST ser o `close` do último candle do pregão anterior.

#### Scenario: Cotação comparada ao histórico
- **WHEN** um cliente compara uma cotação ao histórico consultado no mesmo ciclo
- **THEN** os valores da cotação correspondem aos agregados dos candles

### Requirement: Erros na consulta de candles
Para ativo desconhecido, o servidor SHALL responder `error` com `code` igual a `UNKNOWN_SYMBOL` e o `requestId` recebido. Para `limit` fora do intervalo ou `before` que não seja número, MUST usar `code` igual a `INVALID_MESSAGE`.

#### Scenario: Ativo desconhecido
- **WHEN** um cliente envia `getCandles` para `XXXX9`
- **THEN** ele recebe `error` com `code` igual a `UNKNOWN_SYMBOL` e o mesmo `requestId`

#### Scenario: Limite fora do intervalo
- **WHEN** um cliente envia `getCandles` com `limit` igual a `5000`
- **THEN** ele recebe `error` com `code` igual a `INVALID_MESSAGE` e o mesmo `requestId`

### Requirement: Canal do candle em andamento
O servidor SHALL oferecer o canal `candle`, que publica o candle de 1 minuto em andamento de cada ativo assinado, na mensagem `{"type":"candle","timestamp":<ms>,"data":{"symbol":<ativo>,"interval":"1m","candle":<Candle>}}`, com os mesmos campos dos candles de `getCandles`.

#### Scenario: Mensagem recebida
- **WHEN** um cliente assinado no canal `candle` de `PETR4` recebe uma mensagem `candle`
- **THEN** `data.symbol` é `PETR4`, `data.interval` é `1m` e `data.candle` tem `time`, `open`, `high`, `low`, `close`, `volume` e `financialVolume`

#### Scenario: Coerência com o histórico
- **WHEN** um cliente compara a mensagem `candle` de um ativo com o último candle retornado por `getCandles` no mesmo ciclo de mercado
- **THEN** os dois candles são iguais

### Requirement: Publicação periódica do candle
O servidor SHALL enviar a cada conexão com ao menos um ativo assinado no canal `candle` 350 mensagens `candle` por segundo, com tolerância de 10% em uma janela de cinco segundos, espaçadas ao longo do segundo. Cada mensagem MUST conter um único ativo, em rodízio entre os ativos assinados pela conexão.

#### Scenario: Taxa com um único ativo
- **WHEN** um cliente permanece assinado no canal `candle` de `PETR4` por cinco segundos
- **THEN** ele recebe entre 1.575 e 1.925 mensagens `candle` de `PETR4`

#### Scenario: Taxa com todos os ativos
- **WHEN** um cliente assinado no canal `candle` dos 500 ativos o acompanha por cinco segundos
- **THEN** ele recebe entre 1.575 e 1.925 mensagens `candle`, em rodízio entre os ativos

### Requirement: Virada do candle publicado
Quando o minuto virar, a mensagem `candle` de cada ativo MUST passar a trazer o candle do novo minuto.

#### Scenario: Novo minuto
- **WHEN** um ciclo de mercado acontece em um minuto posterior ao do candle publicado de `PETR4`
- **THEN** as mensagens `candle` seguintes de `PETR4` têm `time` igual ao início do novo minuto
