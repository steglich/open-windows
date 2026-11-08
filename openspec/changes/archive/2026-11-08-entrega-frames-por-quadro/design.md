# Design

## Context

Motivação em `proposal.md`, comportamento na delta spec de `market-data-client`.

- `UpstreamSocket` faz `JSON.parse` no worker e entrega o objeto ao `MarketHub`, que o posta como `{ type: 'message', message }`. O frame original é descartado.
- `SharedWorkerMarketConnection` recebe a mensagem e a publica no `Subject` imediatamente, com uma tarefa por mensagem.
- Com todos os painéis visíveis chegam cerca de 1850 mensagens por segundo. A 60 Hz, são em média 17 books, 8 quotes e 6 candles por quadro.
- `MarketStore` já ignora mensagens de ativos não selecionados e candles iguais ao atual, e não precisa saber como as mensagens foram agrupadas.
- O scheduler do Angular sem `zone.js` usa uma corrida entre `setTimeout` e `requestAnimationFrame` (`scheduleCallbackWithRafRace`). Uma notificação feita dentro de um callback de `requestAnimationFrame` só renderiza depois da pintura daquele quadro.

## Goals / Non-Goals

**Goals:**

- Eliminar a desserialização de objetos grandes na thread principal.
- Parsear e aplicar, por quadro, só o que pode aparecer na tela, sem perder nenhum `candle`.
- Não acrescentar um quadro de atraso à exibição.
- Manter `MarketStore`, `MarketSocket` e painéis inalterados.

**Non-Goals:**

- Reduzir o número de eventos da porta, que continua sendo de um por mensagem.
- Reduzir layout e renderização, que seguem como o maior custo da thread principal.
- Evitar gravações repetidas de um book idêntico entre quadros, o que exigiria deduplicar por `timestamp`.

## Decisions

### Formato entre worker e aba

`WorkerToTabMessage` ganha `{ type: 'frame'; frame: string; key: string | null }`, e `{ type: 'message' }` continua existindo.

`UpstreamListener.onMessage` passa a receber também o texto original. O `MarketHub` posta como `frame`:

| Mensagem | `key` |
| --- | --- |
| `book` | `book:<ativo>` |
| `quotes` com um único ativo, assinado pela aba | `quote:<ativo>` |
| `positions` | `positions` |
| `account` | `account` |
| `candle` | `null`, que significa não substituir |

O restante segue como objeto: `welcome`, `subscribed`, `error`, `candles` e `orders`, que têm `requestId` reescrito ou são raros, e `quotes` com vários ativos, que o hub pode precisar filtrar para a aba.

O worker informa a `key` porque já conhece canal e ativo. Sem ela, a aba teria de parsear cada frame para saber o que substituir, o que anularia o ganho.

Alternativa descartada: continuar enviando objetos e parsear menos. A desserialização acontece ao ler `event.data` e custa 21,1 µs por book, enquanto o envelope com string custa 1,2 µs. Sem string, não há como descartar uma mensagem sem pagar por ela.

### Agrupamento na aba, e não no worker

`SharedWorkerMarketConnection` mantém um `Map<string, string>` com o frame mais recente por `key` e um array com os frames de `candle`. O primeiro frame depois de um `flush` agenda o próximo.

No `flush`, as estruturas são trocadas por novas antes de iterar. Os frames do mapa são parseados e publicados, seguidos dos frames de `candle`, na ordem de chegada. A ordem entre canais não importa, pois cada um altera um estado independente.

Alternativa descartada: agrupar no worker. Ele não tem `requestAnimationFrame` e não conhece a taxa de quadros de cada documento, e cada janela pode estar em um monitor diferente.

Como `IN_PROCESS_MARKET_CONNECTION_PROVIDERS` não passa por essa classe, os specs do `MarketStore` e dos painéis continuam síncronos.

### `candle` em fila, sem substituição

Os frames de `candle` nunca são substituídos, conforme pedido. Interpretei "não perder as mensagens" como aplicar todas, em ordem, dentro do quadro. O custo é pequeno: cerca de 6 parses curtos por quadro, e `MarketStore` já ignora candles iguais ao atual.

### Corrida entre `requestAnimationFrame` e temporizador

Cada agendamento arma um `requestAnimationFrame` e um `setTimeout` de 100 ms (`FRAME_FALLBACK_MS`). O primeiro a disparar faz o `flush` e cancela o outro. O temporizador cobre o documento oculto, em que o `requestAnimationFrame` não dispara, inclusive quando ele fica oculto depois do agendamento.

Alternativa descartada: alternar pelo `visibilitychange`, que exige reagendar na transição e consultar `document.hidden`. A corrida resolve os dois casos com um único mecanismo, o mesmo usado pelo Angular.

### Renderizar no mesmo quadro

Depois de um `flush` feito pelo `requestAnimationFrame`, a conexão chama um callback `afterFlush`, que a `BrowserMarketConnectionFactory` liga a `ApplicationRef.tick()`. Sem isso, as notificações feitas dentro do callback só renderizariam depois da pintura, somando um quadro de atraso.

Com `zone.js` ausente, `tick()` só verifica o que estiver marcado como sujo, e o `afterTick` do scheduler cancela o agendamento pendente, então não há renderização dobrada. O `flush` disparado pelo temporizador ou por uma mensagem de controle não chama `tick()`, pois nesses casos o scheduler do Angular já atende.

`SharedWorkerMarketConnection` recebe o callback no construtor para continuar sem depender do Angular.

### Mensagens de controle

Em `receive`, qualquer mensagem que não seja `frame` chama `flush` antes de ser publicada, inclusive `status`. Isso mantém a ordem observada hoje: dados recebidos antes de uma queda são aplicados antes de o estado mudar, e nenhum frame antigo é aplicado depois de um `welcome`.

### Encerramento

`releasePort` cancela a corrida e esvazia as duas estruturas, o que cobre `close`, `pagehide` e a falha de carga.

## Risks / Trade-offs

- [Fila de `candle` em documento oculto] O navegador limita temporizadores em segundo plano, normalmente a um disparo por segundo e, no pior caso, a um por minuto. → A 350 mensagens por segundo, são no máximo cerca de 21 mil frames curtos, e a fila volta a zero no disparo seguinte.
- [Estados intermediários não aplicados] `book`, `quotes`, `positions` e `account` substituídos entre quadros nunca chegam ao estado. → Eles também não seriam exibidos, pois o navegador pinta uma vez por quadro. O `MarketStore` não tem lógica que dependa deles.
- [Ganho limitado] O benchmark isolado aponta cerca de 22 ms/s economizados, cerca de 5% do tempo total da thread principal, sem contar o RxJS e as gravações em signals. Layout e renderização não mudam. → As tarefas medem o resultado real no Chromium.
- [Monitores de alta taxa] Mais quadros reduzem o agrupamento: 3,8 ms/s a 144 Hz contra 2,7 ms/s a 60 Hz. → Aceito, ainda abaixo do custo atual.
- [Quadro longo] Se a renderização atrasar, o temporizador pode aplicar os frames antes do `requestAnimationFrame`, sem o `tick()`. → O scheduler do Angular renderiza normalmente, com no máximo um quadro a mais nesse caso.
- [Número de tarefas não muda] Cada mensagem ainda gera um evento da porta. → Reduzir isso exigiria agrupar no worker, fora do escopo.

## Migration Plan

Mudança somente de frontend, sem dados persistidos. Worker e aba vêm da mesma build, pois a URL do worker leva hash em produção. O rollback é reverter o commit.
