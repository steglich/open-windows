# Design

## Context

Motivação em `proposal.md`; requisitos em `specs/`.

Hoje o `MarketSocket` (`apps/web/src/app/market-data/market-socket.ts`) concentra `new WebSocket`, parse e validação, backoff, detecção de silêncio e publicação em um `Subject`. O `MarketStore` usa apenas `status`, `messages`, `connect` e `send`, e refaz as assinaturas a cada `welcome`.

Fatos que moldam a solução:

- O builder `@angular/build` reconhece `new SharedWorker(new URL('...', import.meta.url), ...)` e empacota o worker à parte, desde que a expressão seja escrita literalmente nessa forma.
- No servidor, `subscribe` é idempotente e sempre reenvia o estado atual do canal (`gateway.ts`). As respostas `subscribed` e `unsubscribed` não têm identificador.
- `SharedWorker` não existe no jsdom, e os specs atuais controlam o socket por `FakeWebSocket`, com asserções síncronas.
- `MessagePort` não tem evento de fechamento: o worker só sabe que uma aba saiu se ela avisar.

## Goals / Non-Goals

**Goals:**

- Manter a API pública do `MarketSocket` (`status`, `messages`, `connect`, `send`, `disconnect`), de modo que `MarketStore` e componentes não mudem.
- Código do worker sem Angular e sem RxJS, testável sem um `SharedWorker` real.

**Non-Goals:**

- Compartilhar o estado do `MarketStore` entre abas: cada aba segue com o seu.
- Detectar aba que morreu sem avisar (ver riscos).
- Reduzir a taxa ou o tamanho das mensagens.

## Decisions

### 1. Factory abstrata injetada no `MarketSocket`

```
MarketSocket ──usa──▶ MarketConnectionFactory.create(url) ──▶ MarketConnection
                              │
                              ├─ com SharedWorker: SharedWorkerMarketConnection
                              └─ sem SharedWorker: UnavailableMarketConnection
```

`MarketConnection` expõe `status` e `messages` (observables), `send` e `close`. `MarketConnectionFactory` é uma classe abstrata com `providedIn: 'root'` e `useClass` da implementação padrão, que verifica `typeof SharedWorker` e escolhe o que construir. `UnavailableMarketConnection` é um objeto nulo que emite `unavailable` e ignora `send`.

A Factory concentra a decisão e dá aos specs o ponto de substituição. Alternativa descartada: um `if` no `MarketSocket`, que acoplaria a fachada ao worker e tornaria necessário stubar um global em todo spec.

O `MarketSocket` guarda a conexão criada, repassa `status` e `messages` para o signal e o `Subject` atuais e continua dono da regra de chamar `close` no `DestroyRef`.

### 2. Separação do código do worker

Em `apps/web/src/app/market-data/connection/`:

| Arquivo | Responsabilidade |
| --- | --- |
| `market-connection.ts` | `MarketConnection`, `MarketConnectionFactory` e a implementação padrão |
| `shared-worker-market-connection.ts` | Lado da aba: `MessagePort`, `pagehide`, `pageshow` |
| `worker-messages.ts` | Mensagens aba↔worker e `ConnectionStatus` |
| `upstream-socket.ts` | WebSocket, parse, backoff e silêncio, movidos do `MarketSocket` sem Angular |
| `market-hub.ts` | Portas, assinaturas por aba e roteamento |
| `market.worker.ts` | Ponto de entrada: liga `onconnect` ao `MarketHub` |

`ConnectionStatus` passa a morar em `worker-messages.ts` para o worker não importar `market-socket.ts`, que depende de Angular. `market-socket.ts` o reexporta, preservando os imports atuais.

`market.worker.ts` usa um tipo local mínimo para `self.onconnect`, em vez de um `tsconfig` com `lib: webworker`. Assim o arquivo compila com o `tsconfig.app.json` atual, sem o conflito entre as libs `dom` e `webworker`.

### 3. Mensagens entre aba e worker

- Aba → worker: `attach { url }`, `send { message }`, `detach`.
- Worker → aba: `status { status }`, `message { message }`.

O worker parseia o frame uma vez e publica o objeto. Passar a string adiante e parsear na aba foi descartado porque o worker precisa do conteúdo para rotear, e a thread principal voltaria a parsear.

`status` é sempre postado antes do `welcome`, preservando a ordem do código atual (`status` já é `connected` quando o `MarketStore` trata o `welcome`).

### 4. Assinaturas e roteamento no `MarketHub`

Cada porta tem um registro de assinaturas por canal: flags para `positions` e `account`, e conjuntos de ativos para `quote`, `book` e `candle` (assinatura sem `symbols` expande para os ativos do `welcome`).

- **subscribe**: atualiza o registro da porta e sempre encaminha ao servidor, para que a aba receba o estado inicial. O estado reenviado chega também às outras abas assinantes, sem prejuízo, pois é o valor atual.
- **unsubscribe**: atualiza o registro e encaminha só os ativos que nenhuma outra porta mantém. O hub responde `unsubscribed` à aba na hora e descarta o `unsubscribed` do servidor, que não diria a quem pertence.
- **Entrega**: `book` e `candle` pelo `symbol`; `positions` e `account` pelas flags; `quotes` com `data` filtrado pelos ativos da porta; `subscribed` às portas que têm aquele canal; `welcome` e `error` sem `requestId` a todas.
- **Correlação**: o hub reescreve `requestId` para `<portId>:<original>`, roteia pela parte inicial e restaura o original antes de entregar. Alternativa descartada: exigir IDs únicos das abas, o que vazaria para o `MarketStore`.
- **Queda**: os registros de todas as portas são limpos ao perder o socket. O `send` sem conexão aberta é descartado, como hoje, porque cada `welcome` refaz tudo.

### 5. Entrada e saída de abas

- O hub guarda o último `welcome`. No `attach` com o estado `connected`, posta o `status` e o `welcome` só para a nova porta. O fluxo normal do `MarketStore` faz o resto.
- A primeira `url` recebida vale para o hub. Todas as abas da mesma build usam a mesma.
- `detach` remove a porta, cancela o que só ela assinava e, sendo a última, fecha o socket com código 1000 e cancela os timers.
- A aba envia `detach` em `pagehide`. Em `pageshow` com `persisted` (volta do bfcache), a conexão cria um novo `SharedWorker` e faz `attach`, recebendo `status` e `welcome` como uma aba nova.

### 6. Falha ao carregar

O evento `error` do `SharedWorker` faz a conexão emitir `unavailable`, sem novas tentativas.

### 7. Testes em processo

`testing/` ganha `IN_PROCESS_MARKET_CONNECTION_PROVIDERS`, uma factory cuja conexão fala direto com o `UpstreamSocket`, sem o `MarketHub`. O `FakeWebSocket` e as asserções síncronas dos specs existentes seguem válidos, bastando acrescentar o provider. Passar pelo hub foi descartado: ele reescreve o `requestId` no fio e filtra o que a aba não assinou, o que obrigaria os specs do `MarketStore` a conhecer esses detalhes. O comportamento entre abas é testado no `market-hub.spec.ts` com várias portas falsas. Não é possível exercitar um `SharedWorker` real no jsdom; isso fica na verificação manual final.

## Risks / Trade-offs

- **[Taxa dividida entre ativos]** O servidor define a taxa de `book` e `candle` por conexão e roda os ativos assinados em rodízio. Com abas em ativos diferentes na mesma conexão, cada ativo passa a receber uma fração da taxa. → Aceito, pois o escopo é só o front; com uma aba o comportamento não muda. Se incomodar, a correção é no servidor, em outra change.
- **[Custo do `postMessage`]** O structured clone desserializa na thread principal, com custo próximo ao do `JSON.parse` que sai de lá, e é pago por aba. → Medir antes e depois (tarefas 1.1 e 6.2). Se o ganho for pequeno, o próximo passo é reduzir o trabalho por mensagem, o que exige revisar o requisito que proíbe agregação.
- **[Aba que morre sem `pagehide`]** Uma aba que trava deixa assinaturas órfãs enquanto outras seguem abertas. → Efeito limitado: o registro é limpo na próxima reconexão, e o navegador encerra o worker quando todas as abas fecham. Web Locks resolveria, mas não compensa a complexidade agora.
- **[Snapshots redundantes]** Em cada reconexão, cada aba assina `quote`, e o estado completo é entregue a todas as assinantes. → Custo só no evento raro de reconexão e proporcional ao número de abas, normalmente pequeno.
- **[Versões diferentes de build]** A URL do worker leva hash em produção, então abas de builds diferentes usam workers diferentes e, com isso, conexões diferentes. → Desejável: evita misturar versões do protocolo aba↔worker.
- **[Sem SharedWorker, sem dados]** Navegadores sem o recurso ficam sem dados. → Decisão explícita, comunicada pelo painel de status.

## Migration Plan

Sem migração de dados. O rollback é reverter o commit: a API do `MarketSocket` não muda.
