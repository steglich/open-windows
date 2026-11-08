# Tasks

## 1. Tailwind e formatação

- [x] 1.1 Adicionar `tailwindcss`, `@tailwindcss/postcss` e `postcss` como dependências de desenvolvimento de `apps/web` com `pnpm --filter web add -D`, e verificar que `pnpm install` termina sem build script rejeitado, ajustando `allowBuilds` somente se o pnpm exigir.
- [x] 1.2 Criar `apps/web/.postcssrc.json` e adicionar `@import "tailwindcss";` a `apps/web/src/styles.css`, e verificar com `pnpm --filter web build` que o CSS gerado contém as classes utilitárias usadas em um template.
- [x] 1.3 Configurar `LOCALE_ID` `pt-BR`, `DEFAULT_CURRENCY_CODE` `BRL` e `registerLocaleData` em `app.config.ts`, e verificar que `pnpm --filter web test` continua passando.

## 2. Conexão com o socket

- [x] 2.1 Criar `market-data/market-protocol.ts` com os tipos de `apps/server/src/protocol.ts` e o comentário apontando a origem, e verificar com `pnpm --filter web build`.
- [x] 2.2 Criar `market-data/testing/fake-web-socket.ts`, sem globais do Vitest porque o arquivo entra no `tsconfig.app.json`, e verificar com `pnpm --filter web build`.
- [x] 2.3 Implementar `MarketSocket` com o token `MARKET_SOCKET_URL`, os estados da conexão, o `Subject` de mensagens e o descarte de frames inválidos, e verificar com testes em `market-socket.spec.ts` para `connecting` até o `welcome`, `connected` e frame malformado.
- [x] 2.4 Implementar em `MarketSocket` a reconexão com espera de 1 s a 30 s e o desligamento dos handlers do socket descartado, e verificar com testes de timers falsos para a sequência de esperas, o reinício após `welcome` e a ausência de reconexão dupla.
- [x] 2.5 Implementar em `MarketSocket` a detecção de conexão silenciosa de 5 s e o encerramento via `DestroyRef`, e verificar com testes para silêncio, fluxo normal e destruição com conexão aberta e durante a espera.

## 3. Estado em tempo real

- [x] 3.1 Implementar `MarketStore` com os signals somente leitura, a aplicação de `quote`, `book` e `positions`, e `stale`, e verificar com testes em `market-store.spec.ts` para substituição por ativo, ordem de `quoteRows` e `stale` durante a queda.
- [x] 3.2 Implementar em `MarketStore` as assinaturas a cada `welcome` e a escolha do ativo selecionado, e verificar com testes para primeira conexão, `book` apenas do ativo selecionado, reconexão mantendo o ativo e ativo que deixou de existir.
- [x] 3.3 Implementar `select()` com o descarte de `book` de outro ativo, e verificar com testes para troca conectada, troca desconectada e mensagem atrasada.
- [x] 3.4 Implementar em `MarketStore` o `lastError` com limpeza no `welcome` e no `subscribed`, e verificar com testes que a conexão e os dados seguem ativos após `error`.
- [x] 3.5 Iniciar a conexão com `provideAppInitializer` em `app.config.ts`, e verificar com teste do `start()` que ele não retorna Promise e abre uma única conexão.

## 4. Componentes visuais

- [x] 4.1 Criar `FeedPanel` e `SignedValue` em `market/shared`, e verificar com testes dos avisos de aguardando e desatualizado, e de sinal e cor para valores positivos, negativos e zero.
- [x] 4.2 Criar `ConnectionStatusPanel`, e verificar com testes do texto de cada estado da conexão e da exibição de código e mensagem de erro.
- [x] 4.3 Criar `QuotesPanel`, e verificar com testes que cada ativo aparece uma vez com todos os campos, que a tela muda com nova cotação e que a seleção funciona por clique e por Enter, com a linha destacada.
- [x] 4.4 Criar `OrderBookPanel`, e verificar com testes da ordem dos níveis dos dois lados, da atualização e do aviso de aguardando após trocar de ativo.
- [x] 4.5 Criar `PortfolioPanel`, e verificar com testes dos totais, de todas as posições e da atualização, incluindo a formatação `R$ 1.234,50` com o espaço não separável normalizado.
- [x] 4.6 Compor os quatro painéis em `App` com layout em classes utilitárias, mantendo o título, e verificar com `app.spec.ts` que o título e os quatro painéis aparecem sem abrir conexão.

## 5. Documentação

- [x] 5.1 Atualizar `README.md` (linhas sobre o frontend não se conectar ao servidor) e `CLAUDE.md` (descrição de `apps/web`) para refletir o consumo do socket, e verificar com busca que nenhuma afirmação antiga permanece.

## 6. Integração

- [x] 6.1 Executar `pnpm build` e `pnpm test` na raiz, e verificar que todos os projetos passam.
- [x] 6.2 Com `pnpm dev`, abrir a aplicação no navegador e verificar que os quatro painéis atualizam e que a troca de ativo muda o book.
- [x] 6.3 Parar o servidor com a aplicação aberta e subi-lo de novo, e verificar o aviso de dados desatualizados, o status de reconexão e a volta automática dos dados.

## 7. Porta padrão

- [x] 7.1 Trocar a porta padrão de `8080` para `8090` no servidor, no frontend, na documentação e na spec, e verificar com `pnpm test` e uma conexão real feita a partir do Windows em `ws://127.0.0.1:8090`.

## Workflow follow-up

- Arquivar a change com `/opsx:archive` depois da revisão da implementação.
