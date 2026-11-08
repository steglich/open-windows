# Spec Delta

## MODIFIED Requirements

### Requirement: Conexão única compartilhada
A aplicação SHALL manter no máximo uma conexão WebSocket aberta com o servidor, compartilhada por todos os componentes da tela e por todas as abas da mesma origem no mesmo navegador.

#### Scenario: Vários componentes na tela
- **WHEN** a aplicação é aberta e todos os componentes de dados são exibidos
- **THEN** o servidor registra uma única conexão vinda dessa aplicação

#### Scenario: Várias abas abertas
- **WHEN** a aplicação é aberta em uma segunda aba da mesma origem com a primeira ainda aberta
- **THEN** o servidor continua registrando uma única conexão

### Requirement: Estados da conexão
A aplicação SHALL expor o estado atual da conexão como `connecting`, `connected`, `reconnecting`, `closed` ou `unavailable`, e MUST considerar `connected` somente depois de receber `welcome`.

#### Scenario: Socket aberto sem boas-vindas
- **WHEN** o socket abre e o `welcome` ainda não chegou
- **THEN** o estado continua `connecting`

#### Scenario: Boas-vindas recebidas
- **WHEN** a aplicação recebe `welcome`
- **THEN** o estado passa a `connected`

#### Scenario: Queda da conexão
- **WHEN** a conexão é encerrada sem que a aplicação tenha pedido
- **THEN** o estado passa a `reconnecting`

### Requirement: Encerramento limpo
Ao ser encerrada, uma aba SHALL deixar de receber mensagens e MUST passar ao estado `closed`. Quando nenhuma outra aba estiver usando a conexão, a aplicação SHALL fechar o socket, cancelar as esperas e verificações pendentes e MUST NOT tentar reconectar.

#### Scenario: Aplicação destruída com conexão aberta
- **WHEN** a aplicação é encerrada com a conexão `connected` e nenhuma outra aba aberta
- **THEN** o socket é fechado, o estado passa a `closed` e nenhuma nova conexão é aberta

#### Scenario: Aplicação destruída durante a espera
- **WHEN** a aplicação é encerrada enquanto aguarda a próxima tentativa de reconexão e nenhuma outra aba está aberta
- **THEN** a tentativa é cancelada e nenhuma nova conexão é aberta

#### Scenario: Outra aba continua aberta
- **WHEN** uma aba é encerrada enquanto outra aba usa a conexão
- **THEN** o socket continua aberto e a outra aba segue recebendo dados sem interrupção

## ADDED Requirements

### Requirement: Conexão fora da thread principal
A aplicação SHALL manter o WebSocket, o tratamento dos frames recebidos e os timers de reconexão e de silêncio em um SharedWorker, e MUST NOT abrir um WebSocket com o servidor na thread principal da página.

#### Scenario: Aplicação em execução
- **WHEN** a aplicação é aberta em um navegador com suporte a SharedWorker
- **THEN** a conexão com o servidor é aberta pelo SharedWorker e nenhum WebSocket é criado pela página

#### Scenario: Aba em segundo plano
- **WHEN** a única aba aberta fica em segundo plano e o servidor para de responder
- **THEN** a conexão silenciosa é detectada e a reconexão é iniciada nos mesmos prazos de uma aba em primeiro plano

### Requirement: Navegador sem suporte a SharedWorker
Quando o navegador não oferecer SharedWorker ou o worker não puder ser carregado, a aplicação SHALL passar ao estado `unavailable`, MUST continuar exibindo a página e MUST NOT tentar outra forma de conexão.

#### Scenario: Recurso inexistente
- **WHEN** a aplicação é aberta em um navegador sem SharedWorker
- **THEN** o estado passa a `unavailable`, a página é exibida e nenhuma conexão é aberta

#### Scenario: Falha ao carregar o worker
- **WHEN** o script do worker não pode ser carregado
- **THEN** o estado passa a `unavailable`

### Requirement: Entrada de aba com a conexão ativa
Uma aba que passar a usar uma conexão já `connected` SHALL receber o estado atual e o último `welcome`, seguindo o mesmo fluxo de assinatura de uma nova conexão, e MUST receber o estado inicial do que assinar.

#### Scenario: Segunda aba aberta
- **WHEN** uma aba é aberta com a conexão já `connected`
- **THEN** ela passa a `connected` sem abrir outra conexão, assina os canais e recebe o estado inicial de cotações, book, candles, carteira e saldo

### Requirement: Estado da conexão igual entre as abas
Todas as abas conectadas SHALL observar as mudanças de estado da conexão, e cada `welcome` recebido do servidor MUST ser entregue a todas elas.

#### Scenario: Queda com duas abas abertas
- **WHEN** a conexão cai com duas abas abertas
- **THEN** as duas abas passam a `reconnecting`

#### Scenario: Reconexão com duas abas abertas
- **WHEN** a conexão é restabelecida com duas abas abertas
- **THEN** as duas abas recebem `welcome` e refazem as próprias assinaturas

### Requirement: Ativo selecionado independente por aba
Cada aba SHALL manter o próprio ativo selecionado, e a troca de ativo em uma aba MUST NOT alterar o ativo selecionado nem os dados das demais.

#### Scenario: Troca de ativo em uma aba
- **WHEN** a primeira aba está em `ALFA3`, a segunda em `BETA4`, e a primeira muda para `GAMA3`
- **THEN** a segunda aba continua em `BETA4` e continua recebendo o book e os candles de `BETA4`

### Requirement: Entrega somente do que a aba assinou
A aplicação SHALL entregar a cada aba somente as mensagens dos canais e ativos que ela assinou.

#### Scenario: Book de outro ativo
- **WHEN** chega do servidor uma mensagem `book` de `BETA4` e somente a segunda aba assinou `BETA4`
- **THEN** a mensagem é entregue apenas à segunda aba

#### Scenario: Mesmo ativo em duas abas
- **WHEN** duas abas assinaram o `book` de `ALFA3` e chega uma mensagem `book` de `ALFA3`
- **THEN** a mensagem é entregue às duas abas

### Requirement: Cancelamento de assinatura compartilhada
A aplicação SHALL pedir ao servidor o cancelamento de uma assinatura somente quando nenhuma outra aba precisar dela.

#### Scenario: Ativo usado por outra aba
- **WHEN** duas abas assinaram o `book` de `ALFA3` e uma delas cancela essa assinatura
- **THEN** nenhum `unsubscribe` é enviado ao servidor e a outra aba continua recebendo o `book` de `ALFA3`

#### Scenario: Última aba cancela
- **WHEN** a única aba que assinou o `book` de `ALFA3` cancela essa assinatura
- **THEN** o `unsubscribe` do `book` de `ALFA3` é enviado ao servidor

#### Scenario: Aba encerrada com assinaturas exclusivas
- **WHEN** uma aba é encerrada e era a única assinante do `book` de `BETA4`
- **THEN** o `unsubscribe` do `book` de `BETA4` é enviado ao servidor

### Requirement: Respostas entregues à aba que consultou
Uma resposta ou um erro com `requestId` SHALL ser entregue somente à aba que fez a consulta, com o `requestId` original dela, mesmo que outra aba tenha usado o mesmo valor.

#### Scenario: Consultas simultâneas com o mesmo requestId
- **WHEN** duas abas enviam `getCandles` com `requestId` igual a `candles-1`, para ativos diferentes
- **THEN** cada aba recebe somente a resposta do próprio ativo, com `requestId` igual a `candles-1`

### Requirement: Erros sem requestId
Uma mensagem `error` sem `requestId` SHALL ser entregue a todas as abas conectadas.

#### Scenario: Erro geral do servidor
- **WHEN** o servidor envia uma mensagem `error` sem `requestId` com duas abas abertas
- **THEN** o código e o texto do erro ficam disponíveis nas duas abas
