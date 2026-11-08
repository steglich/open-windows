# Spec Delta

## Purpose

Permite abrir cada painel do homebroker em uma janela independente do navegador, com o painel saindo da página principal enquanto a janela estiver aberta e voltando ao lugar quando ela for fechada.

## ADDED Requirements

### Requirement: Abertura de painel em janela
Cada um dos seis painéis (status da conexão, saldo, gráfico de preço, cotações, book e carteira) SHALL oferecer na página principal um controle que o abre em uma janela independente do navegador contendo somente aquele painel.

#### Scenario: Abrir um painel
- **WHEN** o usuário aciona o controle de abrir em janela do painel de cotações
- **THEN** uma nova janela do navegador é aberta exibindo somente o painel de cotações

#### Scenario: Controle ausente dentro da janela
- **WHEN** um painel é exibido em uma janela independente
- **THEN** ele não oferece o controle de abrir em janela

### Requirement: Identificação da janela
A janela independente SHALL ter um título que identifica o painel exibido e o homebroker.

#### Scenario: Título da janela de book
- **WHEN** o painel de book é aberto em uma janela
- **THEN** o título da janela contém o nome do painel e o nome do homebroker

### Requirement: Painel fora da página principal
Enquanto um painel estiver aberto em janela, a página principal MUST NOT exibi-lo e SHALL continuar exibindo os demais painéis.

#### Scenario: Painel aberto em janela
- **WHEN** o painel de book é aberto em uma janela
- **THEN** o painel de book some da página principal e os demais painéis continuam visíveis e atualizando

#### Scenario: Seção com um painel restante
- **WHEN** o gráfico de preço é aberto em uma janela e o painel de saldo continua na página principal
- **THEN** o painel de saldo ocupa toda a largura da seção

#### Scenario: Todos os painéis em janelas
- **WHEN** os seis painéis estão abertos em janelas
- **THEN** a página principal informa que todos os painéis estão em janelas separadas

### Requirement: Retorno do painel ao fechar a janela
Ao fechar a janela de um painel, a página principal SHALL voltar a exibi-lo na posição original, com os dados atuais e sem recarregar a página.

#### Scenario: Fechar a janela
- **WHEN** o usuário fecha a janela do painel de carteira
- **THEN** o painel de carteira volta a aparecer na sua posição original na página principal

#### Scenario: Dados atualizados no retorno
- **WHEN** um painel volta à página principal depois de um período em janela
- **THEN** ele não exibe valores antigos e mostra os dados atuais assim que o servidor enviar o estado inicial

#### Scenario: Janela encerrada abruptamente
- **WHEN** o processo da janela de um painel trava ou é encerrado
- **THEN** o painel volta à sua posição original na página principal

#### Scenario: Recarregar a janela
- **WHEN** o usuário recarrega a janela de um painel
- **THEN** o painel continua na janela e não volta à página principal

#### Scenario: Reabrir depois de fechar
- **WHEN** um painel voltou à página principal
- **THEN** o controle de abrir em janela volta a estar disponível e pode ser usado novamente

### Requirement: Janelas encerradas com a página principal
Fechar ou recarregar a página principal SHALL fechar as janelas de painel abertas por ela.

#### Scenario: Fechar a página principal
- **WHEN** há painéis em janelas e o usuário fecha a página principal
- **THEN** as janelas abertas por ela também são fechadas

#### Scenario: Página principal encerrada abruptamente
- **WHEN** há painéis em janelas e o processo da página principal trava
- **THEN** as janelas abertas por ela são fechadas

#### Scenario: Recarregar a página principal
- **WHEN** há painéis em janelas e o usuário recarrega a página principal
- **THEN** as janelas são fechadas e a página volta a exibir todos os painéis

### Requirement: Dados em tempo real na janela
A janela de um painel SHALL exibir os dados em tempo real e os avisos de estado do feed da mesma forma que a página principal, usando a conexão única compartilhada com o servidor.

#### Scenario: Atualização na janela
- **WHEN** chega uma nova cotação com o painel de cotações aberto em janela
- **THEN** a janela mostra os novos valores sem recarregar

#### Scenario: Janela recebe somente o seu painel
- **WHEN** o painel de carteira está aberto em uma janela
- **THEN** a janela recebe somente as mensagens de `positions`, e a página principal deixa de recebê-las

#### Scenario: Conexão única com janelas abertas
- **WHEN** há painéis abertos em janelas
- **THEN** o servidor continua registrando uma única conexão vinda da aplicação

#### Scenario: Queda da conexão com a janela aberta
- **WHEN** a conexão cai e a janela de um painel já tem dados
- **THEN** a janela continua mostrando os últimos valores com o aviso de dados desatualizados

### Requirement: Ativo selecionado independente em cada janela
Cada janela de painel SHALL manter o próprio ativo selecionado, começando pelo primeiro ativo da lista recebida do servidor, e a seleção em uma janela MUST NOT alterar o ativo selecionado da página principal nem o de outras janelas.

#### Scenario: Janela de book recém-aberta
- **WHEN** a página principal está em `BETA4` e o painel de book é aberto em uma janela
- **THEN** a janela mostra o book do primeiro ativo da lista recebida do servidor

#### Scenario: Selecionar um ativo na janela de cotações
- **WHEN** o painel de cotações está em uma janela e o usuário seleciona `BETA4` nela
- **THEN** a linha de `BETA4` fica destacada na janela e o ativo selecionado da página principal não muda

### Requirement: Abertura bloqueada pelo navegador
Quando a janela não iniciar em até 5 segundos, o painel SHALL continuar na página principal e a página MUST informar que a janela não abriu.

#### Scenario: Pop-up bloqueado
- **WHEN** o usuário aciona o controle de abrir em janela e o navegador bloqueia a nova janela
- **THEN** o painel continua na página principal e, após 5 segundos, é exibido um aviso de que a janela não abriu

#### Scenario: Janela que inicia depois do prazo
- **WHEN** existe o aviso de que a janela não abriu e a janela termina de iniciar
- **THEN** o aviso deixa de ser exibido e o painel sai da página principal

#### Scenario: Nova tentativa bem-sucedida
- **WHEN** existe o aviso de janela bloqueada e o usuário abre um painel em janela com sucesso
- **THEN** o aviso deixa de ser exibido

### Requirement: Isolamento entre as janelas
Cada janela de painel SHALL rodar de forma isolada da página principal e das demais janelas, de modo que uma janela ocupada MUST NOT atrasar as outras.

#### Scenario: Janela ocupada
- **WHEN** a janela de um painel fica ocupada processando
- **THEN** a página principal e as demais janelas continuam atualizando normalmente

### Requirement: Navegador sem os recursos de janela
Em um navegador ou contexto sem os recursos necessários ao acompanhamento das janelas, a página principal MUST NOT oferecer o controle de abrir em janela e SHALL continuar exibindo os painéis.

#### Scenario: Página fora de contexto seguro
- **WHEN** a aplicação é aberta em um contexto sem Web Locks
- **THEN** os painéis são exibidos sem o controle de abrir em janela

### Requirement: Endereço de janela inválido
Um endereço de janela que não corresponda a nenhum painel SHALL levar à página principal.

#### Scenario: Painel inexistente
- **WHEN** o usuário acessa o endereço de janela de um painel que não existe
- **THEN** a aplicação exibe a página principal
