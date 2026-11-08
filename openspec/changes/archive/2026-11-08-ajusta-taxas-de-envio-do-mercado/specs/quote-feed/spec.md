# Spec Delta

## MODIFIED Requirements

### Requirement: Publicação periódica de cotações
O servidor SHALL enviar a cada conexão com ao menos um ativo assinado no canal `quote` 500 mensagens `quotes` por segundo, com tolerância de 10% em uma janela de cinco segundos, espaçadas ao longo do segundo. Cada mensagem MUST conter a cotação de um único ativo, em rodízio entre os ativos assinados pela conexão, seja qual for a quantidade deles.

#### Scenario: Taxa com todos os ativos
- **WHEN** um cliente assinado em todos os 500 ativos acompanha o canal `quote` por cinco segundos
- **THEN** ele recebe entre 2.250 e 2.750 mensagens `quotes`, cada uma com uma única cotação, e cada ativo aparece ao menos uma vez em cada intervalo de dois segundos

#### Scenario: Fluxo contínuo
- **WHEN** um cliente permanece assinado somente em `PETR4` por cinco segundos
- **THEN** ele recebe entre 2.250 e 2.750 mensagens `quotes`, todas contendo somente `PETR4`

#### Scenario: Lote por ciclo
- **WHEN** um cliente assinado em todos os ativos acompanha um ciclo de mercado
- **THEN** ele não recebe um lote com todos os ativos, e as mensagens chegam distribuídas ao longo do segundo, cada uma com uma única cotação

### Requirement: Variação de preços
O preço `last` de cada ativo SHALL variar ao longo do tempo de forma gradual, sem saltos maiores que 1% entre dois ciclos de mercado consecutivos.

#### Scenario: Preço em movimento
- **WHEN** um cliente assinado em um único ativo o acompanha por trinta segundos
- **THEN** o valor de `last` muda ao menos uma vez e cada variação entre ciclos de mercado consecutivos não ultrapassa 1%
