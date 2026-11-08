# Tasks

## 1. Medição de referência

- [x] 1.1 Antes de alterar o código, medir a build de produção conectada ao servidor com `SEED` fixo: em 30 s, somar a duração das long tasks (`PerformanceObserver` do tipo `longtask`) e o tempo de thread principal da gravação do Performance do Chrome, com 1 e com 2 abas. Verificação: números e procedimento registrados em `openspec/changes/conexao-socket-em-shared-worker/medicoes.md`.

## 2. Conexão e Factory

- [x] 2.1 Criar `connection/worker-messages.ts` com as mensagens aba↔worker e `ConnectionStatus` (incluindo `unavailable`), reexportando o tipo em `market-socket.ts`. Verificação: `pnpm --filter web build` passa.
- [x] 2.2 Criar `connection/market-connection.ts` com `MarketConnection`, `MarketConnectionFactory`, a implementação padrão e `UnavailableMarketConnection`. Verificação: spec cobre a escolha com e sem `SharedWorker` e o estado `unavailable`.
- [x] 2.3 Implementar `connection/shared-worker-market-connection.ts` (`attach`, `send`, `detach` em `pagehide`, novo `attach` em `pageshow` persistido, `unavailable` no evento `error`). Verificação: spec com `SharedWorker` falso cobre cada um desses casos.

## 3. Núcleo do worker

- [x] 3.1 Mover parse, backoff e silêncio do `MarketSocket` para `connection/upstream-socket.ts`, sem Angular, e migrar para `upstream-socket.spec.ts` os testes de reconexão, silêncio e frames inválidos de `market-socket.spec.ts`. Verificação: os testes migrados passam com as mesmas esperas de 1, 2, 4, 8, 16, 30 e 30 s e o limite de 5 s.
- [x] 3.2 Implementar em `connection/market-hub.ts` o ciclo de portas: `attach` com repetição do `status` e do `welcome`, `detach`, e fechamento do socket com código 1000 ao sair a última porta. Verificação: `market-hub.spec.ts` cobre os cenários de conexão única, entrada de aba, estado igual entre as abas e encerramento limpo.
- [x] 3.3 Implementar no hub as assinaturas por porta e a entrega dirigida, incluindo `quotes` filtrado e `error` sem `requestId`. Verificação: `market-hub.spec.ts` cobre os cenários de ativo independente por aba, entrega somente do assinado e erros sem `requestId`.
- [x] 3.4 Implementar no hub o cancelamento compartilhado, a resposta local de `unsubscribed` e a limpeza dos registros ao perder o socket. Verificação: `market-hub.spec.ts` cobre os três cenários de cancelamento e o reassinar após queda.
- [x] 3.5 Implementar no hub a reescrita e a restauração de `requestId`. Verificação: `market-hub.spec.ts` cobre `getCandles` simultâneos com o mesmo `requestId` e o erro com `requestId`.
- [x] 3.6 Criar `connection/market.worker.ts` ligando `onconnect` ao `MarketHub`, com `new SharedWorker(new URL('./market.worker', import.meta.url), { type: 'module' })` na forma literal na conexão. Verificação: `pnpm --filter web build` emite o bundle do worker em `dist` sem aumentar o erro de budget.

## 4. Integração no `MarketSocket`

- [x] 4.1 Criar em `testing/` `IN_PROCESS_MARKET_CONNECTION_PROVIDERS`, com uma conexão que fala direto com o `UpstreamSocket`, sem o `MarketHub`. Verificação: usado pelo spec da tarefa 4.2.
- [x] 4.2 Reescrever o `MarketSocket` como fachada sobre `MarketConnectionFactory`, mantendo a API pública, e reduzir `market-socket.spec.ts` ao que resta da fachada. Verificação: `market-socket.spec.ts` passa, cobrindo estados, publicação de rajadas e encerramento com `FakeWebSocket`.
- [x] 4.3 Acrescentar o provider aos demais specs que usam `FakeWebSocket` (`market-store`, `app`, `app.config` e painéis). Verificação: `pnpm --filter web test` passa sem alterar as asserções desses specs.

## 5. Painel de status

- [x] 5.1 Adicionar o estado `unavailable` ao `STATUS_DISPLAY` de `connection-status-panel.ts`. Verificação: `connection-status-panel.spec.ts` cobre o texto exibido.
- [x] 5.2 Atualizar a seção de arquitetura web de `CLAUDE.md` (a conexão agora vive no worker e é criada pela Factory; specs usam o provider em processo). Verificação: a seção descreve os novos arquivos e não menciona mais o `MarketSocket` como dono do socket.

## 6. Verificação integrada

- [x] 6.1 Com `pnpm dev`, abrir duas abas em ativos diferentes e confirmar: uma única conexão WebSocket, cada aba com book e candles do próprio ativo, ao fechar uma aba a outra segue atualizando, e ao derrubar e subir o servidor as duas reconectam. Verificação: comportamento observado e anotado em `medicoes.md`.
- [x] 6.2 Repetir a medição da tarefa 1.1 na build de produção. Verificação: comparação antes/depois registrada em `medicoes.md`.
- [x] 6.3 Rodar `pnpm build` e `pnpm test` na raiz. Verificação: os dois terminam sem erros.
