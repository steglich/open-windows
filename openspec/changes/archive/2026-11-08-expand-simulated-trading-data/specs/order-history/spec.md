# Spec Delta

## Purpose

Define a consulta paginada do histórico de ordens da conta simulada e a coerência de status, quantidades, preços e datas de cada ordem.

## ADDED Requirements

### Requirement: Consulta de ordens
O servidor SHALL aceitar `{"type":"getOrders","requestId":<string>,"status":<status>,"symbol":<ativo>,"offset":<n>,"limit":<1..500>}`, com filtros e paginação opcionais, `offset` padrão 0 e `limit` padrão 100.

#### Scenario: Filtro por status
- **WHEN** um cliente envia `getOrders` com `status` igual a `PARTIALLY_FILLED`
- **THEN** todos os itens da resposta têm esse status

#### Scenario: Paginação
- **WHEN** um cliente envia `getOrders` com `offset` igual a `100` e `limit` igual a `100`
- **THEN** ele recebe a segunda página, sem repetir itens da primeira

### Requirement: Formato da resposta de ordens
A resposta SHALL ter `type` igual a `orders`, o `requestId` recebido, `timestamp` e `data` com `items`, `total`, `offset` e `limit`. `total` MUST contar todas as ordens que atendem aos filtros, e `items` MUST vir em ordem decrescente de `createdAt`, desempatada por `id`.

#### Scenario: Total da consulta filtrada
- **WHEN** um cliente envia `getOrders` com `limit` igual a `1` e um filtro
- **THEN** `items` tem uma ordem e `total` informa quantas ordens atendem ao filtro

### Requirement: Campos da ordem
Cada ordem MUST ter `id` único, `symbol`, `side` (`BUY` ou `SELL`), `type` (`LIMIT` ou `MARKET`), `validity` (`DAY` ou `GTC`), `price`, `requestedQuantity`, `filledQuantity`, `averageFillPrice`, `status`, `createdAt` e `updatedAt`, com datas em milissegundos desde a época Unix.

#### Scenario: Campos presentes
- **WHEN** um cliente recebe uma ordem
- **THEN** todos os campos definidos estão presentes e nenhuma outra ordem tem o mesmo `id`

### Requirement: Cobertura dos status
Com o volume padrão, o histórico SHALL conter ao menos 100 ordens de cada status: `OPEN`, `FILLED`, `CANCELLED` e `PARTIALLY_FILLED`.

#### Scenario: Todos os status
- **WHEN** um cliente consulta o `total` de cada status
- **THEN** cada `total` é de ao menos 100

### Requirement: Coerência entre status e quantidades
`filledQuantity` MUST ser `0` em `OPEN`, maior que `0` e menor que `requestedQuantity` em `PARTIALLY_FILLED`, igual a `requestedQuantity` em `FILLED`, e menor que `requestedQuantity` em `CANCELLED`. As quantidades MUST ser múltiplas de 100.

#### Scenario: Ordem parcialmente executada
- **WHEN** um cliente recebe uma ordem `PARTIALLY_FILLED`
- **THEN** `filledQuantity` é maior que zero e menor que `requestedQuantity`

### Requirement: Coerência de preços
`price` MUST ser `null` em ordens `MARKET` e positivo em `LIMIT`. `averageFillPrice` MUST ser `null` quando `filledQuantity` for `0` e positivo caso contrário. Em ordens `LIMIT` executadas, MUST ser menor ou igual a `price` na compra e maior ou igual na venda.

#### Scenario: Compra limitada executada
- **WHEN** um cliente recebe uma ordem `LIMIT` de compra com execução
- **THEN** `averageFillPrice` é menor ou igual a `price`

### Requirement: Status possíveis por tipo de ordem
Ordens `MARKET` MUST ter status `FILLED` ou `CANCELLED`. Ordens `OPEN` ou `PARTIALLY_FILLED` MUST ser `LIMIT`, e as de validade `DAY` nesses status MUST ter sido criadas no pregão corrente.

#### Scenario: Ordem a mercado
- **WHEN** um cliente recebe uma ordem `MARKET`
- **THEN** o status é `FILLED` ou `CANCELLED`

### Requirement: Coerência das datas
`createdAt` MUST ser menor ou igual a `updatedAt`, e `updatedAt` MUST ser menor ou igual ao `timestamp` da resposta.

#### Scenario: Datas coerentes
- **WHEN** um cliente recebe uma ordem
- **THEN** as datas respeitam as relações definidas

### Requirement: Histórico imutável
As ordens MUST permanecer iguais enquanto o servidor estiver em execução, pois a simulação não aceita envio de ordens.

#### Scenario: Consultas repetidas
- **WHEN** um cliente repete uma consulta de ordens depois de vários ciclos
- **THEN** as duas respostas têm os mesmos `items` e o mesmo `total`

### Requirement: Erros na consulta de ordens
Para `symbol` desconhecido, o servidor SHALL responder `error` com `code` igual a `UNKNOWN_SYMBOL` e o `requestId` recebido. Para `status` desconhecido, `offset` negativo ou `limit` fora do intervalo, MUST usar `code` igual a `INVALID_MESSAGE`.

#### Scenario: Status desconhecido
- **WHEN** um cliente envia `getOrders` com `status` igual a `PENDING`
- **THEN** ele recebe `error` com `code` igual a `INVALID_MESSAGE` e o mesmo `requestId`
