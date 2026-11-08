# Spec Delta

## MODIFIED Requirements

### Requirement: Mensagem de boas-vindas
Ao aceitar uma conexão, o servidor SHALL enviar uma mensagem `welcome` com os campos `channels`, contendo `quote`, `book`, `candle`, `positions` e `account`, e `symbols`, contendo os ativos disponíveis.

#### Scenario: Nova conexão
- **WHEN** um cliente se conecta
- **THEN** a primeira mensagem recebida tem `type` igual a `welcome` e lista os canais e os ativos disponíveis

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

## ADDED Requirements

### Requirement: Proteção contra cliente lento
Enquanto os dados ainda não entregues a uma conexão excederem o limite do servidor, ele MUST deixar de enviar a ela mensagens contínuas de `quote`, `book` e `candle`, sem acumular as omitidas. Mensagens de `positions`, `account`, confirmações e respostas a consultas MUST continuar sendo enviadas.

#### Scenario: Cliente que não consome as mensagens
- **WHEN** um cliente assinado em todos os canais deixa de ler a conexão
- **THEN** a memória retida pelo servidor para essa conexão não cresce além do limite e os demais clientes continuam recebendo mensagens na taxa definida

#### Scenario: Cliente volta a consumir
- **WHEN** um cliente que estava atrasado esvazia a fila de dados não entregues
- **THEN** o servidor retoma o envio com o estado mais recente, sem reenviar as mensagens omitidas
