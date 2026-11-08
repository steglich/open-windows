# Proposal

## Why

O frontend mostra os feeds em painéis simples e claros, sem hierarquia visual, e ignora dois dados que o servidor já entrega: o canal `account` e o histórico de candles. Falta uma tela com a identidade do layout de referência (dashboard em cards), com um componente por canal assinado e um gráfico de preço.

## What Changes

- Aplicar o layout da imagem de referência à tela, com a paleta azul, creme, âmbar e ferrugem, nos temas claro e escuro, com alternância no cabeçalho: barra lateral, cabeçalho, cards arredondados e tabelas no estilo da "Order list".
- Criar o componente do canal `account`, em quatro cards, e passar a assinar esse canal. Os canais `quote`, `book` e `positions` mantêm seus componentes, redesenhados.
- Adicionar ao book o destaque do melhor preço de cada lado e do spread, como nos dois cards ligados por um círculo da imagem.
- Adicionar à carteira uma rosca (donut) com a distribuição dos ativos por valor de mercado.
- Adicionar às cotações quatro cards de resumo (ativos, em alta, em baixa, estáveis), no estilo dos cards coloridos da imagem.
- Criar a conexão de dados do gráfico no cliente: consultar candles por `getCandles` para o ativo selecionado e manter o candle em andamento atualizado a partir das cotações.
- Criar o painel de gráfico de candlestick do ativo selecionado, usando ApexCharts.
- Adicionar a dependência `apexcharts`, carregada sob demanda para não ultrapassar o orçamento do bundle inicial.

Fora do escopo:

- A tela "Order list" e o consumo de `getOrders`, pois ordens não são um canal assinado. O visual da tabela é aproveitado nas cotações e na carteira.
- Mudanças no servidor ou no protocolo: `account` e `getCandles` já existem.
- Elementos da imagem sem dado ou função correspondente: busca, configurações, notificações, avatar, logout, exportação, filtros, indicadores percentuais "vs. mês anterior" e setas de atalho dos cards.
- Paginação do gráfico para candles mais antigos e troca de intervalo, pois o servidor só oferece 1 minuto.

## Capabilities

### New Capabilities

- `price-chart`: gráfico de candlestick do ativo selecionado, com seus estados e o texto do preço atual.

### Modified Capabilities

- `market-data-client`: assina o canal `account`, mantém o saldo no estado, consulta os candles do ativo selecionado e mantém o candle em andamento atualizado.
- `market-dashboard`: inclui os painéis de saldo e de gráfico, o layout em seções, os temas claro e escuro, o destaque de melhor preço e spread no book, a distribuição da carteira e o resumo das cotações.

## Impact

- `apps/web/src/app/market-data/`: `market-store.ts` e `testing/market-fixtures.ts`. Os tipos de `market-protocol.ts` já cobrem o necessário.
- `apps/web/src/app/market/`: novos `account-panel`, `price-chart-panel` e `shared/apex-chart`, e novo visual dos componentes existentes, incluindo as classes verificadas pelos specs.
- `apps/web/src/app/app.*`, `src/index.html` e `src/styles.css`: estrutura da página e paleta dos dois temas.
- Nova dependência de produção `apexcharts` em `apps/web`.
- Licença: o ApexCharts usa licença própria com faixa gratuita condicionada a receita abaixo de US$ 2 milhões, com restrições a uso embutido em produto usado por terceiros. O repositório é `AGPL-3.0-only`, e essa combinação precisa ser aceita por quem mantém o projeto (ver design).
