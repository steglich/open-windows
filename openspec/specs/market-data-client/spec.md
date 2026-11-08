# market-data-client Specification

## Purpose

Define como o frontend se conecta ao WebSocket do servidor, assina os canais, mantém os dados em tempo real e se comporta diante de erros e de quedas da conexão.

## Requirements

### Requirement: Conexão única compartilhada
A aplicação SHALL manter no máximo uma conexão WebSocket aberta com o servidor, compartilhada por todos os componentes da tela e por todas as abas da mesma origem no mesmo navegador.

#### Scenario: Vários componentes na tela
- **WHEN** a aplicação é aberta e todos os componentes de dados são exibidos
- **THEN** o servidor registra uma única conexão vinda dessa aplicação

#### Scenario: Várias abas abertas
- **WHEN** a aplicação é aberta em uma segunda aba da mesma origem com a primeira ainda aberta
- **THEN** o servidor continua registrando uma única conexão

### Requirement: Início automático da conexão
A aplicação SHALL iniciar a conexão com o servidor ao ser aberta, sem bloquear a exibição da página.

#### Scenario: Servidor disponível
- **WHEN** a aplicação é aberta com o servidor em execução
- **THEN** a conexão é estabelecida sem nenhuma ação do usuário

#### Scenario: Servidor desligado
- **WHEN** a aplicação é aberta com o servidor desligado
- **THEN** a página é exibida normalmente e a aplicação continua tentando conectar em segundo plano

### Requirement: Assinatura após as boas-vindas
Ao receber `welcome`, a aplicação SHALL assinar, entre os dados em uso no documento, o canal `quote` para todos os ativos ou somente para o ativo selecionado, os canais `positions` e `account` e os canais `book` e `candle` somente para o ativo selecionado.

#### Scenario: Primeira conexão
- **WHEN** a aplicação recebe `welcome` com a lista de ativos e todos os painéis estão em uso
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

### Requirement: Troca do ativo selecionado
Ao trocar o ativo selecionado, a aplicação SHALL cancelar as assinaturas em uso do ativo anterior nos canais `book` e `candle`, assinar as do novo ativo e MUST descartar mensagens `book` e `candle` de qualquer ativo que não seja o selecionado.

#### Scenario: Usuário seleciona outro ativo
- **WHEN** o ativo selecionado muda de `ALFA3` para `BETA4` com book e gráfico em uso
- **THEN** a aplicação envia `unsubscribe` de `book` e `candle` de `ALFA3` e `subscribe` de `book` e `candle` de `BETA4`, e o book exibido fica vazio até chegar o de `BETA4`

#### Scenario: Mensagem atrasada do ativo anterior
- **WHEN** chega uma mensagem `book` de `ALFA3` depois que `BETA4` foi selecionado
- **THEN** a mensagem é descartada e o estado do book não muda

#### Scenario: Candle atrasado do ativo anterior
- **WHEN** chega uma mensagem `candle` de `ALFA3` depois que `BETA4` foi selecionado
- **THEN** a mensagem é descartada e os candles de `BETA4` não são afetados

#### Scenario: Troca de ativo sem book nem gráfico
- **WHEN** o ativo selecionado muda em um documento que usa somente as cotações de todos os ativos
- **THEN** nenhuma assinatura é enviada ou cancelada

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

### Requirement: Consulta dos candles do ativo selecionado
Enquanto o gráfico estiver em uso, a aplicação SHALL consultar os 120 candles mais recentes do ativo selecionado a cada `welcome`, quando o gráfico passar a ser usado e sempre que o ativo selecionado mudar com a conexão `connected`, usando um `requestId` novo em cada consulta.

#### Scenario: Conexão estabelecida
- **WHEN** a aplicação recebe `welcome`, o gráfico está em uso e `ALFA3` é o ativo selecionado
- **THEN** ela envia `getCandles` de `ALFA3` com `limit` igual a `120`

#### Scenario: Troca de ativo
- **WHEN** o ativo selecionado muda de `ALFA3` para `BETA4` com a conexão `connected` e o gráfico em uso
- **THEN** a aplicação descarta os candles de `ALFA3` e envia `getCandles` de `BETA4`

#### Scenario: Troca de ativo sem conexão
- **WHEN** o ativo selecionado muda enquanto a conexão não está `connected`
- **THEN** nenhuma consulta é enviada, e os candles do novo ativo são consultados no próximo `welcome`

#### Scenario: Gráfico fora de uso
- **WHEN** a aplicação recebe `welcome` em um documento que não exibe o gráfico
- **THEN** nenhuma consulta `getCandles` é enviada

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
### Requirement: Conexão fora da thread principal
A aplicação SHALL manter o WebSocket, a validação e o roteamento dos frames recebidos e os timers de reconexão e de silêncio em um SharedWorker, e MUST NOT abrir um WebSocket com o servidor na thread principal da página.

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
- **THEN** ela passa a `connected` sem abrir outra conexão, assina os dados que usa e recebe o estado inicial deles

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

### Requirement: Assinatura somente do que está em uso
Cada documento da aplicação SHALL assinar somente os dados dos painéis que está exibindo, e MUST cancelar uma assinatura quando nenhum painel exibido nele precisar mais dela.

#### Scenario: Painel de carteira aberto em janela
- **WHEN** o painel de carteira é aberto em uma janela
- **THEN** a página principal cancela `positions` e a janela assina somente `positions`

#### Scenario: Painel de carteira volta à página
- **WHEN** a janela do painel de carteira é fechada
- **THEN** a página principal volta a assinar `positions`

#### Scenario: Janela do status da conexão
- **WHEN** o painel de status é aberto em uma janela
- **THEN** a janela não assina nenhum canal e continua mostrando o estado da conexão

#### Scenario: Gráfico sem o painel de cotações
- **WHEN** um documento exibe o gráfico e não exibe o painel de cotações
- **THEN** ele assina `quote` e `candle` somente do ativo selecionado

#### Scenario: Cotações sem o gráfico
- **WHEN** um documento exibe o painel de cotações e não exibe book nem gráfico
- **THEN** ele assina `quote` de todos os ativos e não assina `book` nem `candle`

### Requirement: Liberação de abas encerradas sem aviso
A aplicação SHALL tratar como encerrada a aba cujo documento deixar de existir, mesmo sem aviso dela, liberando as assinaturas e a conexão como em um encerramento normal.

#### Scenario: Aba trava com assinaturas exclusivas
- **WHEN** o processo da única aba assinante de `positions` trava com outra aba aberta
- **THEN** o `unsubscribe` de `positions` é enviado ao servidor

#### Scenario: Última aba trava
- **WHEN** o processo da única aba aberta trava
- **THEN** o socket é fechado e nenhuma nova conexão é aberta

### Requirement: Descarte dos dados sem uso
Ao deixar de usar um dado, o documento SHALL descartá-lo e MUST ignorar as mensagens dele que ainda chegarem, para não exibir valores antigos quando voltar a usá-lo.

#### Scenario: Mensagem atrasada depois do cancelamento
- **WHEN** a página principal cancelou `positions` e ainda chega uma mensagem `positions`
- **THEN** a mensagem é ignorada e nenhuma carteira fica guardada

#### Scenario: Dado volta a ser usado
- **WHEN** um painel volta a ser exibido
- **THEN** ele indica que aguarda dados até chegar o estado inicial enviado pelo servidor

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
