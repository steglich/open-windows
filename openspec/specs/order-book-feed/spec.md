# order-book-feed Specification

## Purpose

Define a publicação em tempo real do book de ofertas fictício por ativo, coerente com as cotações simuladas pelo servidor.

## Requirements

### Requirement: Publicação periódica do book
O servidor SHALL enviar a cada conexão com ao menos um ativo assinado no canal `book` 1000 mensagens `book` por segundo, com tolerância de 10% em uma janela de cinco segundos, espaçadas ao longo do segundo. Cada mensagem MUST conter o book completo de um único ativo, em rodízio entre os ativos assinados pela conexão, seja qual for a quantidade deles.

#### Scenario: Fluxo contínuo
- **WHEN** um cliente permanece assinado no book de `PETR4` por cinco segundos
- **THEN** ele recebe entre 4.500 e 5.500 mensagens `book` de `PETR4`

#### Scenario: Taxa com todos os ativos
- **WHEN** um cliente assinado no book dos 500 ativos o acompanha por cinco segundos
- **THEN** ele recebe entre 4.500 e 5.500 mensagens `book`, e cada ativo aparece ao menos uma vez em cada segundo

### Requirement: Conteúdo do book
Cada mensagem SHALL ter `type` igual a `book`, `timestamp` em milissegundos desde a época Unix e `data` com `symbol`, `spread`, `bids` e `asks`. Cada lado MUST ter 50 níveis, cada um com `price`, `quantity` e `orders`, e cada nível MUST agregar a quantidade total daquele preço.

#### Scenario: Níveis presentes
- **WHEN** um cliente recebe uma mensagem `book`
- **THEN** `bids` e `asks` têm 50 níveis e todos os campos definidos estão presentes

### Requirement: Ordenação e valores dos níveis
Os níveis de `bids` MUST estar em ordem estritamente decrescente de preço, e os de `asks` em ordem estritamente crescente. Preços MUST ser positivos, com no máximo duas casas decimais, e `quantity` e `orders` MUST ser inteiros positivos.

#### Scenario: Book ordenado
- **WHEN** um cliente recebe qualquer mensagem `book`
- **THEN** os níveis respeitam a ordenação e os valores definidos

### Requirement: Book não cruzado
O maior preço de `bids` MUST ser sempre menor que o menor preço de `asks`.

#### Scenario: Melhores ofertas
- **WHEN** um cliente recebe qualquer mensagem `book`
- **THEN** o primeiro preço de `bids` é menor que o primeiro preço de `asks`

### Requirement: Coerência com a cotação
A melhor oferta de cada lado do book MUST ser igual a `bid` e `ask` da cotação do mesmo ativo gerada no mesmo ciclo de mercado. O campo `timestamp` das mensagens publicadas continuamente em `quote` e `book` MUST ser o instante do ciclo de mercado que as gerou.

#### Scenario: Cliente assinado em cotação e book
- **WHEN** um cliente assinado em `quote` e `book` de `PETR4` recebe uma mensagem `quotes` e uma mensagem `book` de `PETR4` com o mesmo `timestamp`
- **THEN** o primeiro preço de `bids` e o de `asks` são iguais a `bid` e `ask` da cotação

#### Scenario: Book mais recente que a cotação
- **WHEN** um cliente assinado em `quote` e `book` de `PETR4` recebe uma mensagem `book` com `timestamp` maior que o da última cotação recebida de `PETR4`
- **THEN** o book pode diferir dessa cotação até chegar uma cotação do mesmo ciclo

### Requirement: Spread derivado do book
O campo `spread` MUST ser o menor preço de `asks` menos o maior preço de `bids`, com duas casas decimais, e MUST ser positivo.

#### Scenario: Spread calculado
- **WHEN** um cliente recebe uma mensagem `book`
- **THEN** `spread` é igual ao primeiro preço de `asks` menos o primeiro preço de `bids`
