# Spec Delta

## Purpose

Define a publicação em tempo real do book de ofertas fictício por ativo, coerente com as cotações simuladas pelo servidor.

## ADDED Requirements

### Requirement: Publicação periódica do book
O servidor SHALL enviar, para cada ativo assinado no canal `book`, ao menos um book completo por segundo.

#### Scenario: Fluxo contínuo
- **WHEN** um cliente permanece assinado no book de `ALFA3` por cinco segundos
- **THEN** ele recebe ao menos cinco mensagens `book` de `ALFA3`

### Requirement: Conteúdo do book
Cada mensagem SHALL ter `type` igual a `book`, `timestamp` em milissegundos desde a época Unix e `data` com `symbol`, `bids` e `asks`. Cada lado MUST ter cinco níveis, cada um com `price`, `quantity` e `orders`.

#### Scenario: Níveis presentes
- **WHEN** um cliente recebe uma mensagem `book`
- **THEN** `bids` e `asks` têm cinco níveis e todos os campos definidos estão presentes

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
Em um mesmo ciclo de publicação, o servidor MUST enviar a cotação antes do book, e a melhor oferta de cada lado do book MUST ser igual a `bid` e `ask` dessa cotação.

#### Scenario: Cliente assinado em cotação e book
- **WHEN** um cliente assinado em `quote` e `book` de `ALFA3` recebe uma mensagem `book`
- **THEN** o primeiro preço de `bids` e o de `asks` são iguais a `bid` e `ask` da última cotação recebida de `ALFA3`
