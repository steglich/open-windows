# Proposal

## Why

O repositório ainda está vazio, e o frontend do homebroker precisa de uma fonte de dados em tempo real para ser desenvolvido sem depender de corretora, feed de mercado ou banco de dados. Esta change cria a base do monorepo e um servidor que simula esse feed com dados fictícios.

## What Changes

- Criar um monorepo gerenciado pelo Turborepo, com scripts únicos na raiz para desenvolvimento, build e testes.
- Criar um servidor Node.js em TypeScript que expõe um WebSocket e publica dados fictícios em tempo real, sem banco de dados.
- Publicar pelo menos três tipos de informação: cotações, book de ofertas e posições de uma conta simulada.
- Criar a base de uma aplicação Angular, que compila e sobe pelo Turborepo.
- Fora do escopo por enquanto: consumo do WebSocket pelo Angular, telas de cotação, book ou posições, autenticação, envio de ordens e persistência. A implementação do frontend será planejada em uma change futura.

## Capabilities

### New Capabilities

- `workspace-tooling`: organização do monorepo e tarefas de desenvolvimento, build e teste orquestradas pelo Turborepo.
- `market-data-socket`: conexão WebSocket, formato das mensagens, assinatura de canais e tratamento de mensagens inválidas.
- `quote-feed`: publicação em tempo real de cotações fictícias por ativo.
- `order-book-feed`: publicação em tempo real do book de ofertas fictício por ativo.
- `position-feed`: publicação em tempo real das posições de uma conta simulada, avaliadas pelos preços simulados.
- `web-app-base`: aplicação Angular inicial integrada ao monorepo.

### Modified Capabilities

Nenhuma. Ainda não existem specs no projeto.

## Impact

- **Código:** novos projetos em `apps/server` e `apps/web`, além dos arquivos de workspace na raiz.
- **APIs:** novo protocolo WebSocket com mensagens JSON, usado pelo frontend em uma change futura.
- **Dependências:** Turborepo, pnpm workspaces, TypeScript, `ws` e Angular.
- **Sistemas externos:** nenhum. Todos os dados são gerados em memória.
- **Documentação:** o `CLAUDE.md` passa a registrar os comandos e a arquitetura reais do projeto.
