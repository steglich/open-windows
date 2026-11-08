# Spec Delta

## MODIFIED Requirements

### Requirement: Atualização do estado em tempo real
A aplicação SHALL aplicar ao estado as mensagens `quotes`, `book`, `candle`, `positions` e `account` no próximo quadro de renderização, substituindo o valor anterior dos mesmos itens e refletindo a mudança na tela sem recarregar a página. Entre dois quadros, SHALL considerar somente a mais recente de cada canal e ativo, exceto em `candle`. Com o documento visível, MUST NOT atrasá-las além do próximo quadro. Uma mensagem `quotes` MUST ser aplicada em uma única atualização.

#### Scenario: Nova cotação
- **WHEN** a aplicação recebe uma mensagem `quotes` com a cotação de `PETR4`
- **THEN** no próximo quadro a cotação de `PETR4` é substituída e as cotações dos ativos ausentes da mensagem permanecem iguais

#### Scenario: Cotações de ativos diferentes no mesmo quadro
- **WHEN** a aplicação recebe, antes do próximo quadro, uma mensagem `quotes` de `PETR4` e outra de `VALE3`
- **THEN** no próximo quadro as cotações dos dois ativos são substituídas

#### Scenario: Mensagens seguidas do mesmo ativo
- **WHEN** a aplicação recebe, antes do próximo quadro, duas mensagens `book` de `PETR4`
- **THEN** no próximo quadro o book passa a ser o da mensagem mais recente, e a anterior não é aplicada ao estado

#### Scenario: Mensagens em quadros diferentes
- **WHEN** a aplicação recebe uma mensagem `book` de `PETR4`, um quadro é renderizado e chega outra mensagem `book` de `PETR4`
- **THEN** cada mensagem é aplicada ao estado no quadro seguinte à sua chegada

#### Scenario: Nova carteira
- **WHEN** a aplicação recebe uma mensagem `positions`
- **THEN** no próximo quadro a carteira inteira é substituída pela recebida

#### Scenario: Novo saldo
- **WHEN** a aplicação recebe uma mensagem `account`
- **THEN** no próximo quadro o saldo inteiro é substituído pelo recebido

### Requirement: Conexão fora da thread principal
A aplicação SHALL manter o WebSocket, a validação e o roteamento dos frames recebidos e os timers de reconexão e de silêncio em um SharedWorker, e MUST NOT abrir um WebSocket com o servidor na thread principal da página.

#### Scenario: Aplicação em execução
- **WHEN** a aplicação é aberta em um navegador com suporte a SharedWorker
- **THEN** a conexão com o servidor é aberta pelo SharedWorker e nenhum WebSocket é criado pela página

#### Scenario: Aba em segundo plano
- **WHEN** a única aba aberta fica em segundo plano e o servidor para de responder
- **THEN** a conexão silenciosa é detectada e a reconexão é iniciada nos mesmos prazos de uma aba em primeiro plano

## ADDED Requirements

### Requirement: Entrega do frame original à aba
Depois de validar e rotear um frame `book`, `candle`, `positions`, `account` ou `quotes` de um único ativo, o SharedWorker SHALL entregar à aba o texto original recebido do servidor, sem reconstruí-lo.

#### Scenario: Book assinado
- **WHEN** chega do servidor um frame `book` de `ALFA3` e uma aba assinou o `book` de `ALFA3`
- **THEN** a aba recebe o texto original desse frame

#### Scenario: Frame inválido
- **WHEN** chega do servidor um frame que não é JSON válido
- **THEN** nenhum texto é entregue às abas

### Requirement: Candles sem perda de mensagens
A aplicação MUST aplicar ao estado todas as mensagens `candle` recebidas de um ativo assinado, na ordem de chegada, mesmo quando mais de uma chegar entre dois quadros.

#### Scenario: Vários candles no mesmo quadro
- **WHEN** a aplicação recebe, antes do próximo quadro, três mensagens `candle` de `PETR4`
- **THEN** no próximo quadro as três são aplicadas ao estado, na ordem em que chegaram

#### Scenario: Virada do minuto no mesmo quadro
- **WHEN** a aplicação recebe, antes do próximo quadro, uma mensagem `candle` do minuto atual e outra do minuto seguinte
- **THEN** o candle do minuto atual é atualizado e, em seguida, a aplicação envia a consulta de candles do novo minuto

### Requirement: Mensagens que não aguardam o quadro
As mensagens `welcome`, `subscribed`, `unsubscribed`, `error`, `candles`, `orders`, as `quotes` com mais de um ativo e as mudanças de estado da conexão SHALL ser aplicadas assim que chegarem, e as mensagens de dados recebidas antes delas MUST ser aplicadas primeiro.

#### Scenario: Queda com mensagens pendentes
- **WHEN** a conexão cai antes do próximo quadro e há uma mensagem `book` pendente
- **THEN** o `book` é aplicado ao estado e, em seguida, o estado da conexão passa a `reconnecting`

#### Scenario: Estado inicial das cotações
- **WHEN** a aplicação recebe o estado inicial de `quotes` com vários ativos
- **THEN** as cotações de todos os ativos são aplicadas, em uma única atualização, sem esperar o próximo quadro

### Requirement: Aplicação em documento oculto
Quando o documento não renderizar quadros, por estar oculto, a aplicação SHALL continuar aplicando as mensagens pendentes por um temporizador, e MUST NOT acumular mensagens `candle` indefinidamente.

#### Scenario: Aba em segundo plano recebendo dados
- **WHEN** o documento fica oculto e continuam chegando mensagens `book` e `candle`
- **THEN** as mensagens pendentes são aplicadas ao estado quando o temporizador disparar, sem esperar o documento voltar a ficar visível

### Requirement: Descarte das mensagens pendentes ao encerrar
Ao ser encerrada, uma aba MUST descartar as mensagens ainda não aplicadas e cancelar a aplicação agendada.

#### Scenario: Aba encerrada antes do próximo quadro
- **WHEN** a aba é encerrada com mensagens `book` e `candle` pendentes
- **THEN** nenhuma delas é aplicada ao estado depois do encerramento
