# Tasks

## 1. Dependência e carregamento do ApexCharts

- [x] 1.1 Adicionar `apexcharts` às dependências de `apps/web` com `pnpm --filter web add apexcharts` e confirmar que `pnpm install` termina sem pedir aprovação de scripts de build (se pedir, decidir em `allowBuilds` de `pnpm-workspace.yaml`)
- [x] 1.2 Criar `market/shared/apex-chart` com o token `APEX_CHARTS_LOADER`, criação única do gráfico, `updateSeries`/`updateOptions` sem animação, destruição (inclusive durante o carregamento) e output de falha, com um fake em `market-data/testing/` e specs que verifiquem cada um desses comportamentos

## 2. Dados no MarketStore

- [x] 2.1 Adicionar fixtures de `account` e `candles` em `market-fixtures.ts`, assinar `account` em cada `welcome` e expor o saldo no store, atualizando `BASE_SUBSCRIPTIONS` em `market-store.spec.ts` e cobrindo os cenários "Primeira conexão" e "Novo saldo"
- [x] 2.2 Implementar a consulta `getCandles` (limite 120) no `welcome` e em `select()`, a correlação por `requestId` e o `error` da consulta pendente, com specs para os cenários de "Consulta dos candles", "Correlação das respostas" e "Consulta pendente sem resposta"
- [x] 2.3 Atualizar o candle em andamento a partir de `quotes` e reconsultar na virada do minuto sem duplicar consultas pendentes, expondo `selectedQuote`, com specs para os cenários de "Candle em andamento" e "Virada do minuto"

## 3. Tema e estrutura da página

- [x] 3.1 Definir a paleta escura no `@theme` de `styles.css`, trocar o fundo em `index.html` e adicionar `variant` ao `FeedPanel`, com o spec do `FeedPanel` cobrindo as variantes e os avisos de estado
- [x] 3.2 Redesenhar `App` com barra lateral de âncoras, cabeçalho e seções na ordem do spec, adaptando `SignedValue` às cores do tema e atualizando `app.spec.ts` (seis painéis, sem abrir conexão, sem renderizar o ApexCharts) e `signed-value.spec.ts`
- [x] 3.3 Redesenhar `ConnectionStatusPanel` como indicador compacto do cabeçalho, mantendo texto do estado e erro, e confirmar que seu spec continua passando

## 4. Componentes por canal

- [x] 4.1 Criar `AccountPanel` com os quatro cards e a conta, com spec para os cenários de "Painel de saldo" e para os avisos de aguardando e desatualizado
- [x] 4.2 Redesenhar `QuotesPanel` com os cards de resumo, tabela com rolagem interna e cabeçalho fixo, atualizando a classe de seleção em `quotes-panel.spec.ts` e cobrindo "Resumo das cotações" e "Muitos ativos"
- [x] 4.3 Redesenhar `OrderBookPanel` com os dois cards, melhor preço, círculo do spread e rolagem interna dos níveis, com spec para "Melhor preço e spread no book" e mantendo os cenários existentes
- [x] 4.4 Implementar `portfolioAllocation` e redesenhar `PortfolioPanel` com rosca, legenda em texto e tabela com rolagem interna, com specs para os três cenários de "Distribuição da carteira" e mantendo os cenários existentes

## 5. Gráfico de preço

- [x] 5.1 Implementar `toCandlestickSeries` e os formatadores de preço e horário no fuso de Brasília, com testes unitários dos cenários "Horário de um candle" e "Preço no eixo"
- [x] 5.2 Criar `PriceChartPanel` com `app-apex-chart`, identificação do ativo e do intervalo, preço atual em texto e estados de aguardando, desatualizado e falha de carregamento, com specs (usando o fake) para os cenários de `price-chart`

## 6. Integração

- [x] 6.1 Rodar `pnpm build` e confirmar que não há erro nem aviso de orçamento e que o ApexCharts fica em um chunk separado do inicial
- [x] 6.2 Rodar `pnpm test` e confirmar que os testes de `server` e `web` passam
- [x] 6.3 Rodar `pnpm dev` e verificar no navegador os dados reais: gráfico atualizando com as cotações e virando o minuto, troca de ativo refletindo no gráfico e no book, queda e volta do servidor, largura de celular sem rolagem horizontal da página e fidelidade ao layout da imagem
- [x] 6.4 Atualizar a seção "Web architecture" do `CLAUDE.md` com a regra de carregar o ApexCharts só por `app-apex-chart` e `APEX_CHARTS_LOADER`, e confirmar que `market-protocol.ts` não precisou mudar

## 7. Temas claro e escuro

- [x] 7.1 Trocar os tokens de `styles.css` pela paleta azul, creme, âmbar e ferrugem, com valores de tema claro e escuro, e confirmar contraste de pelo menos 4,5:1 nos textos sobre card, card elevado, fundo e linha selecionada
- [x] 7.2 Criar `ThemeStore`, `ThemeToggle` e o script de tema inicial em `index.html`, com specs de alternância, persistência e ausência de armazenamento
- [x] 7.3 Fazer `app-apex-chart` e os painéis de gráfico acompanharem o tema sem recriar o gráfico, com specs usando o fake
- [x] 7.4 Verificar no navegador os dois temas com dados reais, a preferência do sistema e a escolha salva após recarregar
