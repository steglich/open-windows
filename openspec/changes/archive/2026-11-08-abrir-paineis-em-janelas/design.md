# Design

## Context

Motivação em `proposal.md`, comportamento em `specs/`.

Estado atual relevante:

- O `App` contém todo o dashboard e as rotas estão vazias, embora `provideRouter` e `<router-outlet />` já existam. O `<base href="/">` e o fallback de SPA do servidor de desenvolvimento já servem qualquer caminho.
- `provideAppInitializer` chama `MarketStore.start()` em qualquer documento. O SharedWorker mantém uma conexão por origem, e `SharedWorkerMarketConnection` já faz `detach` no `pagehide`. Uma janela nova é, para a camada de dados, apenas mais uma aba, e sua conexão não exige mudança em `market-data/`.
- `MarketStore` é por documento, então o ativo selecionado já é independente por janela. Em `applyWelcome`, um documento sem seleção assume `symbols[0]`, o que dá o comportamento pedido para janela recém-aberta.
- `ThemeStore` só grava em `localStorage`. O script de `index.html` aplica o tema antes do bundle em qualquer documento, mas nada propaga uma troca para documentos já abertos.

## Goals / Non-Goals

**Goals:**

- Aproveitar a conexão compartilhada: uma janela é um documento Angular normal em outra rota.
- Manter os componentes de painel sem conhecimento de como estão sendo exibidos, exceto pelo controle de abrir.
- Isolar cada janela em seu próprio processo, sem que uma janela pesada atrase as demais.
- Descobrir o fim de janelas e páginas por eventos, sem consultar `closed` nem manter rotina periódica.

**Non-Goals:**

- Sincronizar seleção, persistir janelas após recarregar ou reconhecer janelas órfãs.
- Rastrear janelas abertas diretamente pelo endereço: quem digita a URL de um painel válido vê o painel, mas a página principal não o oculta, pois não foi ela quem abriu.

## Decisions

### Janela é uma rota da própria aplicação

Rotas: `''` para o novo `Dashboard` (`market/dashboard/`), com o conteúdo atual de `App`; `janela/:painel` para `PanelWindowPage`; `**` redireciona para `''`. `App` passa a ter só o `router-outlet`.

Um `canMatch` valida o parâmetro no catálogo de painéis (ver abaixo), de modo que um valor inválido cai no redirecionamento de `**`. `PanelWindowPage` define o título com o serviço `Title` e renderiza o painel com um `@switch`.

Alternativa descartada: mover o nó do DOM para uma janela vazia com `document.adoptNode` ou portal. Mantém um único documento, mas os estilos precisam ser copiados, o ApexCharts mede pelo `window` errado e a janela morre em qualquer recarga. Com rota, a janela pode ser recarregada sem nenhum tratamento especial.

### Janelas em processo próprio, com `noopener`

Janelas abertas com `opener` e da mesma origem dividem processo e thread principal: uma janela ocupada por 800 ms atrasava a página em 801 ms. Com `noopener`, medido, cada janela ganha um processo e o atraso cai para 4 ms. O trabalho total não diminui; o ganho é o isolamento.

Novo serviço raiz `PanelWindows` (`market/panel-windows/panel-windows.ts`). `open(panel)` chama `window.open('/janela/<slug>?pagina=<id>', '_blank', 'popup,noopener,width=W,height=H')`. O `id` é sorteado por documento e identifica a página dona da janela, para duas abas do dashboard não se misturarem.

Consequências do `noopener`, que não devolve referência (`window.open` retorna sempre `null`) nem preenche `window.opener`:

- O painel só sai da página ao chegar o `ready` da janela, e não ao clicar.
- Bloqueio é a ausência de `ready` em 5 s: o painel continua na página e o aviso é exibido. Um `ready` tardio remove o aviso e oculta o painel normalmente.
- `open` ignora o painel que já está em janela ou aguardando `ready`.

### Web Locks para o ciclo de vida, `BroadcastChannel` para o `ready`

Medido em 12 fechamentos de cada tipo, com janela em processo próprio:

| Como a janela terminou | `BroadcastChannel` no `pagehide` | Porta do SharedWorker no `pagehide` | Web Lock |
|---|---|---|---|
| Fechada pelo navegador | 12/12 | 12/12 | 12/12 |
| `window.close()` | 0/12 | 0/12 | 12/12 |
| Processo travou | 0/12 | 0/12 | 12/12 |

Uma mensagem enviada ao sair pode se perder quando o processo acaba, e a trava é liberada pelo navegador em qualquer caso. Nenhum documento consulta `closed` nem mantém rotina periódica.

- A janela segura `open-windows:panel:<id>:<painel>` enquanto existir e, já com a trava, envia `{ type: 'panel-window-ready', panel }` pelo canal `open-windows:panels:<id>`. A ordem garante que a página sempre encontra a trava ocupada ao esperar por ela.
- A página espera por essa trava. Quando a recebe, a janela acabou ou recarregou: ela inicia uma espera única de 1 s e, se chegar um `ready` nesse intervalo, o painel segue na janela. Ao terminar a espera, o painel volta.
- Um `ready` depois de o painel voltar o oculta de novo, corrigindo uma recarga mais lenta que a espera.
- A página segura `open-windows:page:<id>` enquanto existir e cada janela espera por ela para chamar `window.close()`. Isso cobre fechar, recarregar e travar a página principal, com um único mecanismo.

`navigator.locks` exige contexto seguro (HTTPS ou `localhost`). Sem ele ou sem `BroadcastChannel`, o controle de abrir em janela não é exibido, em vez de deixar painéis presos fora da página.

O acesso a esses recursos fica no token `PANEL_WINDOW_BRIDGE`, substituído nos specs porque o jsdom não os oferece.

Alternativas descartadas:

- Verificar `proxy.closed` por intervalo: exige referência da janela e monitoramento contínuo.
- `BroadcastChannel` também para o fechamento: não é entregue em parte dos fechamentos, conforme a tabela.
- Devolver o painel direto ao receber a trava, sem espera: ele piscaria na página a cada recarga da janela.

### Abas encerradas sem aviso no `MarketHub`

O `detach` no `pagehide` sofre da mesma perda. Sem ele, o hub manteria a porta e as assinaturas de um documento que não existe mais. Cada aba segura uma trava própria, enviada no `attach` depois de obtida, e o hub trata a liberação dela como `detach`. O `detach` explícito continua existindo, e os dois caminhos são idempotentes. Sem `navigator.locks`, vale só o `detach` explícito.

### Catálogo de painéis

`market/panel-windows/panel-catalog.ts` define, para cada painel, `id`, `slug` da rota, título da janela e dimensões iniciais. É a única fonte usada pela rota, pelo serviço e pelo dashboard. Slugs: `status`, `saldo`, `grafico`, `cotacoes`, `book`, `carteira`.

### Controle de abrir como componente próprio

`PanelWindowButton` (`market/panel-windows/`), com `input` do `id` do painel, chama `PanelWindows.open`. É usado em `FeedPanel` (novo `input` opcional `windowPanel`, ao lado do aviso de dados desatualizados) e em `ConnectionStatusPanel`.

Para não aparecer dentro da janela, usa o token `IN_PANEL_WINDOW` (default `false`, em `root`), que `PanelWindowPage` sobrescreve com `true` nos próprios `providers`. A injeção hierárquica evita que painéis ou o serviço consultem a URL. Os specs atuais de painel continuam funcionando sem alteração de providers.

### Composição do dashboard

`Dashboard` envolve cada painel em `@if (!windows.isDetached(id))`, então o painel é destruído ao sair e recriado ao voltar, na mesma posição do template. Como `MarketStore` não depende de nenhum painel, os dados recriados já estão em dia, e o gráfico é recriado por `app-apex-chart`.

- Colunas da seção de visão geral: `xl:col-span-5`/`7` valem somente quando os dois painéis estão presentes; caso contrário, `xl:col-span-12`. O contêiner `#visao-geral` só é renderizado com ao menos um painel.
- A barra lateral é um `computed` sobre `SECTIONS`, com cada seção listando os ids dos seus painéis e aparecendo se ao menos um estiver presente. O status fica no cabeçalho e não pertence a nenhuma seção.
- Quando todos os seis estão em janelas, é exibida uma mensagem no lugar das seções.
- O aviso de bloqueio é um `role="alert"` abaixo do cabeçalho.

### Assinaturas calculadas a partir dos dados em uso

O catálogo de painéis declara os `feeds` de cada painel: `status` nenhum, `account` a `account`, `chart` `selectedQuote` e `candles`, `quotes` a `quotes`, `book` a `book` e `portfolio` a `positions`. `MarketStore.setFeeds` recebe a soma dos painéis exibidos, chamada pelo `Dashboard` (efeito sobre as janelas abertas) e pela `PanelWindowPage` (o painel dela). Os componentes de painel continuam só lendo o store.

O store calcula as assinaturas desejadas a partir de `feeds` e do ativo selecionado e as compara com as atuais em um único ponto, enviando primeiro os cancelamentos e depois as assinaturas. `welcome`, troca de ativo e `setFeeds` passam todos por esse ponto. O conjunto inicial é vazio, para que um `welcome` recebido antes de a rota ativar não assine dados que o documento não usa.

Ao deixar de usar um dado, o store o descarta e ignora o que ainda chegar. Sem isso, um painel que volta mostraria valores antigos até a chegada do estado inicial. O custo é um instante de "Aguardando dados…" no retorno.

Alternativa descartada: cada componente de painel registrar a própria demanda ao ser criado. Acompanha o `@if` automaticamente, mas faz os componentes dirigirem assinaturas, o que o projeto evita.

### Tema propagado pelo evento `storage`

`ThemeStore` passa a escutar `storage` para a chave do tema e aplica o valor em `dataset` e no signal, sem gravar de novo. O evento é disparado apenas nos outros documentos da origem, portanto não há eco. As janelas não recebem o controle de tema, conforme a spec. Efeito colateral aceito: abas do dashboard também passam a acompanhar a troca.

## Risks / Trade-offs

- [Janela fechada antes de a aplicação iniciar nela nunca chega a oferecer `ready`] → O painel não sai da página e o aviso de janela não aberta é exibido.
- [Mais memória, com um processo de renderização por janela] → Custo aceito em troca do isolamento.
- [Em contexto não seguro o recurso fica indisponível] → O controle não é exibido e os painéis seguem na página.
- [Recarga da janela mais lenta que a espera de 1 s faz o painel reaparecer brevemente] → O `ready` tardio volta a ocultá-lo sem ação do usuário.
- [Timer da espera limitado em página oculta atrasa o retorno do painel] → Atraso sem efeito visível, pois a página não está à vista e o timer dispara ao menos uma vez.
- [Com o painel de cotações em janela, a página principal fica sem como trocar o ativo; book e gráfico em janela ficam no primeiro ativo] → Consequência aceita da seleção independente por janela, registrada na spec. Sincronização ou seletor podem vir em change própria.
- [Sem `localStorage` disponível, as janelas não acompanham a troca de tema] → Mesma limitação já aceita em `ThemeStore`; cada janela mantém o tema com que abriu.
- [Painéis têm alturas limitadas (`max-h-96`, gráfico com 300 px) e não preenchem janelas grandes] → Fora do escopo; as dimensões iniciais do catálogo são escolhidas para caber o conteúdo.
- [Em celulares, `popup` costuma abrir uma aba] → Funciona igual, com a aba fazendo o papel de janela.
