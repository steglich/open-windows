# Proposal

## Why

Todos os painéis do homebroker ficam presos a uma única página, o que impede o usuário de distribuir cotações, book, gráfico e carteira pelos seus monitores. Como a conexão com o mercado já vive em um SharedWorker compartilhado por todas as abas da origem, abrir um painel em outra janela não exige uma nova conexão com o servidor.

## What Changes

- Cada um dos seis painéis (status da conexão, saldo, gráfico de preço, cotações, book e carteira) passa a ter, na página principal, um controle para abri-lo em uma janela independente do navegador.
- A janela mostra somente aquele painel, atualizado em tempo real e no tema da página principal.
- Enquanto a janela estiver aberta, o painel some da página principal e as seções restantes se recompõem. Ao fechar a janela, o painel volta ao lugar original.
- Fechar ou recarregar a página principal fecha as janelas abertas por ela, e os painéis voltam ao lugar.
- Cada janela mantém o próprio ativo selecionado, como já acontece entre abas: selecionar um ativo em uma janela não afeta a página principal nem as demais janelas.
- Cada documento passa a assinar somente os dados dos painéis que exibe: o que vai para uma janela deixa de ser recebido pela página principal, e a janela recebe só o que o seu painel usa.
- Cada janela roda em processo próprio, sem que uma janela pesada atrase as demais, e o painel volta mesmo se a janela travar.
- Se a janela não abrir, por exemplo por bloqueio do navegador, o painel continua na página principal e o usuário é avisado.
- A troca de tema feita na página principal passa a valer também, sem recarregar, para as janelas abertas.
- Itens da barra lateral cujas seções estejam inteiramente em janelas deixam de ser exibidos.
- Fora do escopo: lembrar as janelas abertas depois de recarregar a página, sincronizar o ativo selecionado entre janelas, controle de seleção de ativo nas janelas de book e gráfico, botão de "devolver" dentro da janela (ela volta ao ser fechada) e layout específico para ocupar toda a altura da janela.

## Capabilities

### New Capabilities

- `panel-windows`: abertura de painéis em janelas independentes, com o painel saindo da página principal enquanto a janela estiver aberta e voltando quando ela for fechada.

### Modified Capabilities

- `market-data-client`: as assinaturas e a consulta de candles passam a depender dos painéis em uso em cada documento, e os dados sem uso são descartados.
- `market-dashboard`: a página deixa de exibir os painéis abertos em janelas, a barra lateral e o layout se ajustam a isso, e o tema passa a valer também para as janelas.

## Impact

- `apps/web/src/app/app.*`: o conteúdo atual do `App` vai para um novo componente de dashboard, e o `App` passa a conter somente o `router-outlet`.
- `apps/web/src/app/app.routes.ts`: novas rotas para a página principal e para a janela de cada painel.
- `apps/web/src/app/market/`: novo módulo de janelas de painel, controle de abertura em `FeedPanel` e no painel de status.
- `apps/web/src/app/theme/theme-store.ts`: passa a acompanhar mudanças de tema feitas em outras janelas.
- `apps/web/src/app/market-data/market-store.ts`: assinaturas calculadas a partir dos dados em uso.
- `apps/web/src/app/market-data/connection/`: o `MarketHub` libera abas encerradas sem aviso.
- Sem mudanças no servidor ou no protocolo, e sem novas dependências.
