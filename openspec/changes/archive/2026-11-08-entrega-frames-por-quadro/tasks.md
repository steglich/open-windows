# Tasks

## 1. Medição de referência

- [x] 1.1 Medir a build atual com `openspec/changes/archive/2026-11-08-conexao-socket-em-shared-worker/medir.mjs`, com `SEED=42`, 1 e 2 abas, três rodadas de 30 s cada, e verificar que os valores de `task`, `script` e `layout` estão registrados em `medicoes.md` nesta change

## 2. Frame original no worker

- [x] 2.1 Adicionar `{ type: 'frame'; frame: string; key: string | null }` a `WorkerToTabMessage` em `worker-messages.ts` e verificar que `pnpm build` compila
- [x] 2.2 Fazer `UpstreamSocket` passar o texto original a `onMessage` e verificar em `upstream-socket.spec.ts` que o listener recebe o mesmo texto do frame e que um frame inválido não chega a ele
- [x] 2.3 Fazer `MarketHub` postar `frame` em `book`, `candle` (com `key: null`), `positions`, `account` e `quotes` de um único ativo, e atualizar `market-hub.spec.ts` verificando o texto, a `key` e a entrega só às abas assinantes
- [x] 2.4 Manter como objeto `welcome`, `subscribed`, `error`, `candles`, `orders` e `quotes` com vários ativos, e verificar em `market-hub.spec.ts` que `quotes` com vários ativos continua filtrado por aba

## 3. Agrupamento por quadro na aba

- [x] 3.1 Implementar em `SharedWorkerMarketConnection` o mapa por `key`, a fila de `candle` e a corrida entre `requestAnimationFrame` e `setTimeout` de 100 ms, verificando em `market-connection.spec.ts`, com esses globais substituídos, que dois `book` do mesmo ativo geram uma mensagem e que `quotes` de ativos diferentes geram duas
- [x] 3.2 Verificar em `market-connection.spec.ts` que três frames `candle` no mesmo quadro geram três mensagens, na ordem de chegada
- [x] 3.3 Fazer toda mensagem que não seja `frame` aplicar os pendentes antes de ser publicada, e verificar em `market-connection.spec.ts` a ordem `book` seguido de `reconnecting` e `book` seguido de `welcome`
- [x] 3.4 Verificar em `market-connection.spec.ts` que, sem disparo do `requestAnimationFrame`, o temporizador aplica os pendentes e cancela o agendamento restante
- [x] 3.5 Descartar os pendentes e cancelar a corrida em `releasePort`, verificando em `market-connection.spec.ts` que nada é publicado depois de `close`, de `pagehide` e da falha de carga
- [x] 3.6 Atualizar a linha sobre aplicação imediata no `CLAUDE.md` e a seção "Como o front lida com isso" do `README.md`, com a regra de candle e o limite de um quadro, e verificar que `grep -n "time-based aggregator" CLAUDE.md` não retorna nada

## 4. Renderização no mesmo quadro

- [x] 4.1 Adicionar o callback `afterFlush` a `SharedWorkerMarketConnection`, chamado só depois de um `flush` feito pelo `requestAnimationFrame`, e verificar em `market-connection.spec.ts` que o temporizador e as mensagens de controle não o chamam
- [x] 4.2 Ligar `afterFlush` a `ApplicationRef.tick()` em `BrowserMarketConnectionFactory` e verificar em `market-connection.spec.ts` que a conexão criada pela factory chama `tick` depois do `requestAnimationFrame`

## 5. Verificação integrada

- [x] 5.1 Executar `pnpm test` e `pnpm build` e verificar que passam, sem aviso de erro de orçamento do bundle
- [x] 5.2 Abrir a build de produção no Chromium, com duas abas em ativos diferentes e o gráfico visível, e verificar que book, cotações e candle atualizam, que a virada do minuto gera `getCandles` e que derrubar e subir o servidor reconecta as abas
- [x] 5.3 Deixar uma aba oculta por 1 minuto, com os candles chegando, e verificar que o gráfico está atualizado ao voltar e que o tamanho da fila não cresce entre disparos do temporizador
- [x] 5.4 Repetir a medição da tarefa 1.1 e registrar em `medicoes.md` a comparação de `task`, `script` e `layout`, inclusive se o ganho for menor que o previsto
