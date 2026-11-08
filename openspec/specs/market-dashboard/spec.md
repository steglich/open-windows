# market-dashboard Specification

## Purpose

Define os painéis que mostram ao usuário cada feed em tempo real do homebroker e o estado de cada um, incluindo a conexão com o servidor.

## Requirements

### Requirement: Um painel para cada feed
A página SHALL exibir simultaneamente um painel para cada nó de dados em tempo real: status da conexão, cotações, book de ofertas, carteira, saldo e gráfico de preço, exceto os painéis que estiverem abertos em janela independente.

#### Scenario: Abrir a aplicação
- **WHEN** a aplicação é aberta
- **THEN** os seis painéis são exibidos junto com o nome do homebroker

#### Scenario: Painel aberto em janela
- **WHEN** um dos painéis está aberto em janela independente
- **THEN** a página exibe os outros cinco painéis junto com o nome do homebroker

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

#### Scenario: Conexão indisponível no navegador
- **WHEN** o estado da conexão é `unavailable`
- **THEN** o painel indica que este navegador não permite a conexão com o mercado

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
Os painéis de cotações, book, carteira, saldo e gráfico SHALL exibir um aviso de aguardando dados enquanto não houver dados e MUST exibir um aviso de dados desatualizados enquanto a conexão não estiver `connected`.

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

### Requirement: Painel de saldo
O painel de saldo SHALL mostrar a conta e, em quatro cards, o patrimônio total, o saldo disponível, o saldo bloqueado e o valor em ativos, igual ao patrimônio total menos os saldos disponível e bloqueado.

#### Scenario: Saldo recebido
- **WHEN** a aplicação recebe um saldo com `totalEquity` igual a `1000`, `availableBalance` igual a `300` e `blockedBalance` igual a `200`
- **THEN** o painel mostra `R$ 1.000,00`, `R$ 300,00`, `R$ 200,00` e `R$ 500,00` de valor em ativos

#### Scenario: Atualização do saldo
- **WHEN** chega um novo saldo
- **THEN** os cards mostram os novos valores sem recarregar a página

### Requirement: Temas claro e escuro
A página SHALL oferecer os temas claro e escuro e um controle no cabeçalho para alternar entre eles, aplicando a troca a todos os painéis e gráficos, inclusive os abertos em janelas independentes, sem recarregar a página nem recriar os gráficos.

#### Scenario: Alternar o tema
- **WHEN** o usuário aciona o controle de tema no tema claro
- **THEN** a página e os gráficos passam ao tema escuro e os dados continuam atualizando

#### Scenario: Alternar o tema com janela aberta
- **WHEN** o painel de gráfico está aberto em uma janela e o usuário aciona o controle de tema na página principal
- **THEN** a janela e o gráfico dela passam ao novo tema sem recarregar

### Requirement: Escolha do tema inicial
Ao abrir, a página SHALL usar o último tema escolhido pelo usuário e, sem escolha salva, MUST seguir a preferência de cores do sistema.

#### Scenario: Tema já escolhido
- **WHEN** o usuário escolheu o tema claro e reabre a página em um sistema configurado como escuro
- **THEN** a página abre no tema claro

#### Scenario: Sem escolha salva
- **WHEN** não há escolha salva e o sistema está configurado como escuro
- **THEN** a página abre no tema escuro

### Requirement: Layout em seções
A página SHALL ter barra lateral de navegação, cabeçalho com o nome do homebroker e o status da conexão, e seções nesta ordem: saldo e gráfico, cotações, book e carteira, omitindo os painéis abertos em janela independente e mantendo a ordem dos demais.

#### Scenario: Navegar pela barra lateral
- **WHEN** o usuário aciona o item de cotações na barra lateral
- **THEN** a página rola até a seção de cotações

#### Scenario: Tela estreita
- **WHEN** a página é aberta em uma largura de celular
- **THEN** as seções ficam em uma coluna e a página não tem rolagem horizontal

#### Scenario: Painel de status em janela
- **WHEN** o painel de status está aberto em janela independente
- **THEN** o cabeçalho continua exibindo o nome do homebroker e o controle de tema, sem o status da conexão

### Requirement: Somente controles funcionais
A página MUST NOT exibir controles sem função, e todo item da barra lateral SHALL levar a uma seção existente.

#### Scenario: Itens da barra lateral
- **WHEN** a página é aberta
- **THEN** cada item da barra lateral corresponde a uma seção da página

#### Scenario: Seção inteira em janela
- **WHEN** todos os painéis de uma seção estão abertos em janelas independentes
- **THEN** a barra lateral não exibe o item dessa seção

#### Scenario: Seção parcialmente em janela
- **WHEN** o gráfico de preço está em uma janela e o painel de saldo continua na página
- **THEN** a barra lateral continua exibindo o item da visão geral

### Requirement: Listas longas com rolagem interna
As tabelas de cotações, de níveis do book e de posições SHALL rolar dentro do próprio painel, mantendo o cabeçalho das colunas visível, sem omitir itens recebidos.

#### Scenario: Muitos ativos
- **WHEN** há mais cotações do que cabem na altura do painel
- **THEN** o painel rola internamente, o cabeçalho da tabela continua visível e todos os ativos estão na tabela

### Requirement: Melhor preço e spread no book
O painel de book SHALL destacar o melhor preço de compra, o melhor preço de venda e, entre os dois lados, o spread recebido.

#### Scenario: Book recebido
- **WHEN** o book tem o primeiro nível de compra em `32.49`, o primeiro nível de venda em `32.51` e `spread` igual a `0.02`
- **THEN** o painel destaca `R$ 32,49`, `R$ 32,51` e o spread de `R$ 0,02`

### Requirement: Distribuição da carteira
O painel de carteira SHALL mostrar uma rosca com a participação das cinco maiores posições por valor de mercado e uma fatia "Outros" com as demais, com legenda em texto contendo ativo e percentual.

#### Scenario: Carteira com muitas posições
- **WHEN** a carteira tem mais de cinco posições
- **THEN** a rosca tem seis fatias, as cinco maiores posições e "Outros", e a legenda lista o nome e o percentual de cada uma

#### Scenario: Carteira com poucas posições
- **WHEN** a carteira tem até cinco posições
- **THEN** a rosca tem uma fatia por posição e não exibe "Outros"

#### Scenario: Carteira sem valor de mercado
- **WHEN** a carteira não tem posições com valor de mercado positivo
- **THEN** a rosca não é exibida e a tabela e os totais continuam visíveis

### Requirement: Resumo das cotações
O painel de cotações SHALL mostrar, acima da tabela, a quantidade total de ativos e as quantidades em alta, em baixa e estáveis, considerando o sinal da variação.

#### Scenario: Cotações com variações diferentes
- **WHEN** há dois ativos com variação positiva, um com variação negativa e um com variação zero
- **THEN** o resumo mostra 4 ativos, 2 em alta, 1 em baixa e 1 estável
