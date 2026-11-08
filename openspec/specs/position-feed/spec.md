# position-feed Specification

## Purpose

Define a publicação em tempo real das posições de uma conta simulada, avaliadas pelos mesmos preços publicados nas cotações.

## Requirements

### Requirement: Conta simulada
O servidor SHALL manter uma única conta fictícia, compartilhada por todos os clientes, com 300 posições em ativos distintos do catálogo.

#### Scenario: Mesma conta para todos
- **WHEN** dois clientes assinam o canal `positions`
- **THEN** ambos recebem o mesmo `accountId` e os mesmos 300 ativos

### Requirement: Publicação periódica de posições
O servidor SHALL enviar a carteira completa a cada cliente assinado no canal `positions` ao menos uma vez a cada dois segundos.

#### Scenario: Fluxo contínuo
- **WHEN** um cliente permanece assinado em `positions` por dez segundos
- **THEN** ele recebe ao menos cinco mensagens `positions`

### Requirement: Conteúdo das posições
Cada mensagem SHALL ter `type` igual a `positions`, `timestamp` em milissegundos desde a época Unix e `data` com `accountId`, `totalMarketValue`, `totalUnrealizedPnl`, `totalUnrealizedPnlPercent` e `positions`. Cada posição MUST ter `symbol`, `quantity`, `blockedQuantity`, `averagePrice`, `lastPrice`, `marketValue`, `unrealizedPnl` e `unrealizedPnlPercent`.

#### Scenario: Campos presentes
- **WHEN** um cliente recebe uma mensagem `positions`
- **THEN** todos os campos definidos estão presentes

### Requirement: Avaliação pelos preços simulados
O `lastPrice` de cada posição MUST ser o preço `last` atual do ativo. Com arredondamento a duas casas, `marketValue` MUST ser `quantity * lastPrice`, `unrealizedPnl` MUST ser `(lastPrice - averagePrice) * quantity` e `unrealizedPnlPercent` MUST ser o percentual sobre `averagePrice`.

#### Scenario: Valores calculados
- **WHEN** um cliente recebe uma mensagem `positions`
- **THEN** os valores de cada posição correspondem às fórmulas definidas

#### Scenario: Preço igual ao da cotação
- **WHEN** um cliente assinado em `quote` e `positions` recebe uma mensagem `positions`
- **THEN** o `lastPrice` de cada posição é igual ao `last` da última cotação recebida do ativo

### Requirement: Totais da carteira
`totalMarketValue` e `totalUnrealizedPnl` MUST ser, respectivamente, a soma de `marketValue` e de `unrealizedPnl` de todas as posições. `totalUnrealizedPnlPercent` MUST ser `totalUnrealizedPnl` em percentual do custo total da carteira, a soma de `quantity * averagePrice`, com duas casas.

#### Scenario: Totais consistentes
- **WHEN** um cliente recebe uma mensagem `positions`
- **THEN** os totais correspondem à soma das posições da mensagem

#### Scenario: Percentual total
- **WHEN** um cliente divide `totalUnrealizedPnl` pelo custo total das posições da mensagem
- **THEN** o resultado corresponde a `totalUnrealizedPnlPercent`

### Requirement: Quantidades fixas
A `quantity` e o `averagePrice` de cada posição MUST permanecer constantes enquanto o servidor estiver em execução, pois a simulação não executa ordens.

#### Scenario: Carteira ao longo do tempo
- **WHEN** um cliente recebe mensagens `positions` consecutivas
- **THEN** `quantity` e `averagePrice` de cada ativo não mudam entre as mensagens

### Requirement: Posições derivadas das execuções
A `quantity` de cada posição MUST ser a soma das quantidades executadas em compras menos a das vendas do histórico de ordens daquele ativo, e `averagePrice` MUST ser o preço médio das compras com o custo reduzido proporcionalmente nas vendas. Ativos fora da carteira MUST não ter execuções.

#### Scenario: Quantidade comparada ao histórico
- **WHEN** um cliente soma as execuções de um ativo em todas as páginas de ordens
- **THEN** o saldo de compras menos vendas é igual à `quantity` da posição

#### Scenario: Ativo fora da carteira
- **WHEN** um cliente consulta as ordens de um ativo que não está na carteira
- **THEN** todas têm `filledQuantity` igual a `0`

### Requirement: Quantidade bloqueada
`blockedQuantity` MUST ser a soma de `requestedQuantity - filledQuantity` nas ordens de venda `OPEN` e `PARTIALLY_FILLED` do ativo, e MUST ser menor ou igual a `quantity`.

#### Scenario: Bloqueio comparado às ordens
- **WHEN** um cliente soma o restante das vendas abertas e parcialmente executadas de um ativo
- **THEN** o resultado é igual à `blockedQuantity` da posição e não ultrapassa `quantity`
