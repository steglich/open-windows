# Spec Delta

## MODIFIED Requirements

### Requirement: Publicação periódica do book
O servidor SHALL enviar, para cada ativo assinado no canal `book`, ao menos um book completo por segundo.

#### Scenario: Fluxo contínuo
- **WHEN** um cliente permanece assinado no book de `PETR4` por cinco segundos
- **THEN** ele recebe ao menos cinco mensagens `book` de `PETR4`

### Requirement: Conteúdo do book
Cada mensagem SHALL ter `type` igual a `book`, `timestamp` em milissegundos desde a época Unix e `data` com `symbol`, `spread`, `bids` e `asks`. Cada lado MUST ter 50 níveis, cada um com `price`, `quantity` e `orders`, e cada nível MUST agregar a quantidade total daquele preço.

#### Scenario: Níveis presentes
- **WHEN** um cliente recebe uma mensagem `book`
- **THEN** `bids` e `asks` têm 50 níveis e todos os campos definidos estão presentes

### Requirement: Coerência com a cotação
Em um mesmo ciclo de publicação, o servidor MUST enviar as cotações antes dos books, e a melhor oferta de cada lado do book MUST ser igual a `bid` e `ask` da cotação do ativo.

#### Scenario: Cliente assinado em cotação e book
- **WHEN** um cliente assinado em `quote` e `book` de `PETR4` recebe uma mensagem `book`
- **THEN** o primeiro preço de `bids` e o de `asks` são iguais a `bid` e `ask` da última cotação recebida de `PETR4`

## ADDED Requirements

### Requirement: Spread derivado do book
O campo `spread` MUST ser o menor preço de `asks` menos o maior preço de `bids`, com duas casas decimais, e MUST ser positivo.

#### Scenario: Spread calculado
- **WHEN** um cliente recebe uma mensagem `book`
- **THEN** `spread` é igual ao primeiro preço de `asks` menos o primeiro preço de `bids`
