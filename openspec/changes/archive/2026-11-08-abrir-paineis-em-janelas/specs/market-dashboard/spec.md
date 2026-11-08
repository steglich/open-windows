# Spec Delta

## MODIFIED Requirements

### Requirement: Um painel para cada feed
A página SHALL exibir simultaneamente um painel para cada nó de dados em tempo real: status da conexão, cotações, book de ofertas, carteira, saldo e gráfico de preço, exceto os painéis que estiverem abertos em janela independente.

#### Scenario: Abrir a aplicação
- **WHEN** a aplicação é aberta
- **THEN** os seis painéis são exibidos junto com o nome do homebroker

#### Scenario: Painel aberto em janela
- **WHEN** um dos painéis está aberto em janela independente
- **THEN** a página exibe os outros cinco painéis junto com o nome do homebroker

### Requirement: Temas claro e escuro
A página SHALL oferecer os temas claro e escuro e um controle no cabeçalho para alternar entre eles, aplicando a troca a todos os painéis e gráficos, inclusive os abertos em janelas independentes, sem recarregar a página nem recriar os gráficos.

#### Scenario: Alternar o tema
- **WHEN** o usuário aciona o controle de tema no tema claro
- **THEN** a página e os gráficos passam ao tema escuro e os dados continuam atualizando

#### Scenario: Alternar o tema com janela aberta
- **WHEN** o painel de gráfico está aberto em uma janela e o usuário aciona o controle de tema na página principal
- **THEN** a janela e o gráfico dela passam ao novo tema sem recarregar

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
