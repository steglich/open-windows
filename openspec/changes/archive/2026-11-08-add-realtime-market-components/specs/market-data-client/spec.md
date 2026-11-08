# Spec Delta

## Purpose

Define como o frontend se conecta ao WebSocket do servidor, assina os canais, mantém os dados em tempo real e se comporta diante de erros e de quedas da conexão.

## ADDED Requirements

### Requirement: Conexão única compartilhada
A aplicação SHALL manter no máximo uma conexão WebSocket aberta com o servidor, compartilhada por todos os componentes da tela.

#### Scenario: Vários componentes na tela
- **WHEN** a aplicação é aberta e todos os componentes de dados são exibidos
- **THEN** o servidor registra uma única conexão vinda dessa aplicação

### Requirement: Início automático da conexão
A aplicação SHALL iniciar a conexão com o servidor ao ser aberta, sem bloquear a exibição da página.

#### Scenario: Servidor disponível
- **WHEN** a aplicação é aberta com o servidor em execução
- **THEN** a conexão é estabelecida sem nenhuma ação do usuário

#### Scenario: Servidor desligado
- **WHEN** a aplicação é aberta com o servidor desligado
- **THEN** a página é exibida normalmente e a aplicação continua tentando conectar em segundo plano

### Requirement: Assinatura após as boas-vindas
Ao receber `welcome`, a aplicação SHALL assinar o canal `quote` para todos os ativos, o canal `positions` e o canal `book` somente para o ativo selecionado.

#### Scenario: Primeira conexão
- **WHEN** a aplicação recebe `welcome` com a lista de ativos
- **THEN** ela envia as assinaturas de `quote`, de `positions` e de `book` do ativo selecionado, e não assina `book` dos demais ativos

#### Scenario: Ativo selecionado por padrão
- **WHEN** a aplicação recebe o primeiro `welcome` e nenhum ativo foi selecionado
- **THEN** o primeiro ativo da lista recebida passa a ser o ativo selecionado

### Requirement: Restauração das assinaturas ao reconectar
A cada nova conexão, a aplicação SHALL refazer as assinaturas, pois elas não persistem entre conexões no servidor, e MUST manter o ativo selecionado quando ele ainda existir.

#### Scenario: Reconexão mantendo o ativo
- **WHEN** a conexão é restabelecida e o ativo selecionado está na lista do novo `welcome`
- **THEN** a aplicação assina novamente os canais e o `book` continua sendo o desse ativo

#### Scenario: Ativo deixou de existir
- **WHEN** a conexão é restabelecida e o ativo selecionado não está na lista do novo `welcome`
- **THEN** o primeiro ativo da lista passa a ser o ativo selecionado

### Requirement: Atualização do estado em tempo real
A cada mensagem `quote`, `book` ou `positions`, a aplicação SHALL substituir o valor anterior do mesmo item pelo valor recebido e refletir a mudança na tela sem recarregar a página.

#### Scenario: Nova cotação
- **WHEN** a aplicação recebe uma mensagem `quote` de `ALFA3`
- **THEN** a cotação de `ALFA3` é substituída e as cotações dos demais ativos permanecem iguais

#### Scenario: Nova carteira
- **WHEN** a aplicação recebe uma mensagem `positions`
- **THEN** a carteira inteira é substituída pela recebida

### Requirement: Troca do ativo selecionado
Ao trocar o ativo selecionado, a aplicação SHALL cancelar a assinatura de `book` do ativo anterior, assinar a do novo ativo e MUST descartar mensagens `book` de qualquer ativo que não seja o selecionado.

#### Scenario: Usuário seleciona outro ativo
- **WHEN** o ativo selecionado muda de `ALFA3` para `BETA4`
- **THEN** a aplicação envia `unsubscribe` de `ALFA3` e `subscribe` de `BETA4`, e o book exibido fica vazio até chegar o de `BETA4`

#### Scenario: Mensagem atrasada do ativo anterior
- **WHEN** chega uma mensagem `book` de `ALFA3` depois que `BETA4` foi selecionado
- **THEN** a mensagem é descartada e o estado do book não muda

### Requirement: Estados da conexão
A aplicação SHALL expor o estado atual da conexão como `connecting`, `connected`, `reconnecting` ou `closed`, e MUST considerar `connected` somente depois de receber `welcome`.

#### Scenario: Socket aberto sem boas-vindas
- **WHEN** o socket abre e o `welcome` ainda não chegou
- **THEN** o estado continua `connecting`

#### Scenario: Boas-vindas recebidas
- **WHEN** a aplicação recebe `welcome`
- **THEN** o estado passa a `connected`

#### Scenario: Queda da conexão
- **WHEN** a conexão é encerrada sem que a aplicação tenha pedido
- **THEN** o estado passa a `reconnecting`

### Requirement: Reconexão automática com espera crescente
Após uma queda ou falha ao conectar, a aplicação SHALL tentar reconectar indefinidamente, esperando 1 segundo antes da primeira tentativa e dobrando a espera até o limite de 30 segundos. A contagem MUST recomeçar após um `welcome`.

#### Scenario: Tentativas sucessivas
- **WHEN** as tentativas de conexão falham em sequência
- **THEN** as esperas entre elas são de 1, 2, 4, 8, 16, 30, 30 segundos e assim por diante

#### Scenario: Reconexão bem-sucedida
- **WHEN** uma tentativa recebe `welcome` e a conexão volta a cair depois
- **THEN** a próxima espera volta a ser de 1 segundo

### Requirement: Detecção de conexão silenciosa
Com a conexão no estado `connected`, a aplicação SHALL tratar como queda a ausência de qualquer mensagem do servidor por 5 segundos, descartando o socket atual e iniciando a reconexão.

#### Scenario: Servidor para de responder sem fechar o socket
- **WHEN** a conexão está `connected` e nenhuma mensagem chega por 5 segundos
- **THEN** o estado passa a `reconnecting` e uma nova conexão é tentada

#### Scenario: Fluxo normal de dados
- **WHEN** as mensagens continuam chegando dentro do intervalo de 5 segundos
- **THEN** a conexão é mantida

### Requirement: Preservação dos dados durante a queda
Enquanto a conexão não estiver `connected`, a aplicação SHALL manter os últimos dados recebidos e MUST indicá-los como desatualizados até que novos dados cheguem.

#### Scenario: Conexão cai com dados na tela
- **WHEN** a conexão cai depois de a aplicação já ter recebido dados
- **THEN** os últimos valores continuam disponíveis e marcados como desatualizados

#### Scenario: Dados voltam após a reconexão
- **WHEN** a conexão é restabelecida e o estado passa a `connected`
- **THEN** os dados deixam de ser marcados como desatualizados e são substituídos pelo estado inicial enviado pelo servidor

### Requirement: Erros informados pelo servidor
Ao receber uma mensagem `error`, a aplicação SHALL expor o código e o texto recebidos, MUST manter a conexão aberta e MUST limpar o erro no próximo `welcome` ou `subscribed`.

#### Scenario: Erro de protocolo
- **WHEN** a aplicação recebe uma mensagem `error` com `code` igual a `UNKNOWN_SYMBOL`
- **THEN** o código e o texto ficam disponíveis para exibição, o estado continua `connected` e os dados continuam sendo atualizados

#### Scenario: Erro superado
- **WHEN** há um erro exposto e a aplicação recebe `subscribed`
- **THEN** o erro deixa de ser exposto

### Requirement: Mensagens inválidas vindas do servidor
A aplicação MUST ignorar frames que não sejam JSON válido ou cujo `type` seja desconhecido, sem alterar o estado e sem encerrar a conexão.

#### Scenario: Frame malformado
- **WHEN** a aplicação recebe um frame que não é JSON válido
- **THEN** o frame é ignorado, nenhuma exceção interrompe o processamento e as mensagens seguintes continuam sendo tratadas

### Requirement: Encerramento limpo
Ao ser encerrada, a aplicação SHALL fechar o socket, cancelar as esperas e verificações pendentes, MUST passar ao estado `closed` e MUST NOT tentar reconectar.

#### Scenario: Aplicação destruída com conexão aberta
- **WHEN** a aplicação é encerrada com a conexão `connected`
- **THEN** o socket é fechado, o estado passa a `closed` e nenhuma nova conexão é aberta

#### Scenario: Aplicação destruída durante a espera
- **WHEN** a aplicação é encerrada enquanto aguarda a próxima tentativa de reconexão
- **THEN** a tentativa é cancelada e nenhuma nova conexão é aberta
