# Proposal

## Why

O servidor já publica cotações, book de ofertas e posições por WebSocket, mas `apps/web` é apenas uma página com o nome do homebroker e não consome nenhum desses dados. Esta change liga o frontend ao socket e mostra cada feed em tempo real, cobrindo também os casos de erro e de queda da conexão.

## What Changes

- Adiciona uma camada de dados em `apps/web` com uma única conexão WebSocket, reconexão automática com backoff, detecção de conexão silenciosa e encerramento limpo.
- Adiciona um estado em tempo real baseado em signals, atualizado a partir das mensagens do socket e reassinado a cada `welcome`.
- Adiciona um componente Angular para cada nó, entendendo nó como um feed de dados em tempo real: status da conexão, cotações, book de ofertas e carteira.
- Adiciona o Tailwind CSS à aplicação, pelo caminho PostCSS documentado para Angular, e constrói a interface somente com classes utilitárias.
- Exibe na tela o estado de cada feed: aguardando dados, atualizado e desatualizado após uma queda da conexão.
- Formata os valores monetários em reais e no padrão `pt-BR`.
- Muda a porta padrão do servidor de `8080` para `8090`, porque a `8080` entra em conflito com uma regra de encaminhamento do Windows no ambiente WSL2 de desenvolvimento.
- **BREAKING** (de spec): remove o requisito de `web-app-base` que proibia a aplicação de abrir conexões com o WebSocket.

Fora do escopo:

- Envio de ordens, autenticação, gráficos e histórico de preços.
- Mudanças no protocolo do servidor.
- Pacote compartilhado de tipos entre `apps/server` e `apps/web`.
- Mudança do toolchain do frontend. O projeto continua com Angular CLI, `ng serve`, `ng build` e `ng test`.

A solicitação original citava o ng-native. Ela foi substituída pelo Tailwind CSS por decisão do usuário, porque o ng-native exige trocar os builders do Angular CLI por Vite para rodar no navegador, e a base do projeto deve permanecer como está.

## Capabilities

### New Capabilities

- `market-data-client`: conexão do frontend com o socket, ciclo de vida da conexão, assinatura de canais, estado em tempo real e tratamento de erros e de desconexão.
- `market-dashboard`: componentes visuais que mostram cada feed em tempo real e o estado de cada um.

### Modified Capabilities

- `web-app-base`: remove o requisito "Sem conexão com o servidor nesta etapa", pois esta é a change futura prevista por ele.
- `market-data-socket`: a porta padrão passa de `8080` para `8090`.

## Impact

- **Código**: `apps/web/src/app` ganha `market-data/` e `market/`; `app.config.ts`, `app.ts` e `app.html` passam a iniciar a conexão e a compor os componentes. Em `apps/server`, muda apenas a porta padrão.
- **Dependências**: `tailwindcss`, `@tailwindcss/postcss` e `postcss` em `apps/web`.
- **Configuração**: novo `apps/web/.postcssrc.json` e import do Tailwind em `apps/web/src/styles.css`.
- **Documentação**: `README.md` e `CLAUDE.md` deixam de afirmar que o frontend não se conecta ao servidor.
- **Execução**: com o servidor desligado, a aplicação abre normalmente, mas tenta reconectar em segundo plano.
