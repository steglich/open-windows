# Spec Delta

## MODIFIED Requirements

### Requirement: Assinatura após as boas-vindas
Ao receber `welcome`, a aplicação SHALL assinar o canal `quote` para todos os ativos, os canais `positions` e `account` e os canais `book` e `candle` somente para o ativo selecionado.

#### Scenario: Primeira conexão
- **WHEN** a aplicação recebe `welcome` com a lista de ativos
- **THEN** ela envia as assinaturas de `quote`, de `positions`, de `account` e de `book` e `candle` do ativo selecionado, e não assina `book` nem `candle` dos demais ativos

#### Scenario: Ativo selecionado por padrão
- **WHEN** a aplicação recebe o primeiro `welcome` e nenhum ativo foi selecionado
- **THEN** o primeiro ativo da lista recebida passa a ser o ativo selecionado

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

### Requirement: Virada do minuto
Quando chegar uma mensagem `candle` do ativo selecionado com `time` posterior ao do último candle, a aplicação SHALL consultar novamente os candles, mantendo os atuais até a resposta, e MUST NOT enviar outra consulta enquanto uma estiver pendente.

#### Scenario: Novo minuto
- **WHEN** chega uma mensagem `candle` do ativo selecionado com `time` posterior ao `time` do último candle
- **THEN** a aplicação envia uma nova consulta `getCandles` e os candles atuais continuam disponíveis até a resposta

#### Scenario: Consulta já pendente
- **WHEN** chega outra mensagem `candle` no novo minuto antes da resposta da consulta
- **THEN** nenhuma consulta adicional é enviada

## ADDED Requirements

### Requirement: Candle em andamento atualizado pelo canal
Quando chegar uma mensagem `candle` do ativo selecionado com o mesmo `time` do último candle, a aplicação SHALL substituir esse candle pelo recebido. Mensagens com `time` anterior ao do último candle MUST ser descartadas.

#### Scenario: Candle atualizado
- **WHEN** o último candle tem `high` igual a `33` e chega, no mesmo minuto, uma mensagem `candle` com `close` e `high` iguais a `33.5`
- **THEN** o último candle passa a ter `close` e `high` iguais a `33.5`, e os demais candles não mudam

#### Scenario: Candle de minuto anterior
- **WHEN** chega uma mensagem `candle` do ativo selecionado com `time` anterior ao do último candle
- **THEN** os candles não mudam

## REMOVED Requirements

### Requirement: Candle em andamento atualizado pelas cotações
**Reason**: O candle em andamento passa a chegar pelo canal `candle`, que é mais frequente e traz `volume` e `financialVolume`. Com o rodízio de cotações, cada ativo só recebe uma cotação por segundo.
**Migration**: Usar o requisito "Candle em andamento atualizado pelo canal".
