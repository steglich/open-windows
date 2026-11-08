# Spec Delta

## ADDED Requirements

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
