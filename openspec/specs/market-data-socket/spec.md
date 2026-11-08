# market-data-socket Specification

## Purpose

Define o contrato da conexão WebSocket do servidor simulado: como os clientes se conectam, assinam canais e recebem mensagens e erros.

## Requirements

### Requirement: Conexões WebSocket
O servidor SHALL aceitar várias conexões WebSocket simultâneas na porta definida pela variável `PORT`, usando `8080` quando ela não estiver definida.

#### Scenario: Porta padrão
- **WHEN** o servidor é iniciado sem a variável `PORT` e um cliente se conecta à porta `8080`
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
Ao aceitar uma conexão, o servidor SHALL enviar uma mensagem `welcome` com os campos `channels`, contendo `quote`, `book` e `positions`, e `symbols`, contendo os ativos disponíveis.

#### Scenario: Nova conexão
- **WHEN** um cliente se conecta
- **THEN** a primeira mensagem recebida tem `type` igual a `welcome` e lista os canais e os ativos disponíveis

### Requirement: Envio somente após assinatura
O servidor MUST enviar a um cliente dados de um canal somente depois que esse cliente assinar o canal.

#### Scenario: Cliente sem assinaturas
- **WHEN** um cliente permanece conectado sem assinar nenhum canal
- **THEN** ele não recebe mensagens `quote`, `book` ou `positions`

### Requirement: Assinatura de canais
O servidor SHALL aceitar mensagens `{"type":"subscribe","channel":<canal>,"symbols":[...]}`. Nos canais `quote` e `book`, a ausência de `symbols` MUST assinar todos os ativos, e assinaturas sucessivas MUST se acumular. No canal `positions`, `symbols` MUST ser ignorado.

#### Scenario: Assinatura de ativos específicos
- **WHEN** um cliente assina o canal `quote` com `symbols` igual a `["ALFA3"]`
- **THEN** ele recebe uma mensagem `subscribed` com `channel` e `symbols` e passa a receber mensagens `quote` apenas de `ALFA3`

#### Scenario: Assinatura de todos os ativos
- **WHEN** um cliente assina o canal `book` sem informar `symbols`
- **THEN** ele passa a receber mensagens `book` de todos os ativos disponíveis

#### Scenario: Assinaturas acumuladas
- **WHEN** um cliente assina o canal `quote` para `ALFA3` e depois para `BETA4`
- **THEN** ele passa a receber mensagens `quote` dos dois ativos

### Requirement: Estado inicial na assinatura
Logo após confirmar uma assinatura, o servidor SHALL enviar o estado atual de cada item assinado, sem esperar o próximo ciclo de publicação.

#### Scenario: Primeira cotação imediata
- **WHEN** um cliente assina o canal `quote` para `ALFA3`
- **THEN** a mensagem seguinte à confirmação `subscribed` é a cotação atual de `ALFA3`

### Requirement: Cancelamento de assinatura
O servidor SHALL aceitar mensagens `{"type":"unsubscribe","channel":<canal>,"symbols":[...]}`, confirmar com uma mensagem `unsubscribed` e parar de enviar os itens cancelados. A ausência de `symbols` MUST cancelar todo o canal.

#### Scenario: Cancelar um ativo
- **WHEN** um cliente assinado em `ALFA3` e `BETA4` cancela a assinatura de `ALFA3`
- **THEN** ele recebe `unsubscribed` e continua recebendo apenas mensagens de `BETA4`

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
