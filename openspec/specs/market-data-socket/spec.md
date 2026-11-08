# market-data-socket Specification

## Purpose

Define o contrato da conexão WebSocket do servidor simulado: como os clientes se conectam, assinam canais e recebem mensagens e erros.

## Requirements

### Requirement: Conexões WebSocket
O servidor SHALL aceitar várias conexões WebSocket simultâneas na porta definida pela variável `PORT`, usando `8090` quando ela não estiver definida.

#### Scenario: Porta padrão
- **WHEN** o servidor é iniciado sem a variável `PORT` e um cliente se conecta à porta `8090`
- **THEN** a conexão é estabelecida

#### Scenario: Porta configurada
- **WHEN** o servidor é iniciado com `PORT=9090` e um cliente se conecta à porta `9090`
- **THEN** a conexão é estabelecida

### Requirement: Execução sem dependências externas
O servidor SHALL gerar todos os dados em memória, sem banco de dados nem serviço externo.

#### Scenario: Ambiente isolado
- **WHEN** o servidor é iniciado em uma máquina sem banco de dados nem acesso à internet
- **THEN** ele aceita conexões e publica dados normalmente

### Requirement: Formato das mensagens
Toda mensagem nos dois sentidos MUST ser um objeto JSON em um frame de texto, com um campo `type` do tipo string.

#### Scenario: Mensagem do servidor
- **WHEN** o cliente recebe qualquer mensagem do servidor
- **THEN** o conteúdo é um objeto JSON válido com o campo `type`

### Requirement: Mensagem de boas-vindas
Ao aceitar uma conexão, o servidor SHALL enviar uma mensagem `welcome` com os campos `channels`, contendo `quote`, `book`, `candle`, `positions` e `account`, e `symbols`, contendo os ativos disponíveis.

#### Scenario: Nova conexão
- **WHEN** um cliente se conecta
- **THEN** a primeira mensagem recebida tem `type` igual a `welcome` e lista os canais e os ativos disponíveis

### Requirement: Envio somente após assinatura
O servidor MUST enviar a um cliente dados de um canal somente depois que esse cliente assinar o canal.

#### Scenario: Cliente sem assinaturas
- **WHEN** um cliente permanece conectado sem assinar nenhum canal
- **THEN** ele não recebe mensagens `quotes`, `book`, `positions` ou `account`

### Requirement: Assinatura de canais
O servidor SHALL aceitar mensagens `{"type":"subscribe","channel":<canal>,"symbols":[...]}`. Nos canais `quote`, `book` e `candle`, a ausência de `symbols` MUST assinar todos os ativos, e assinaturas sucessivas MUST se acumular. Nos canais `positions` e `account`, `symbols` MUST ser ignorado.

#### Scenario: Assinatura de ativos específicos
- **WHEN** um cliente assina o canal `quote` com `symbols` igual a `["PETR4"]`
- **THEN** ele recebe uma mensagem `subscribed` com `channel` e `symbols` e passa a receber nas mensagens `quotes` apenas `PETR4`

#### Scenario: Assinatura de todos os ativos
- **WHEN** um cliente assina o canal `book` sem informar `symbols`
- **THEN** ele passa a receber mensagens `book` de todos os ativos disponíveis

#### Scenario: Assinaturas acumuladas
- **WHEN** um cliente assina o canal `quote` para `PETR4` e depois para `VALE3`
- **THEN** ele passa a receber nas mensagens `quotes` os dois ativos

#### Scenario: Assinatura do canal de candle
- **WHEN** um cliente assina o canal `candle` com `symbols` igual a `["PETR4"]`
- **THEN** ele recebe uma mensagem `subscribed` e passa a receber mensagens `candle` apenas de `PETR4`

### Requirement: Estado inicial na assinatura
Logo após confirmar uma assinatura, o servidor SHALL enviar o estado atual de cada item assinado, sem esperar a próxima publicação. No canal `quote`, MUST enviar uma única mensagem `quotes` com todos os ativos da assinatura. No canal `candle`, MUST enviar uma mensagem `candle` por ativo assinado.

#### Scenario: Primeira cotação imediata
- **WHEN** um cliente assina o canal `quote` para `PETR4`
- **THEN** a mensagem seguinte à confirmação `subscribed` é uma mensagem `quotes` com a cotação atual de `PETR4`

#### Scenario: Primeiro candle imediato
- **WHEN** um cliente assina o canal `candle` para `PETR4`
- **THEN** a mensagem seguinte à confirmação `subscribed` é uma mensagem `candle` com o candle em andamento de `PETR4`

### Requirement: Cancelamento de assinatura
O servidor SHALL aceitar mensagens `{"type":"unsubscribe","channel":<canal>,"symbols":[...]}`, confirmar com uma mensagem `unsubscribed` e parar de enviar os itens cancelados. A ausência de `symbols` MUST cancelar todo o canal.

#### Scenario: Cancelar um ativo
- **WHEN** um cliente assinado em `PETR4` e `VALE3` cancela a assinatura de `PETR4`
- **THEN** ele recebe `unsubscribed` e continua recebendo apenas dados de `VALE3`

#### Scenario: Cancelar o canal inteiro
- **WHEN** um cliente cancela o canal `positions`
- **THEN** ele recebe `unsubscribed` e deixa de receber mensagens `positions`

### Requirement: Mensagens inválidas
Diante de uma mensagem inválida, o servidor SHALL responder com `{"type":"error","code":<código>,"message":<texto>}`, MUST manter a conexão aberta e MUST não alterar as assinaturas existentes.

#### Scenario: JSON malformado
- **WHEN** um cliente envia um texto que não é JSON válido ou um `type` desconhecido
- **THEN** ele recebe uma mensagem `error` com `code` igual a `INVALID_MESSAGE` e continua conectado

#### Scenario: Canal desconhecido
- **WHEN** um cliente assina um canal que não existe
- **THEN** ele recebe uma mensagem `error` com `code` igual a `UNKNOWN_CHANNEL`

#### Scenario: Ativo desconhecido
- **WHEN** um cliente assina uma lista com ao menos um ativo que não existe
- **THEN** ele recebe uma mensagem `error` com `code` igual a `UNKNOWN_SYMBOL` e nenhum ativo da lista é assinado

### Requirement: Isolamento entre clientes
As assinaturas SHALL ser independentes por conexão, e o encerramento de uma conexão MUST não afetar as demais.

#### Scenario: Cliente desconecta
- **WHEN** dois clientes estão assinados no mesmo canal e um deles desconecta
- **THEN** o outro continua recebendo mensagens normalmente

### Requirement: Requisições com correlação
O servidor SHALL aceitar as mensagens `getCandles` e `getOrders`, que MUST ter `requestId` do tipo string e não vazio, e MUST devolver esse valor na resposta correspondente, inclusive em mensagens `error`.

#### Scenario: Resposta correlacionada
- **WHEN** um cliente envia `getOrders` com `requestId` igual a `abc`
- **THEN** a resposta tem `requestId` igual a `abc`

#### Scenario: Requisição sem identificador
- **WHEN** um cliente envia `getOrders` sem `requestId`
- **THEN** ele recebe `error` com `code` igual a `INVALID_MESSAGE` e continua conectado

### Requirement: Envio de ordens indisponível
O servidor MUST tratar qualquer mensagem de envio de ordem como `type` desconhecido, pois a simulação não aceita entrada de ordens.

#### Scenario: Tentativa de enviar ordem
- **WHEN** um cliente envia uma mensagem com `type` igual a `placeOrder`
- **THEN** ele recebe `error` com `code` igual a `INVALID_MESSAGE` e nenhum dado da conta muda

### Requirement: Proteção contra cliente lento
Enquanto os dados ainda não entregues a uma conexão excederem o limite do servidor, ele MUST deixar de enviar a ela mensagens contínuas de `quote`, `book` e `candle`, sem acumular as omitidas. Mensagens de `positions`, `account`, confirmações e respostas a consultas MUST continuar sendo enviadas.

#### Scenario: Cliente que não consome as mensagens
- **WHEN** um cliente assinado em todos os canais deixa de ler a conexão
- **THEN** a memória retida pelo servidor para essa conexão não cresce além do limite e os demais clientes continuam recebendo mensagens na taxa definida

#### Scenario: Cliente volta a consumir
- **WHEN** um cliente que estava atrasado esvazia a fila de dados não entregues
- **THEN** o servidor retoma o envio com o estado mais recente, sem reenviar as mensagens omitidas
