# Spec Delta

## ADDED Requirements

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

## MODIFIED Requirements

### Requirement: Assinatura após as boas-vindas
Ao receber `welcome`, a aplicação SHALL assinar, entre os dados em uso no documento, o canal `quote` para todos os ativos ou somente para o ativo selecionado, os canais `positions` e `account` e os canais `book` e `candle` somente para o ativo selecionado.

#### Scenario: Primeira conexão
- **WHEN** a aplicação recebe `welcome` com a lista de ativos e todos os painéis estão em uso
- **THEN** ela envia as assinaturas de `quote`, de `positions`, de `account` e de `book` e `candle` do ativo selecionado, e não assina `book` nem `candle` dos demais ativos

#### Scenario: Ativo selecionado por padrão
- **WHEN** a aplicação recebe o primeiro `welcome` e nenhum ativo foi selecionado
- **THEN** o primeiro ativo da lista recebida passa a ser o ativo selecionado

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

### Requirement: Entrada de aba com a conexão ativa
Uma aba que passar a usar uma conexão já `connected` SHALL receber o estado atual e o último `welcome`, seguindo o mesmo fluxo de assinatura de uma nova conexão, e MUST receber o estado inicial do que assinar.

#### Scenario: Segunda aba aberta
- **WHEN** uma aba é aberta com a conexão já `connected`
- **THEN** ela passa a `connected` sem abrir outra conexão, assina os dados que usa e recebe o estado inicial deles
