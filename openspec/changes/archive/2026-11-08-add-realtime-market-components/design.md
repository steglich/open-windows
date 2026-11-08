# Design

## Context

Veja `proposal.md` para a motivação e as specs desta change para os requisitos.

`apps/web` é uma aplicação Angular 22 zoneless (sem `zone.js`), criada pelo Angular CLI, com um único componente raiz `App`, rotas vazias e testes em Vitest com jsdom pelo builder `@angular/build:unit-test`. Os arquivos seguem o padrão atual do Angular, sem sufixo `.component` (`app.ts`, classe `App`).

O contrato do socket está em `apps/server/src/protocol.ts`, `apps/server/src/gateway.ts` e nas specs `market-data-socket`, `quote-feed`, `order-book-feed` e `position-feed`. Não há evento sem documentação:

| Mensagem | Direção | Quando chega | Conteúdo |
| --- | --- | --- | --- |
| `welcome` | servidor → cliente | uma vez, ao conectar | `channels`, `symbols` |
| `subscribed` / `unsubscribed` | servidor → cliente | resposta a cada assinatura ou cancelamento | `channel`, `symbols` (`[]` em `positions`) |
| `quote` | servidor → cliente | logo após assinar e a cada 500 ms, por ativo | `timestamp`, `data: Quote` |
| `book` | servidor → cliente | logo após assinar e a cada 500 ms, por ativo | `timestamp`, `data: OrderBook` |
| `positions` | servidor → cliente | logo após assinar e a cada 1000 ms | `timestamp`, `data: Portfolio` |
| `error` | servidor → cliente | resposta a uma mensagem inválida | `code`, `message` |
| `subscribe` / `unsubscribe` | cliente → servidor | sob demanda | `channel`, `symbols?` |

Três características do protocolo moldam o desenho:

- As assinaturas valem por conexão, então são perdidas a cada reconexão.
- O servidor não tem heartbeat, e `error` não indica qual pedido falhou.
- Mensagens chegam em rajadas: a cada ciclo, todos os ativos em sequência. Com 6 ativos, são cerca de 15 mensagens por segundo no total.

## Goals / Non-Goals

**Goals:**

- Um ponto único para conexão e um ponto único para estado, com componentes que apenas leem signals.
- Cobrir queda, falha de conexão, conexão silenciosa, erros do servidor e frames inválidos.
- Manter a base do projeto intacta: Angular CLI, builders, TypeScript e scripts continuam iguais.

**Non-Goals:**

- Roteamento entre telas: os painéis ficam na página inicial.
- Validação completa de esquema das mensagens: o servidor é do próprio projeto, então só `JSON` e `type` são verificados.
- Otimização de renderização além do `track` por chave nas listas.

## Decisions

### 1. Nó é um feed de dados, com um componente por feed

Decisão confirmada pelo usuário, já que o termo não existe no projeto. Cada componente consome somente os dados do seu feed, por meio do store:

| Componente | Mensagens de origem | Frequência | Dados lidos do store |
| --- | --- | --- | --- |
| `ConnectionStatusPanel` | `welcome`, `error`, `subscribed`, eventos do socket | eventual | `status`, `lastError` |
| `QuotesPanel` | `welcome`, `quote` | 500 ms por ativo | `quoteRows`, `selectedSymbol`, `stale` |
| `OrderBookPanel` | `book` | 500 ms, só do ativo selecionado | `book`, `selectedSymbol`, `stale` |
| `PortfolioPanel` | `positions` | 1000 ms | `portfolio`, `stale` |

`book` é assinado para um único ativo, e não para todos, pois a tela só exibe um book por vez. A seleção é feita na lista de cotações.

### 2. Estrutura de pastas e nomes

```text
apps/web/src/app/
  market-data/                    # sem UI: protocolo, conexão e estado
    market-protocol.ts            # tipos das mensagens
    market-socket.ts              # MarketSocket: ciclo de vida da conexão
    market-store.ts               # MarketStore: estado em signals
    testing/fake-web-socket.ts
  market/                         # componentes visuais
    connection-status-panel/connection-status-panel.{ts,html,spec.ts}
    quotes-panel/quotes-panel.{ts,html,spec.ts}
    order-book-panel/order-book-panel.{ts,html,spec.ts}
    portfolio-panel/portfolio-panel.{ts,html,spec.ts}
    shared/
      feed-panel/feed-panel.{ts,html,spec.ts}       # moldura, título e avisos de estado
      signed-value/signed-value.{ts,html,spec.ts}   # sinal e cor de ganho ou perda
```

Convenções: uma pasta por componente, arquivos em kebab-case sem sufixo `.component`, seletor `app-<nome>` e template em `.html`, como em `App`. O sufixo `Panel` evita conflito com os tipos `OrderBook` e `Portfolio` do protocolo.

`FeedPanel` e `SignedValue` existem para atender ao critério de não duplicar lógica. Os três feeds precisam dos mesmos avisos e dois deles da mesma regra de sinal e cor.

### 3. Estado com signals em um serviço único

`MarketStore` é um serviço `providedIn: 'root'` com signals privados graváveis e exposição somente leitura: `status`, `lastError`, `symbols`, `selectedSymbol`, `quoteRows`, `book`, `portfolio` e `stale`.

- O store guarda cotações em um objeto imutável indexado por ativo; `quoteRows` é um `computed` que segue a ordem de `symbols`. Um ativo ausente do `welcome` deixa de aparecer sem limpeza extra.
- `stale` é `computed(() => status() !== 'connected')`.
- O Angular zoneless agrupa as mudanças de signals de uma rajada em uma única renderização.

Entre `MarketSocket` e `MarketStore`, as mensagens passam por um `Subject` do RxJS, e não por um signal. Um signal guarda só o último valor, então mensagens de uma mesma rajada seriam perdidas.

Alternativas: NgRx foi descartado por ser uma dependência nova para quatro leitores de um único fluxo. `BehaviorSubject` com `async` funcionaria, mas signals são o padrão do Angular atual e dispensam assinatura nos componentes.

### 4. Ciclo de vida da conexão

- **Inicialização**: `provideAppInitializer(() => inject(MarketStore).start())` em `app.config.ts`, sem retornar Promise, para não atrasar a abertura da página. Como fica fora dos componentes, os testes de componente não abrem conexão. A URL vem do token `MARKET_SOCKET_URL`, com padrão `ws://127.0.0.1:8090`.
- **Assinatura**: o `welcome` é o único gatilho. Isso resolve a primeira conexão e as reconexões com o mesmo código. `quote` é enviado sem `symbols`, o que assina todos os ativos.
- **Troca de ativo**: `select()` limpa o book e envia `unsubscribe` e `subscribe` se a conexão estiver ativa. Sem conexão, só muda a seleção, e o próximo `welcome` assina o novo ativo. Mensagens `book` de outro ativo são descartadas.
- **Reconexão**: `close` agenda nova tentativa com espera `min(1000 * 2^n, 30000)` ms, sem limite de tentativas; `n` zera no `welcome`. O evento `error` do socket não faz nada, porque é sempre seguido de `close`.
- **Conexão silenciosa**: um `setInterval` de 1 s, ativo somente em `connected`, compara o instante da última mensagem. Após 5 s sem mensagens, o socket é descartado e a reconexão começa. O limite equivale a 5 publicações de `positions`.
- **Socket antigo**: handlers de um socket descartado são desligados antes do `close()`, para que eventos atrasados não disparem uma segunda reconexão.
- **Encerramento**: `DestroyRef` do injetor raiz chama `disconnect()`, que cancela timers, fecha com código `1000` e passa a `closed`. Ao fechar a aba, o próprio navegador encerra o socket.
- **Envio**: `send()` com o socket fechado é ignorado sem erro, pois o próximo `welcome` refaz as assinaturas.

### 5. Tailwind CSS pelo caminho PostCSS oficial

O ng-native foi avaliado e descartado por decisão do usuário. Ele exige Vite no lugar dos builders do Angular CLI para rodar no navegador, sua documentação não indica o host web como alvo de deploy e ele oferece apenas primitivos.

O Tailwind segue o guia oficial para Angular: `tailwindcss`, `@tailwindcss/postcss` e `postcss`, `.postcssrc.json` e `@import "tailwindcss"` em `styles.css`. Os builders não mudam. Os componentes usam somente classes utilitárias e HTML semântico (`table`, `section`, `button`), sem `styleUrl` nem CSS próprio.

### 6. Formatação

`LOCALE_ID` como `pt-BR`, `DEFAULT_CURRENCY_CODE` como `BRL` e `registerLocaleData` em `app.config.ts`, com `CurrencyPipe` e `DecimalPipe` nos templates. A web só exibe os valores recebidos, sem cálculos. `changePercent` e `unrealizedPnlPercent` já vêm em pontos percentuais, então usam `DecimalPipe` com `%` no texto, e não `PercentPipe`, que multiplicaria por 100.

### 7. Tipos copiados do servidor

`market-protocol.ts` copia somente os tipos de `apps/server/src/protocol.ts`, sem as funções. Importar direto de outro app ultrapassa os limites dos dois `tsconfig`, e um pacote compartilhado alteraria a base do workspace, o que está fora do escopo.

## Risks / Trade-offs

- [Tipos duplicados podem divergir do servidor] → O arquivo referencia a origem em comentário, e o protocolo é protegido pelas specs.
- [`error` não indica qual pedido falhou] → O painel de status exibe o erro de forma geral e o book continua no aviso de aguardando dados.
- [`127.0.0.1` pode não alcançar o servidor em alguns cenários de WSL2] → O README já orienta usar `HOST=0.0.0.0`, e o token permite trocar a URL.
- [Abas em segundo plano têm timers limitados pelo navegador] → A verificação compara horários e as mensagens continuam atualizando o último recebimento, portanto o atraso não gera falsa queda.
- [Socket aberto sem `welcome` fica em `connecting`] → Aceito: o servidor envia `welcome` logo ao aceitar a conexão.
- [Formatação `pt-BR` usa espaço não separável em `R$ 1.234,50`] → Os testes normalizam esse caractere antes de comparar.

## Migration Plan

Não há migração de dados. O deploy é o build normal do frontend, e o rollback é reverter o commit. No servidor, muda apenas a porta padrão.
