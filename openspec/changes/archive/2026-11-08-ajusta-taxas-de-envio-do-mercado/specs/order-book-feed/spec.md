# Spec Delta

## MODIFIED Requirements

### Requirement: Publicação periódica do book
O servidor SHALL enviar a cada conexão com ao menos um ativo assinado no canal `book` 1000 mensagens `book` por segundo, com tolerância de 10% em uma janela de cinco segundos, espaçadas ao longo do segundo. Cada mensagem MUST conter o book completo de um único ativo, em rodízio entre os ativos assinados pela conexão, seja qual for a quantidade deles.

#### Scenario: Fluxo contínuo
- **WHEN** um cliente permanece assinado no book de `PETR4` por cinco segundos
- **THEN** ele recebe entre 4.500 e 5.500 mensagens `book` de `PETR4`

#### Scenario: Taxa com todos os ativos
- **WHEN** um cliente assinado no book dos 500 ativos o acompanha por cinco segundos
- **THEN** ele recebe entre 4.500 e 5.500 mensagens `book`, e cada ativo aparece ao menos uma vez em cada segundo

### Requirement: Coerência com a cotação
A melhor oferta de cada lado do book MUST ser igual a `bid` e `ask` da cotação do mesmo ativo gerada no mesmo ciclo de mercado. O campo `timestamp` das mensagens publicadas continuamente em `quote` e `book` MUST ser o instante do ciclo de mercado que as gerou.

#### Scenario: Cliente assinado em cotação e book
- **WHEN** um cliente assinado em `quote` e `book` de `PETR4` recebe uma mensagem `quotes` e uma mensagem `book` de `PETR4` com o mesmo `timestamp`
- **THEN** o primeiro preço de `bids` e o de `asks` são iguais a `bid` e `ask` da cotação

#### Scenario: Book mais recente que a cotação
- **WHEN** um cliente assinado em `quote` e `book` de `PETR4` recebe uma mensagem `book` com `timestamp` maior que o da última cotação recebida de `PETR4`
- **THEN** o book pode diferir dessa cotação até chegar uma cotação do mesmo ciclo
