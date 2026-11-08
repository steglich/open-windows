# Spec Delta

## Purpose

Define a publicação em tempo real de cotações fictícias por ativo, com valores coerentes entre si, para alimentar o frontend do homebroker.

## ADDED Requirements

### Requirement: Catálogo de ativos fictícios
O servidor SHALL oferecer ao menos cinco ativos com códigos fictícios, como `ALFA3` e `BETA4`, mantendo o mesmo catálogo enquanto estiver em execução.

#### Scenario: Catálogo disponível
- **WHEN** um cliente recebe a mensagem `welcome`
- **THEN** o campo `symbols` contém ao menos cinco códigos de ativos

### Requirement: Publicação periódica de cotações
O servidor SHALL enviar, para cada ativo assinado no canal `quote`, ao menos uma cotação por segundo.

#### Scenario: Fluxo contínuo
- **WHEN** um cliente permanece assinado em `ALFA3` por cinco segundos
- **THEN** ele recebe ao menos cinco mensagens `quote` de `ALFA3`

### Requirement: Conteúdo da cotação
Cada mensagem SHALL ter `type` igual a `quote`, `timestamp` em milissegundos desde a época Unix e `data` com `symbol`, `last`, `bid`, `ask`, `open`, `high`, `low`, `previousClose`, `change`, `changePercent` e `volume`.

#### Scenario: Campos presentes
- **WHEN** um cliente recebe uma mensagem `quote`
- **THEN** todos os campos definidos estão presentes e os valores de `data`, exceto `symbol`, são numéricos

### Requirement: Variação de preços
O preço `last` de cada ativo SHALL variar ao longo do tempo de forma gradual, sem saltos maiores que 1% entre duas publicações consecutivas.

#### Scenario: Preço em movimento
- **WHEN** um cliente acompanha um ativo por trinta segundos
- **THEN** o valor de `last` muda ao menos uma vez e cada variação entre mensagens consecutivas não ultrapassa 1%

### Requirement: Coerência da cotação
Todos os preços MUST ser positivos, com no máximo duas casas decimais, e MUST satisfazer `bid < ask` e `low <= last <= high`. O campo `change` MUST ser `last - previousClose`, e `changePercent` MUST ser essa diferença em percentual de `previousClose`, ambos arredondados a duas casas.

#### Scenario: Valores coerentes
- **WHEN** um cliente recebe qualquer mensagem `quote`
- **THEN** os valores respeitam as relações definidas

### Requirement: Volume acumulado
O campo `volume` de cada ativo MUST ser um inteiro que nunca diminui enquanto o servidor estiver em execução.

#### Scenario: Volume ao longo do tempo
- **WHEN** um cliente recebe mensagens `quote` consecutivas do mesmo ativo
- **THEN** o `volume` de cada mensagem é maior ou igual ao da anterior
