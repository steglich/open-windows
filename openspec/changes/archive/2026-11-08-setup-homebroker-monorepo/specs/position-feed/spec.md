# Spec Delta

## Purpose

Define a publicação em tempo real das posições de uma conta simulada, avaliadas pelos mesmos preços publicados nas cotações.

## ADDED Requirements

### Requirement: Conta simulada
O servidor SHALL manter uma única conta fictícia, compartilhada por todos os clientes, com posições em ao menos três ativos do catálogo.

#### Scenario: Mesma conta para todos
- **WHEN** dois clientes assinam o canal `positions`
- **THEN** ambos recebem o mesmo `accountId` e os mesmos ativos

### Requirement: Publicação periódica de posições
O servidor SHALL enviar a carteira completa a cada cliente assinado no canal `positions` ao menos uma vez a cada dois segundos.

#### Scenario: Fluxo contínuo
- **WHEN** um cliente permanece assinado em `positions` por dez segundos
- **THEN** ele recebe ao menos cinco mensagens `positions`

### Requirement: Conteúdo das posições
Cada mensagem SHALL ter `type` igual a `positions`, `timestamp` em milissegundos desde a época Unix e `data` com `accountId`, `totalMarketValue`, `totalUnrealizedPnl` e `positions`. Cada posição MUST ter `symbol`, `quantity`, `averagePrice`, `lastPrice`, `marketValue`, `unrealizedPnl` e `unrealizedPnlPercent`.

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
`totalMarketValue` e `totalUnrealizedPnl` MUST ser, respectivamente, a soma de `marketValue` e de `unrealizedPnl` de todas as posições.

#### Scenario: Totais consistentes
- **WHEN** um cliente recebe uma mensagem `positions`
- **THEN** os totais correspondem à soma das posições da mensagem

### Requirement: Quantidades fixas
A `quantity` e o `averagePrice` de cada posição MUST permanecer constantes enquanto o servidor estiver em execução, pois a simulação não executa ordens.

#### Scenario: Carteira ao longo do tempo
- **WHEN** um cliente recebe mensagens `positions` consecutivas
- **THEN** `quantity` e `averagePrice` de cada ativo não mudam entre as mensagens
