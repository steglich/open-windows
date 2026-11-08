# quote-feed Specification

## Purpose

Define a publicação em tempo real de cotações fictícias por ativo, com valores coerentes entre si, para alimentar o frontend do homebroker.

## Requirements

### Requirement: Catálogo de ativos
O servidor SHALL oferecer tickers reais da B3, como `PETR4` e `VALE3`, com preços inventados que não correspondem ao mercado real, mantendo o mesmo catálogo enquanto estiver em execução. Cada ticker MUST aparecer uma única vez.

#### Scenario: Catálogo disponível
- **WHEN** um cliente recebe a mensagem `welcome`
- **THEN** o campo `symbols` contém 500 códigos distintos, entre eles `PETR4` e `VALE3`

### Requirement: Publicação periódica de cotações
O servidor SHALL enviar a cada cliente assinado no canal `quote` ao menos uma mensagem `quotes` por segundo, contendo em um único frame a cotação de todos os ativos que ele assina.

#### Scenario: Fluxo contínuo
- **WHEN** um cliente permanece assinado em `PETR4` por cinco segundos
- **THEN** ele recebe ao menos cinco mensagens `quotes` contendo `PETR4`

#### Scenario: Lote por ciclo
- **WHEN** um cliente assinado em todos os ativos acompanha um ciclo de publicação
- **THEN** ele recebe uma única mensagem `quotes` com a cotação de cada ativo

### Requirement: Conteúdo da cotação
Cada mensagem SHALL ter `type` igual a `quotes`, `timestamp` em milissegundos desde a época Unix e `data` com uma lista de cotações. Cada cotação MUST ter `symbol`, `last`, `bid`, `ask`, `open`, `high`, `low`, `previousClose`, `change`, `changePercent`, `volume`, `financialVolume` e `updatedAt`.

#### Scenario: Campos presentes
- **WHEN** um cliente recebe uma mensagem `quotes`
- **THEN** todos os campos definidos estão presentes em cada cotação e os valores, exceto `symbol`, são numéricos

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
Os campos `volume`, quantidade de ações negociadas no pregão, e `financialVolume`, valor negociado no pregão em reais, MUST nunca diminuir enquanto o servidor estiver em execução. `volume` MUST ser um inteiro.

#### Scenario: Volume ao longo do tempo
- **WHEN** um cliente recebe cotações consecutivas do mesmo ativo
- **THEN** `volume` e `financialVolume` de cada cotação são maiores ou iguais aos da anterior

### Requirement: Momento da última atualização
O campo `updatedAt` SHALL indicar, em milissegundos desde a época Unix, o último ciclo em que a cotação do ativo foi atualizada, e MUST ser menor ou igual ao `timestamp` da mensagem.

#### Scenario: Atualização recente
- **WHEN** um cliente recebe uma mensagem `quotes`
- **THEN** o `updatedAt` de cada cotação é menor ou igual ao `timestamp` da mensagem
