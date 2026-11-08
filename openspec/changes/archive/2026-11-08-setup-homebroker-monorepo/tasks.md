# Tasks

## 1. Workspace

- [x] 1.1 Criar `package.json` na raiz com `packageManager: pnpm@12.14.0`, `engines.node >=24.15.0`, Turborepo e os scripts `dev`, `build` e `test`, e `pnpm-workspace.yaml` com `apps/*`; verificar que `pnpm install` termina com sucesso
- [x] 1.2 Criar `turbo.json` com as tarefas `build`, `test` e `dev` conforme o design, incluindo `passThroughEnv` em `dev`; verificar com `pnpm turbo run build --dry-run` que a configuração é aceita
- [x] 1.3 Adicionar `.angular/` ao `.gitignore` da raiz; verificar com `git check-ignore apps/web/.angular` que o caminho é ignorado

## 2. Base do servidor e protocolo

- [x] 2.1 Criar `apps/server` (pacote ESM `server`) com TypeScript `~6.0.3`, `ws`, `tsx`, Vitest e os scripts `dev`, `build` e `test`; verificar que `pnpm turbo run build --filter=server` gera `apps/server/dist`
- [x] 2.2 Implementar em `src/protocol.ts` os tipos das mensagens e a validação de `subscribe` e `unsubscribe`, com testes para JSON malformado, `type` desconhecido, canal desconhecido e ativo desconhecido; verificar que `pnpm turbo run test --filter=server` passa

## 3. Simulação de mercado

- [x] 3.1 Implementar em `src/market/simulator.ts` o catálogo de ao menos cinco ativos fictícios, o ciclo de preços em centavos e a geração de cotações, com aleatoriedade injetável; verificar com testes de muitos ciclos com semente fixa as relações de preço, o limite de 1%, o arredondamento e o volume não decrescente
- [x] 3.2 Adicionar a geração do book ao simulador; verificar com testes os cinco níveis por lado, a ordenação estrita, o book não cruzado e a igualdade das melhores ofertas com `bid` e `ask` da cotação
- [x] 3.3 Implementar em `src/market/portfolio.ts` a conta simulada com ao menos três posições; verificar com testes as fórmulas, os totais, o `lastPrice` igual ao `last` e as quantidades fixas

## 4. Gateway WebSocket

- [x] 4.1 Implementar em `src/gateway.ts` as conexões, o `welcome`, a assinatura e o cancelamento por cliente, o estado inicial e as respostas de erro, com limite de 16 KiB por mensagem recebida; verificar com testes usando clientes WebSocket reais os cenários de `market-data-socket`
- [x] 4.2 Adicionar ao gateway o ciclo de publicação na ordem cotações, book e posições (estas a cada dois ciclos); verificar com testes a filtragem por ativo, a ordem das mensagens, a frequência mínima de cada canal e a continuidade após outro cliente desconectar
- [x] 4.3 Implementar `src/main.ts` com `PORT` (padrão `8080`), `HOST` (padrão `127.0.0.1`) e encerramento limpo em `SIGINT` e `SIGTERM`; verificar iniciando o build com e sem `PORT=9090`, recebendo o `welcome` em cada porta e confirmando que o processo termina ao receber `SIGTERM`

## 5. Base do Angular

- [x] 5.1 Gerar `apps/web` com `pnpm dlx @angular/cli@22.2.6 new web --directory apps/web --skip-git --skip-install --package-manager pnpm --ssr=false --defaults`, fixar TypeScript `~6.0.3`, desligar a telemetria em `angular.json` e rodar `pnpm install` na raiz; verificar que `pnpm turbo run build --filter=web` gera os arquivos em `apps/web/dist`
- [x] 5.2 Substituir o conteúdo de exemplo por uma página com o nome do homebroker, sem conexão ao WebSocket, ajustar o teste inicial para verificar esse nome e definir o script `test` como `ng test --watch=false`; verificar que `pnpm turbo run test --filter=web` passa e termina sozinho

## 6. Integração e documentação

- [x] 6.1 Executar `pnpm build` duas vezes sem alterações e `pnpm test`; verificar que a segunda execução de build informa cache em todos os projetos e que os testes terminam com sucesso
- [x] 6.2 Executar `pnpm dev` e abrir a aplicação no navegador; verificar que a página do homebroker aparece, que `ws://localhost:8080` envia o `welcome` e que uma assinatura de `quote`, `book` e `positions` recebe dados
- [x] 6.3 Atualizar o `CLAUDE.md` com os comandos, a estrutura do monorepo e a arquitetura do servidor, removendo a seção de projeto vazio; verificar que os comandos documentados executam como escrito
- [x] 6.4 Executar `openspec validate setup-homebroker-monorepo --strict`; verificar que a validação passa

## Workflow follow-up

- Revisar e arquivar a change com `/opsx:archive` depois de concluída a implementação.
