# Tasks

## 1. Dashboard em rota própria

- [x] 1.1 Criar `market/dashboard/dashboard.{ts,html}` com o conteúdo atual de `App`, deixar `App` apenas com `router-outlet` e registrar em `app.routes.ts` a rota `''` para o `Dashboard` e `**` redirecionando para `''`; verificar com `pnpm --filter web exec ng build` sem erros.
- [x] 1.2 Mover os casos de `app.spec.ts` que tratam do dashboard para `market/dashboard/dashboard.spec.ts` e cobrir em `app.spec.ts` a renderização da rota `''`; verificar com `pnpm --filter web test`.

## 2. Abertura e retorno das janelas

- [x] 2.1 Criar `market/panel-windows/panel-catalog.ts` com id, slug, título e dimensões dos seis painéis, e verificar em spec que slugs e ids são únicos.
- [x] 2.2 Criar o serviço `PanelWindows` com `open`, `isDetached` e os signals `detached` e `blocked`; verificar em `panel-windows.spec.ts` os casos descritos na tarefa 8.2.
- [x] 2.3 Criar o token `IN_PANEL_WINDOW` e o componente `PanelWindowButton`, sem renderizar nada quando o token for `true`; verificar em spec o clique e a ausência do botão dentro da janela.
- [x] 2.4 Adicionar a `FeedPanel` o `input` opcional `windowPanel`, que exibe o botão, usá-lo nos cinco painéis de feed e colocar o botão em `ConnectionStatusPanel`; verificar nos specs de `feed-panel` e `connection-status-panel`.

## 3. Janela de painel

- [x] 3.1 Criar `PanelWindowPage` com `@switch` dos seis painéis, `IN_PANEL_WINDOW` em `true` e título definido pelo catálogo, e registrar a rota `janela/:painel`; verificar em spec que cada slug renderiza somente o seu painel, sem botão de abrir, com o título correto.
- [x] 3.2 Redirecionar para `''` quando o slug não existir no catálogo; verificar em spec com `RouterTestingHarness` que um slug inválido exibe a página principal.

## 4. Dashboard reagindo às janelas

- [x] 4.1 Ocultar no `Dashboard` cada painel em janela, com a coluna de saldo/gráfico em largura total quando só um deles estiver presente e o contêiner da visão geral omitido quando nenhum estiver; verificar em `dashboard.spec.ts` a saída e o retorno do painel na mesma posição e a classe de largura total.
- [x] 4.2 Tornar os itens da barra lateral um `computed` que omite as seções sem painéis visíveis; verificar em spec que cada item restante leva a uma seção existente, inclusive com seção parcialmente em janela.
- [x] 4.3 Exibir o aviso de janela bloqueada e a mensagem de todos os painéis em janelas; verificar os dois casos em `dashboard.spec.ts`.

## 5. Tema entre janelas

- [x] 5.1 Fazer `ThemeStore` escutar o evento `storage` da chave do tema, aplicando o valor a `dataset` e ao signal sem gravar novamente e ignorando valores inválidos; verificar em `theme-store.spec.ts` despachando `StorageEvent`.

## 6. Documentação e verificação integrada

- [x] 6.1 Atualizar a seção "Web architecture" do `CLAUDE.md` com as rotas e o funcionamento de `PanelWindows`, e verificar que os nomes citados existem no código.
- [x] 6.2 Executar `pnpm test` e `pnpm build` na raiz e verificar que ambos terminam com sucesso e dentro do budget do bundle inicial.
- [x] 6.3 Com `pnpm dev`, verificar no navegador: abrir cada painel em janela e vê-lo sumir da página, fechar e vê-lo voltar, recarregar a janela sem o painel voltar, recarregar a página principal fechando as janelas, trocar o tema com janela aberta e confirmar uma única conexão no servidor.

## 7. Assinaturas por demanda

- [x] 7.1 Adicionar `setFeeds` ao `MarketStore`, com assinaturas calculadas a partir dos dados em uso e do ativo selecionado, descarte dos dados sem uso e mensagens atrasadas ignoradas; verificar em `market-store.spec.ts` os cenários de cada canal, a troca de ativo e o retorno de um dado.
- [x] 7.2 Declarar os `feeds` no catálogo e chamar `setFeeds` no `Dashboard` e na `PanelWindowPage`; verificar em `dashboard.spec.ts` e `panel-window-page.spec.ts` o que cada documento envia ao abrir e fechar janelas.
- [x] 7.3 Atualizar o `CLAUDE.md` e verificar no navegador, por documento, quais mensagens chegam com um painel em janela e depois que ele volta.

## 8. Processos separados com `noopener` e Web Locks

- [x] 8.1 Criar o token `PANEL_WINDOW_BRIDGE`, com `navigator.locks` e `BroadcastChannel`, e sua versão falsa para specs; verificar pelos specs que a usam.
- [x] 8.2 Migrar `PanelWindows` para `noopener`, `ready` por canal, espera da trava da janela e trava da página; verificar em `panel-windows.spec.ts` abertura, abertura repetida ignorada, retorno após a liberação, recarga dentro e fora do prazo, janela que não abre, aviso limpo por `ready` tardio e recurso indisponível.
- [x] 8.3 Fazer `PanelWindowPage` segurar a trava da janela, enviar `ready` depois de obtê-la e fechar quando a trava da página for liberada; verificar em `panel-window-page.spec.ts`, inclusive sem o parâmetro `pagina`.
- [x] 8.4 Fazer cada aba segurar uma trava enviada no `attach` e o `MarketHub` tratar a liberação como `detach`; verificar em `market-connection.spec.ts` e `market-hub.spec.ts`.
- [x] 8.5 Atualizar o `CLAUDE.md`, executar `pnpm test` e `pnpm build` na raiz e verificar no navegador processos separados, retorno ao fechar e ao travar, recarga da janela, fechamento junto com a página, janela que não abre e liberação no `MarketHub`.
