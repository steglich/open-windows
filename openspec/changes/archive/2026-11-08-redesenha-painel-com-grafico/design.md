# Design

## Context

Motivação em `proposal.md`, comportamento nos delta specs.

- `MarketSocket` é dono da conexão e `MarketStore` guarda o estado em signals. Os componentes de `market/` só leem o store. `MarketStore` já recebe `account` e `candles`, mas descarta as duas mensagens, e não assina `account`.
- O servidor publica um lote `quotes` a cada 500 ms. Em cada `tick`, todo ativo recebe `updatedAt = now` e o candle corrente é o do minuto de `now` (`floorToMinute`), mesmo com o mercado fechado. Por isso a cotação indica exatamente o minuto do candle em andamento.
- Volume padrão: 500 ativos, 50 níveis por lado no book e 300 posições.
- O orçamento do `angular.json` é de 500 kB (aviso) e 1 MB (erro) no bundle inicial. A entrada ESM padrão do ApexCharts tem cerca de 950 kB sem compressão. A versão fica em `~8.7.0` porque a 8.8.0 e sua dependência `apex-commons@0.10.0` foram publicadas no dia da implementação e exigiriam exceções em `minimumReleaseAgeExclude`.
- Os specs rodam em jsdom, onde o ApexCharts não consegue medir nem desenhar SVG.

## Goals / Non-Goals

**Goals:**

- Um componente por canal assinado, mais o gráfico, sem que nenhum deles fale com o socket.
- Manter o `pnpm build` sem erro de orçamento.
- Manter testável toda a lógica de dados dos gráficos sem renderizar o ApexCharts.

**Non-Goals:**

- Reproduzir textos e números da imagem. Ela orienta a estrutura e o visual, e o conteúdo vem dos feeds.
- Virtualizar as tabelas, que continuam renderizando todas as linhas como hoje.

## Decisions

### Mapeamento da imagem para os dados

| Elemento da imagem | Componente | Dado |
| --- | --- | --- |
| Quatro cards de KPI, o primeiro em destaque claro | `app-account-panel` (novo) | canal `account` |
| Card "Revenue" | `app-price-chart-panel` (novo) | `getCandles` + `quote` |
| Cards coloridos e tabela da "Order list" | `app-quotes-panel` | canal `quote` |
| Dois cards grandes ligados por um círculo | `app-order-book-panel` | canal `book`: melhor compra, melhor venda e spread no círculo |
| Rosca "Sales by Category" e tabela | `app-portfolio-panel` | canal `positions` |
| Ícones do cabeçalho | `app-connection-status-panel` | estado da conexão, como indicador compacto |

A ordem das seções difere da imagem em um ponto: as cotações vêm logo abaixo do saldo e do gráfico. Selecionar um ativo é a principal interação e altera o gráfico e o book, então a tabela precisa ficar perto deles. A rosca fica dentro do card da carteira, ao lado da tabela, para que o canal `positions` continue com um único componente, em vez de ao lado do book como na imagem.

A barra lateral usa links de âncora para as seções, pois a aplicação tem uma única rota. O logo é um SVG próprio, e não o da imagem.

### Tema com tokens no `@theme` do Tailwind

A paleta (fundo, superfícies, texto, borda e as cores de série) fica no `@theme` de `styles.css`, gerando utilitários como `bg-card`. Assim os componentes seguem usando apenas classes utilitárias, como manda o projeto. A alternativa de usar cores arbitrárias espalhadas nos templates dificultaria ajustar o tema.

`FeedPanel` continua sendo a moldura comum, com os avisos de estado, e ganha `variant: 'card' | 'plain'`. O saldo usa `plain` para que seus quatro cards não fiquem dentro de outro card.

### Temas claro e escuro por variáveis CSS

O `@theme` define os tokens com os valores do tema claro, e `:root[data-theme="dark"]` redefine as mesmas variáveis. Como os utilitários do Tailwind apontam para essas variáveis, nenhum template precisa de variantes `dark:`. A paleta base (`navy`, `blue`, `teal`, `cream`, `amber`, `rust`) não muda entre os temas; os tokens semânticos (`card`, `ink`, `gain`, `loss` e outros) mudam. No tema escuro, as superfícies são preto e cinzas neutros, e o azul fica só nos destaques. Ganho e perda usam azul e ferrugem para ficar dentro da paleta, e o sinal `+` ou `-` continua garantindo o sentido sem depender da cor.

Um script em `index.html` define `data-theme` antes do bundle carregar, a partir da escolha salva ou da preferência do sistema, para a página não piscar no tema errado. `ThemeStore` apenas lê esse atributo e faz a alternância, salvando em `localStorage`.

Os gráficos recebem o tema pelo `ThemeStore`. As cores ficam em `market/shared/chart-theme.ts`, repetindo os tokens, porque o ApexCharts exige literais e o Tailwind só emite as variáveis usadas. A troca chama `updateOptions`, sem recriar o gráfico.

### Candles no `MarketStore`, sem canal novo

Os candles são estado derivado da seleção, então ficam no store, junto das regras de `select()` e `welcome`:

- `candlesState` guarda os candles do ativo selecionado, e `candlesRequestId` guarda o id da consulta pendente.
- Cada consulta gera um `requestId` por contador. Só a resposta com o id pendente é aplicada. Isso resolve de uma vez respostas atrasadas de seleções anteriores e de conexões anteriores.
- Todo `welcome` envia uma nova consulta e sobrescreve o id, o que já cobre a queda com consulta pendente sem tratamento específico. `select()` limpa o id mesmo sem conexão.
- O `error` com o `requestId` pendente limpa o id e segue o fluxo normal de `lastError`.

Na mesma atualização do lote `quotes`, a cotação do ativo selecionado é comparada ao último candle pelo minuto de `updatedAt`:

- Mesmo minuto: atualiza `close`, `high` e `low` em um novo array, mantendo as referências dos demais candles.
- Minuto posterior: envia nova consulta se nenhuma estiver pendente.
- Minuto anterior: ignora.

Alternativas descartadas: criar um canal de candles no servidor, que muda o protocolo sem necessidade; consultar por timer no cliente, que atrasa o gráfico e consulta à toa; e abrir o candle novo localmente na virada do minuto, que inventaria `open` e zeraria o volume.

`limit` é 120 (duas horas de pregão) porque 390 candles ficariam com menos de 2 px de largura no card e pesariam no SVG a cada atualização.

### ApexCharts direto, com carregamento sob demanda

Um componente `app-apex-chart` em `market/shared/apex-chart/` encapsula a biblioteca e é usado pelos dois gráficos. Ele recebe `options` e `series` como inputs e:

- obtém a biblioteca pelo token `APEX_CHARTS_LOADER`, cujo padrão é `() => import('apexcharts').then((m) => m.default)`;
- cria o gráfico uma vez e depois chama `updateSeries(series, false)` quando `series` muda e `updateOptions(options, false, false)` quando `options` muda, sem animação;
- destrói o gráfico ao ser destruído, inclusive se isso ocorrer durante o carregamento;
- expõe a falha de carregamento por um output, para o painel exibir a mensagem.

O `import()` dinâmico gera um chunk separado e mantém o bundle inicial dentro do orçamento. O token permite que os specs injetem um fake e verifiquem as chamadas sem jsdom desenhar nada.

Não usamos `ng-apexcharts` porque seria uma dependência a mais só para o binding, e sua importação estática pede `@defer` para não pesar no bundle inicial. Com updates a cada 500 ms, chamar diretamente `updateSeries` também dá controle sobre o custo de cada atualização.

### Dados dos gráficos em funções puras

- `toCandlestickSeries(candles)` transforma candles em pontos `{ x, y: [o, h, l, c] }`.
- `portfolioAllocation(portfolio)` devolve até seis fatias, com rótulo, valor e percentual.

Ambas são cobertas por testes unitários, e o componente só as liga aos inputs. O eixo X usa `type: 'category'` em vez de `datetime`, pois o eixo temporal abriria um espaço vazio entre pregões. Os rótulos usam `Intl.DateTimeFormat` com `timeZone: 'America/Sao_Paulo'`, já que o pregão simulado segue o horário de Brasília.

As opções da rosca são um `computed` com igualdade por rótulos, para que `updateOptions` só rode quando as maiores posições mudarem. A legenda é HTML, com ativo e percentual em texto.

### Resumo e derivações

`selectedQuote`, `accountBalance` e `candles` são expostos pelo store. O resumo das cotações é um `computed` no próprio `QuotesPanel`, pois só ele o usa. O valor em ativos é calculado no `AccountPanel` a partir do próprio saldo, para que o componente dependa de um único canal.

## Risks / Trade-offs

- [Licença do ApexCharts] A licença Community é gratuita apenas abaixo de US$ 2 milhões de receita e veda embutir em produto ou plataforma usada por terceiros sem licença OEM, o que pode conflitar com a distribuição do repositório como `AGPL-3.0-only`. → A biblioteca foi pedida explicitamente e fica isolada em `app-apex-chart`, então trocar por outra exige mudar só esse componente e as opções dos gráficos. Quem mantém o projeto deve confirmar a licença antes de distribuir.
- [Custo de renderização] Atualizar o SVG de 120 candles a cada 500 ms pode pesar em máquinas fracas. → Animações desligadas e `updateSeries` só quando os candles do ativo selecionado mudam.
- [Tabelas longas] 500 linhas de cotações continuam no DOM. → Já é o comportamento atual, e `track quote.symbol` evita recriar as linhas. A rolagem interna limita a área visível, não o custo.
- [Reconexão durante a virada do minuto] Uma resposta perdida deixa o último candle antigo até a próxima cotação. → A próxima cotação no minuto novo reenvia a consulta, pois não há pendência depois do `error` ou do `welcome`.
- [Consulta sem resposta com a conexão aberta] O servidor sempre responde, mas sem resposta a virada do minuto ficaria travada até o próximo `welcome`. → Risco aceito: uma conexão muda é derrubada pela detecção de silêncio, que leva a um novo `welcome`.

## Migration Plan

Mudança somente de frontend, sem dados persistidos. O rollback é reverter o commit e remover a dependência.
