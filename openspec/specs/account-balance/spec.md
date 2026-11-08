# account-balance Specification

## Purpose

Define o canal de saldo da conta simulada e como saldo disponível, saldo bloqueado e patrimônio se relacionam com as ordens abertas e a carteira.

## Requirements

### Requirement: Publicação do saldo
O servidor SHALL enviar o saldo da conta a cada cliente assinado no canal `account` ao menos uma vez a cada dois segundos e MUST enviar o estado atual logo após confirmar a assinatura. O campo `symbols` MUST ser ignorado nesse canal.

#### Scenario: Fluxo contínuo
- **WHEN** um cliente permanece assinado em `account` por dez segundos
- **THEN** ele recebe ao menos cinco mensagens `account`

### Requirement: Conteúdo do saldo
Cada mensagem SHALL ter `type` igual a `account`, `timestamp` e `data` com `accountId`, `availableBalance`, `blockedBalance` e `totalEquity`, em reais com até duas casas decimais.

#### Scenario: Campos presentes
- **WHEN** um cliente recebe uma mensagem `account`
- **THEN** todos os campos definidos estão presentes

### Requirement: Saldo bloqueado derivado das ordens
`blockedBalance` MUST ser a soma, nas ordens de compra `OPEN` e `PARTIALLY_FILLED`, de `price * (requestedQuantity - filledQuantity)`. Ordens de venda abertas MUST não bloquear saldo, e sim a quantidade em custódia.

#### Scenario: Bloqueio comparado às ordens
- **WHEN** um cliente soma o valor restante de todas as compras abertas e parcialmente executadas
- **THEN** o resultado é igual ao `blockedBalance` recebido

### Requirement: Saldo disponível
`availableBalance` MUST ser positivo e constante enquanto o servidor estiver em execução.

#### Scenario: Saldo ao longo do tempo
- **WHEN** um cliente recebe mensagens `account` consecutivas
- **THEN** `availableBalance` e `blockedBalance` não mudam

### Requirement: Patrimônio total
`totalEquity` MUST ser `availableBalance + blockedBalance + totalMarketValue`, usando o `totalMarketValue` da carteira do mesmo ciclo. Quando ambos forem publicados no ciclo, o servidor MUST enviar `positions` antes de `account`.

#### Scenario: Patrimônio comparado à carteira
- **WHEN** um cliente assinado em `positions` e `account` recebe uma mensagem `account`
- **THEN** `totalEquity` corresponde à soma dos saldos com o `totalMarketValue` da última mensagem `positions`

### Requirement: Mesma conta da carteira
O `accountId` do canal `account` MUST ser igual ao do canal `positions`.

#### Scenario: Conta única
- **WHEN** um cliente assina os canais `positions` e `account`
- **THEN** as duas mensagens têm o mesmo `accountId`
