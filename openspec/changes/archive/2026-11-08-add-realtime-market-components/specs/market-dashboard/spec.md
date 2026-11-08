# Spec Delta

## Purpose

Define os painéis que mostram ao usuário cada feed em tempo real do homebroker e o estado de cada um, incluindo a conexão com o servidor.

## ADDED Requirements

### Requirement: Um painel para cada feed
A página SHALL exibir simultaneamente um painel para cada nó de dados em tempo real: status da conexão, cotações, book de ofertas e carteira.

#### Scenario: Abrir a aplicação
- **WHEN** a aplicação é aberta
- **THEN** os quatro painéis são exibidos junto com o nome do homebroker

### Requirement: Painel de status da conexão
O painel de status SHALL mostrar em texto o estado atual da conexão e MUST mostrar o código e a mensagem do erro informado pelo servidor enquanto ele estiver exposto.

#### Scenario: Conexão estabelecida
- **WHEN** o estado da conexão é `connected`
- **THEN** o painel indica que a aplicação está conectada

#### Scenario: Tentando reconectar
- **WHEN** o estado da conexão é `reconnecting`
- **THEN** o painel indica que a aplicação está tentando reconectar

#### Scenario: Erro do servidor
- **WHEN** existe um erro exposto com `code` e `message`
- **THEN** o painel exibe o código e o texto do erro

### Requirement: Painel de cotações
O painel de cotações SHALL listar uma linha por ativo, com último preço, variação, variação percentual, compra, venda, abertura, máxima, mínima, fechamento anterior e volume.

#### Scenario: Cotações recebidas
- **WHEN** há cotações de todos os ativos
- **THEN** cada ativo aparece uma única vez com todos os campos da sua cotação

#### Scenario: Atualização de uma cotação
- **WHEN** chega uma nova cotação de `ALFA3`
- **THEN** a linha de `ALFA3` mostra os novos valores sem recarregar a página

### Requirement: Seleção de ativo para o book
O painel de cotações SHALL permitir selecionar um ativo com mouse ou teclado e MUST destacar a linha do ativo selecionado.

#### Scenario: Selecionar um ativo
- **WHEN** o usuário seleciona a linha de `BETA4`
- **THEN** a linha de `BETA4` fica destacada e o painel de book passa a mostrar `BETA4`

#### Scenario: Selecionar pelo teclado
- **WHEN** o foco está na linha de `BETA4` e o usuário pressiona Enter
- **THEN** `BETA4` passa a ser o ativo selecionado

### Requirement: Painel de book de ofertas
O painel de book SHALL mostrar o código do ativo selecionado e, em dois lados separados, os níveis de compra e de venda, na ordem recebida, cada um com preço, quantidade e número de ordens.

#### Scenario: Book recebido
- **WHEN** há um book do ativo selecionado
- **THEN** os níveis de compra e de venda aparecem na ordem enviada pelo servidor

#### Scenario: Atualização do book
- **WHEN** chega um novo book do ativo selecionado
- **THEN** o painel mostra os novos níveis sem recarregar a página

### Requirement: Painel de carteira
O painel de carteira SHALL mostrar a conta, o valor total, o resultado não realizado total e uma linha por posição, com quantidade, preço médio, último preço, valor de mercado, resultado e resultado percentual.

#### Scenario: Carteira recebida
- **WHEN** a aplicação recebe a carteira
- **THEN** o painel mostra os totais e todas as posições com seus campos

#### Scenario: Atualização da carteira
- **WHEN** chega uma nova carteira
- **THEN** totais e posições mostram os novos valores sem recarregar a página

### Requirement: Estado de cada feed
Os painéis de cotações, book e carteira SHALL exibir um aviso de aguardando dados enquanto não houver dados e MUST exibir um aviso de dados desatualizados enquanto a conexão não estiver `connected`.

#### Scenario: Sem dados ainda
- **WHEN** um painel ainda não recebeu nenhum dado do seu feed
- **THEN** ele exibe o aviso de aguardando dados

#### Scenario: Queda com dados na tela
- **WHEN** a conexão cai e um painel já tem dados
- **THEN** ele continua mostrando os últimos valores com o aviso de dados desatualizados

#### Scenario: Reconexão
- **WHEN** a conexão volta ao estado `connected`
- **THEN** o aviso de dados desatualizados desaparece

### Requirement: Indicação de ganho e perda
Variações e resultados SHALL ser diferenciados por cor entre positivos, negativos e zero, e valores positivos MUST exibir o sinal `+`, para que o sentido não dependa apenas da cor.

#### Scenario: Variação negativa
- **WHEN** a variação de um ativo é negativa
- **THEN** o valor é exibido com o sinal `-` e na cor de perda

#### Scenario: Resultado positivo
- **WHEN** o resultado de uma posição é positivo
- **THEN** o valor é exibido com o sinal `+` e na cor de ganho

#### Scenario: Variação zero
- **WHEN** a variação de um ativo é zero
- **THEN** o valor é exibido sem sinal e na cor neutra

### Requirement: Formatação brasileira
Valores monetários SHALL ser exibidos em reais e todos os números MUST seguir o formato `pt-BR`.

#### Scenario: Preço em reais
- **WHEN** um preço igual a `1234.5` é exibido
- **THEN** o texto exibido é `R$ 1.234,50`

#### Scenario: Volume
- **WHEN** um volume igual a `1500000` é exibido
- **THEN** o texto exibido é `1.500.000`
