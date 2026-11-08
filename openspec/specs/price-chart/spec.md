# price-chart Specification

## Purpose

Define o gráfico de preço do ativo selecionado no homebroker: o que ele mostra, como acompanha o mercado e como informa seus estados ao usuário.

## Requirements

### Requirement: Gráfico de candlestick do ativo selecionado
A página SHALL exibir um gráfico de candlestick dos candles de 1 minuto do ativo selecionado, em ordem cronológica, identificando o ativo e o intervalo.

#### Scenario: Candles recebidos
- **WHEN** há candles do ativo selecionado `ALFA3`
- **THEN** o gráfico mostra um candle por minuto com abertura, máxima, mínima e fechamento, e o painel identifica `ALFA3` e o intervalo de 1 minuto

#### Scenario: Pregões diferentes na mesma janela
- **WHEN** os candles exibidos pertencem a dois pregões
- **THEN** os candles ficam contíguos, sem um espaço vazio correspondente ao período com o mercado fechado

### Requirement: Gráfico acompanha a seleção
Ao mudar o ativo selecionado, o gráfico SHALL deixar de mostrar os candles do ativo anterior e MUST mostrar os do novo ativo assim que chegarem.

#### Scenario: Troca de ativo
- **WHEN** o usuário seleciona `BETA4` com o gráfico de `ALFA3` na tela
- **THEN** o painel exibe o aviso de aguardando dados até chegarem os candles de `BETA4`, e então mostra o gráfico de `BETA4`

### Requirement: Atualização do gráfico em tempo real
O gráfico SHALL refletir as mudanças nos candles do ativo selecionado sem recarregar a página e sem recriar o gráfico.

#### Scenario: Nova cotação do ativo selecionado
- **WHEN** chega uma cotação de `ALFA3` e nenhuma mensagem `candle` nova
- **THEN** os candles do gráfico permanecem iguais

#### Scenario: Novo candle em andamento do ativo selecionado
- **WHEN** chega uma mensagem `candle` de `ALFA3` que altera o candle em andamento
- **THEN** o último candle do gráfico muda e os demais permanecem iguais

### Requirement: Preço atual em texto
O painel do gráfico SHALL mostrar em texto o último preço e a variação do ativo selecionado, para que o valor atual não dependa da leitura do gráfico.

#### Scenario: Cotação disponível
- **WHEN** há cotação do ativo selecionado com `last` igual a `32.5` e `change` igual a `0.5`
- **THEN** o painel exibe `R$ 32,50` e `+R$ 0,50`

### Requirement: Valores do gráfico em formato brasileiro
Preços do gráfico SHALL seguir o formato `pt-BR` em reais, e horários MUST ser exibidos no fuso de Brasília, independentemente do fuso do navegador.

#### Scenario: Horário de um candle
- **WHEN** um candle tem `time` correspondente a `2026-01-05T13:00:00Z`
- **THEN** seu horário é exibido como `10:00`

#### Scenario: Preço no eixo
- **WHEN** o eixo de preços mostra o valor `32.5`
- **THEN** o texto exibido é `R$ 32,50`

### Requirement: Falha ao carregar o gráfico
Se a biblioteca do gráfico não puder ser carregada, o painel SHALL exibir uma mensagem de erro, e os demais painéis MUST continuar funcionando.

#### Scenario: Falha no carregamento
- **WHEN** o carregamento da biblioteca do gráfico falha
- **THEN** o painel do gráfico exibe que não foi possível carregar o gráfico e os demais painéis continuam atualizando
