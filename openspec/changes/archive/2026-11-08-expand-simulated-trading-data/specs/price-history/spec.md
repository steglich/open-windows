# Spec Delta

## Purpose

Define a consulta de candles de 1 minuto por ativo e sua coerência com as cotações, para alimentar gráficos de preço.

## ADDED Requirements

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
