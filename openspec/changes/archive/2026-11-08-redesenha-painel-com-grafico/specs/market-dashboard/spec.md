# Spec Delta

## MODIFIED Requirements

### Requirement: Um painel para cada feed
A página SHALL exibir simultaneamente um painel para cada nó de dados em tempo real: status da conexão, cotações, book de ofertas, carteira, saldo e gráfico de preço.

#### Scenario: Abrir a aplicação
- **WHEN** a aplicação é aberta
- **THEN** os seis painéis são exibidos junto com o nome do homebroker

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

## ADDED Requirements

### Requirement: Painel de saldo
O painel de saldo SHALL mostrar a conta e, em quatro cards, o patrimônio total, o saldo disponível, o saldo bloqueado e o valor em ativos, igual ao patrimônio total menos os saldos disponível e bloqueado.

#### Scenario: Saldo recebido
- **WHEN** a aplicação recebe um saldo com `totalEquity` igual a `1000`, `availableBalance` igual a `300` e `blockedBalance` igual a `200`
- **THEN** o painel mostra `R$ 1.000,00`, `R$ 300,00`, `R$ 200,00` e `R$ 500,00` de valor em ativos

#### Scenario: Atualização do saldo
- **WHEN** chega um novo saldo
- **THEN** os cards mostram os novos valores sem recarregar a página

### Requirement: Temas claro e escuro
A página SHALL oferecer os temas claro e escuro e um controle no cabeçalho para alternar entre eles, aplicando a troca a todos os painéis e gráficos sem recarregar a página nem recriar os gráficos.

#### Scenario: Alternar o tema
- **WHEN** o usuário aciona o controle de tema no tema claro
- **THEN** a página e os gráficos passam ao tema escuro e os dados continuam atualizando

### Requirement: Escolha do tema inicial
Ao abrir, a página SHALL usar o último tema escolhido pelo usuário e, sem escolha salva, MUST seguir a preferência de cores do sistema.

#### Scenario: Tema já escolhido
- **WHEN** o usuário escolheu o tema claro e reabre a página em um sistema configurado como escuro
- **THEN** a página abre no tema claro

#### Scenario: Sem escolha salva
- **WHEN** não há escolha salva e o sistema está configurado como escuro
- **THEN** a página abre no tema escuro

### Requirement: Layout em seções
A página SHALL ter barra lateral de navegação, cabeçalho com o nome do homebroker e o status da conexão, e seções nesta ordem: saldo e gráfico, cotações, book e carteira.

#### Scenario: Navegar pela barra lateral
- **WHEN** o usuário aciona o item de cotações na barra lateral
- **THEN** a página rola até a seção de cotações

#### Scenario: Tela estreita
- **WHEN** a página é aberta em uma largura de celular
- **THEN** as seções ficam em uma coluna e a página não tem rolagem horizontal

### Requirement: Somente controles funcionais
A página MUST NOT exibir controles sem função, e todo item da barra lateral SHALL levar a uma seção existente.

#### Scenario: Itens da barra lateral
- **WHEN** a página é aberta
- **THEN** cada item da barra lateral corresponde a uma seção da página

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
