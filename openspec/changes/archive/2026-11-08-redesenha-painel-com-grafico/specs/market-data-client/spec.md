# Spec Delta

## MODIFIED Requirements

### Requirement: Assinatura após as boas-vindas
Ao receber `welcome`, a aplicação SHALL assinar o canal `quote` para todos os ativos, os canais `positions` e `account` e o canal `book` somente para o ativo selecionado.

#### Scenario: Primeira conexão
- **WHEN** a aplicação recebe `welcome` com a lista de ativos
- **THEN** ela envia as assinaturas de `quote`, de `positions`, de `account` e de `book` do ativo selecionado, e não assina `book` dos demais ativos

#### Scenario: Ativo selecionado por padrão
- **WHEN** a aplicação recebe o primeiro `welcome` e nenhum ativo foi selecionado
- **THEN** o primeiro ativo da lista recebida passa a ser o ativo selecionado

### Requirement: Atualização do estado em tempo real
A cada mensagem `quotes`, `book`, `positions` ou `account`, a aplicação SHALL substituir o valor anterior dos mesmos itens pelos valores recebidos e refletir a mudança na tela sem recarregar a página. Uma mensagem `quotes` MUST ser aplicada ao estado em uma única atualização.

#### Scenario: Nova cotação
- **WHEN** a aplicação recebe uma mensagem `quotes` com a cotação de `PETR4`
- **THEN** a cotação de `PETR4` é substituída e as cotações dos ativos ausentes da mensagem permanecem iguais

#### Scenario: Nova carteira
- **WHEN** a aplicação recebe uma mensagem `positions`
- **THEN** a carteira inteira é substituída pela recebida

#### Scenario: Novo saldo
- **WHEN** a aplicação recebe uma mensagem `account`
- **THEN** o saldo inteiro é substituído pelo recebido

## ADDED Requirements

### Requirement: Consulta dos candles do ativo selecionado
A aplicação SHALL consultar os 120 candles mais recentes do ativo selecionado a cada `welcome` e sempre que o ativo selecionado mudar com a conexão `connected`, usando um `requestId` novo em cada consulta.

#### Scenario: Conexão estabelecida
- **WHEN** a aplicação recebe `welcome` e `ALFA3` é o ativo selecionado
- **THEN** ela envia `getCandles` de `ALFA3` com `limit` igual a `120`

#### Scenario: Troca de ativo
- **WHEN** o ativo selecionado muda de `ALFA3` para `BETA4` com a conexão `connected`
- **THEN** a aplicação descarta os candles de `ALFA3` e envia `getCandles` de `BETA4`

#### Scenario: Troca de ativo sem conexão
- **WHEN** o ativo selecionado muda enquanto a conexão não está `connected`
- **THEN** nenhuma consulta é enviada, e os candles do novo ativo são consultados no próximo `welcome`

### Requirement: Correlação das respostas de candles
A aplicação SHALL aplicar somente a resposta `candles` cujo `requestId` seja o da consulta mais recente, e MUST descartar as demais.

#### Scenario: Resposta atrasada do ativo anterior
- **WHEN** chega a resposta de `ALFA3` depois que `BETA4` foi selecionado e consultado
- **THEN** a resposta é descartada e o estado dos candles não muda

#### Scenario: Resposta da consulta mais recente
- **WHEN** chega a resposta com o `requestId` da consulta mais recente
- **THEN** os candles recebidos substituem os anteriores

### Requirement: Candle em andamento atualizado pelas cotações
Quando chegar uma cotação do ativo selecionado no mesmo minuto do último candle, a aplicação SHALL definir o `close` desse candle como o `last` da cotação e ajustar `high` e `low` para incluí-lo.

#### Scenario: Cotação acima da máxima
- **WHEN** o último candle tem `high` igual a `33` e chega, no mesmo minuto, uma cotação com `last` igual a `33.5`
- **THEN** o último candle passa a ter `close` e `high` iguais a `33.5`, e os demais candles não mudam

#### Scenario: Cotação de outro ativo
- **WHEN** chega uma cotação de um ativo que não é o selecionado
- **THEN** os candles não mudam

### Requirement: Virada do minuto
Quando chegar uma cotação do ativo selecionado em um minuto posterior ao do último candle, a aplicação SHALL consultar novamente os candles, mantendo os atuais até a resposta, e MUST NOT enviar outra consulta enquanto uma estiver pendente.

#### Scenario: Novo minuto
- **WHEN** chega uma cotação do ativo selecionado com `updatedAt` em um minuto posterior ao `time` do último candle
- **THEN** a aplicação envia uma nova consulta `getCandles` e os candles atuais continuam disponíveis até a resposta

#### Scenario: Consulta já pendente
- **WHEN** chega outra cotação no novo minuto antes da resposta da consulta
- **THEN** nenhuma consulta adicional é enviada

### Requirement: Consulta pendente sem resposta
Uma consulta de candles MUST deixar de ser considerada pendente quando a conexão cair ou quando chegar uma mensagem `error` com o seu `requestId`.

#### Scenario: Erro na consulta
- **WHEN** chega uma mensagem `error` com o `requestId` da consulta pendente
- **THEN** o erro é exposto como os demais, e a próxima virada de minuto pode enviar uma nova consulta

#### Scenario: Queda durante a consulta
- **WHEN** a conexão cai com uma consulta pendente e depois é restabelecida
- **THEN** o novo `welcome` envia uma nova consulta e a resposta da anterior, se chegar, é descartada
