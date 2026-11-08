# market-data-client Specification

## Purpose

Define como o frontend se conecta ao WebSocket do servidor, assina os canais, mantém os dados em tempo real e se comporta diante de erros e de quedas da conexão.

## Requirements

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
Ao receber `welcome`, a aplicação SHALL assinar o canal `quote` para todos os ativos, os canais `positions` e `account` e os canais `book` e `candle` somente para o ativo selecionado.

#### Scenario: Primeira conexão
- **WHEN** a aplicação recebe `welcome` com a lista de ativos
- **THEN** ela envia as assinaturas de `quote`, de `positions`, de `account` e de `book` e `candle` do ativo selecionado, e não assina `book` nem `candle` dos demais ativos

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
A cada mensagem `quotes`, `book`, `candle`, `positions` ou `account`, a aplicação SHALL aplicar os valores recebidos ao estado assim que a mensagem chegar, substituindo o valor anterior dos mesmos itens e refletindo a mudança na tela sem recarregar a página. A aplicação MUST NOT agregar nem atrasar essas mensagens por tempo. Uma mensagem `quotes` MUST ser aplicada ao estado em uma única atualização.

#### Scenario: Nova cotação
- **WHEN** a aplicação recebe uma mensagem `quotes` com a cotação de `PETR4`
- **THEN** a cotação de `PETR4` é substituída e as cotações dos ativos ausentes da mensagem permanecem iguais

#### Scenario: Mensagens seguidas do mesmo ativo
- **WHEN** a aplicação recebe duas mensagens `book` de `PETR4` em sequência
- **THEN** cada uma substitui o book no estado no momento em que chega, sem espera entre elas

#### Scenario: Nova carteira
- **WHEN** a aplicação recebe uma mensagem `positions`
- **THEN** a carteira inteira é substituída pela recebida

#### Scenario: Novo saldo
- **WHEN** a aplicação recebe uma mensagem `account`
- **THEN** o saldo inteiro é substituído pelo recebido

### Requirement: Troca do ativo selecionado
Ao trocar o ativo selecionado, a aplicação SHALL cancelar as assinaturas de `book` e `candle` do ativo anterior, assinar as do novo ativo e MUST descartar mensagens `book` e `candle` de qualquer ativo que não seja o selecionado.

#### Scenario: Usuário seleciona outro ativo
- **WHEN** o ativo selecionado muda de `ALFA3` para `BETA4`
- **THEN** a aplicação envia `unsubscribe` de `book` e `candle` de `ALFA3` e `subscribe` de `book` e `candle` de `BETA4`, e o book exibido fica vazio até chegar o de `BETA4`

#### Scenario: Mensagem atrasada do ativo anterior
- **WHEN** chega uma mensagem `book` de `ALFA3` depois que `BETA4` foi selecionado
- **THEN** a mensagem é descartada e o estado do book não muda

#### Scenario: Candle atrasado do ativo anterior
- **WHEN** chega uma mensagem `candle` de `ALFA3` depois que `BETA4` foi selecionado
- **THEN** a mensagem é descartada e os candles de `BETA4` não são afetados

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

### Requirement: Virada do minuto
Quando chegar uma mensagem `candle` do ativo selecionado com `time` posterior ao do último candle, a aplicação SHALL consultar novamente os candles, mantendo os atuais até a resposta, e MUST NOT enviar outra consulta enquanto uma estiver pendente.

#### Scenario: Novo minuto
- **WHEN** chega uma mensagem `candle` do ativo selecionado com `time` posterior ao `time` do último candle
- **THEN** a aplicação envia uma nova consulta `getCandles` e os candles atuais continuam disponíveis até a resposta

#### Scenario: Consulta já pendente
- **WHEN** chega outra mensagem `candle` no novo minuto antes da resposta da consulta
- **THEN** nenhuma consulta adicional é enviada

### Requirement: Consulta pendente sem resposta
Uma consulta de candles MUST deixar de ser considerada pendente quando a conexão cair ou quando chegar uma mensagem `error` com o seu `requestId`.

#### Scenario: Erro na consulta
- **WHEN** chega uma mensagem `error` com o `requestId` da consulta pendente
- **THEN** o erro é exposto como os demais, e a próxima virada de minuto pode enviar uma nova consulta

#### Scenario: Queda durante a consulta
- **WHEN** a conexão cai com uma consulta pendente e depois é restabelecida
- **THEN** o novo `welcome` envia uma nova consulta e a resposta da anterior, se chegar, é descartada

### Requirement: Candle em andamento atualizado pelo canal
Quando chegar uma mensagem `candle` do ativo selecionado com o mesmo `time` do último candle, a aplicação SHALL substituir esse candle pelo recebido. Mensagens com `time` anterior ao do último candle MUST ser descartadas.

#### Scenario: Candle atualizado
- **WHEN** o último candle tem `high` igual a `33` e chega, no mesmo minuto, uma mensagem `candle` com `close` e `high` iguais a `33.5`
- **THEN** o último candle passa a ter `close` e `high` iguais a `33.5`, e os demais candles não mudam

#### Scenario: Candle de minuto anterior
- **WHEN** chega uma mensagem `candle` do ativo selecionado com `time` anterior ao do último candle
- **THEN** os candles não mudam
