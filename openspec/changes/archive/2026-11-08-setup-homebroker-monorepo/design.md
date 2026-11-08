# Design

## Context

O repositório só contém um `.gitignore` e a estrutura do OpenSpec. O ambiente de desenvolvimento é WSL2 com Node 24.16 e pnpm 12.14. O `ng` encontrado no `PATH` é o binário instalado no Windows (`/mnt/c/...`), portanto não deve ser usado dentro do WSL.

A motivação está em `proposal.md`, e o contrato do protocolo e dos dados está nas specs desta change.

## Goals / Non-Goals

**Goals:**

- Manter o servidor simples, sem frameworks, com a simulação testável sem depender de tempo real nem de aleatoriedade.
- Garantir que cotação, book e posições sejam coerentes entre si em qualquer instante.
- Deixar o Angular pronto para receber as telas, sem antecipar decisões sobre elas.

**Non-Goals:**

- Escalar para muitos clientes ou tratar clientes lentos.
- Modelar regras reais de mercado, como leilões, horário de pregão ou casamento de ordens.
- Configurar lint e CI, que podem ser adicionados depois sem afetar esta estrutura.

## Decisions

### Estrutura do workspace

```
apps/
  server/   Node + TypeScript (pacote "server")
  web/      Angular (pacote "web")
package.json, pnpm-workspace.yaml, turbo.json
```

Tarefas do `turbo.json`:

| Tarefa | Configuração |
| --- | --- |
| `build` | `outputs: ["dist/**"]` |
| `test` | sem saídas em cache |
| `dev` | `cache: false`, `persistent: true`, `passThroughEnv: ["PORT", "HOST"]` |

O `passThroughEnv` é necessário porque o Turborepo filtra variáveis de ambiente por padrão, e sem ele `PORT` não chegaria ao servidor.

### pnpm como gerenciador de pacotes

O pnpm já está instalado, é suportado pelo Turborepo e pelo Angular CLI, e evita dependências fantasmas entre os projetos. A versão fica fixada no campo `packageManager`, exigido pelo Turborepo. A alternativa, npm workspaces, funcionaria, mas sem esse isolamento.

### `ws` em vez de Socket.IO

O servidor usa WebSocket puro com a biblioteca `ws`. O frontend poderá consumi-lo com `webSocket` do RxJS, que já vem com o Angular, sem cliente adicional, e o protocolo pode ser testado com qualquer ferramenta de WebSocket. O Socket.IO traria salas e reconexão automática, mas também um protocolo próprio e uma dependência no cliente, o que não se justifica para um simulador.

### Versões

- **TypeScript `~6.0.3` nos dois projetos:** a versão mais recente é a 7.x, mas o Angular 22.2 exige `>=6.0 <6.1`.
- **Angular 22.2:** versão estável atual, compatível com o Node 24.16.
- **Vitest nos dois projetos:** padrão do Angular nesta versão, o que evita manter dois executores de teste.

### Módulos do servidor

| Módulo | Responsabilidade |
| --- | --- |
| `src/main.ts` | Lê `PORT` e `HOST`, inicia o servidor e encerra de forma limpa em `SIGINT` e `SIGTERM` |
| `src/protocol.ts` | Tipos das mensagens e validação das mensagens recebidas |
| `src/market/simulator.ts` | Catálogo, estado dos preços e geração de cotações e book |
| `src/market/portfolio.ts` | Conta simulada e cálculo das posições |
| `src/gateway.ts` | Conexões, assinaturas por cliente e publicação |

Há três scripts: `dev` com `tsx watch`, `build` com `tsc` para `dist/` e `test` com `vitest run`. O pacote é ESM.

### Um único simulador e um único ciclo

Um simulador por processo avança em um ciclo de 500 ms. Em cada ciclo, o gateway atualiza os preços e publica nesta ordem: cotações, book e, a cada dois ciclos, posições. Todos os dados vêm do mesmo estado, o que atende aos requisitos de coerência e de ordem das specs. A alternativa, um temporizador por canal, permitiria publicar um book com preços diferentes dos da cotação.

O simulador roda mesmo sem clientes, o que mantém o volume e os preços contínuos e evita controlar o início e a parada do temporizador.

### Preços em centavos inteiros

O estado guarda preços como inteiros em centavos e converte para reais apenas ao montar as mensagens, evitando erros de ponto flutuante nas relações exigidas pelas specs.

A cada ciclo, o preço anda aleatoriamente no máximo 0,5%, abaixo do limite de 1% da spec, e não cai abaixo de metade do preço de abertura. O book é derivado do preço atual: o `bid` e o `ask` ficam a uma distância de 1 a 3 centavos do `last`, e cada nível seguinte se afasta 1 a 5 centavos.

### Dependências injetáveis para testes

O gateway e o simulador recebem por opções a porta (`0` nos testes), o intervalo do ciclo e a função de números aleatórios. Assim, os testes usam semente fixa e ciclos curtos, com clientes WebSocket reais.

### Tipos do protocolo no servidor

Os tipos ficam em `apps/server/src/protocol.ts` por enquanto. Um pacote compartilhado em `packages/` só traria benefício quando o Angular consumir o protocolo, e a extração é simples nessa change futura.

### Base do Angular

A aplicação é gerada com o CLI na versão fixada, por `pnpm dlx`, sem git, SSR ou instalação própria. O conteúdo de exemplo é substituído por uma página com o nome do homebroker. O script `test` usa `ng test --watch=false` para terminar ao final, e a telemetria do CLI fica desligada em `angular.json`, para que o CLI não pare em uma pergunta interativa dentro do Turborepo.

## Risks / Trade-offs

- **O servidor não tem autenticação nem verificação de origem** → escuta em `127.0.0.1` por padrão, publica apenas dados fictícios e limita o tamanho das mensagens recebidas a 16 KiB.
- **O navegador no Windows pode não alcançar o servidor no WSL2** → o encaminhamento de `localhost` do WSL2 costuma resolver; caso contrário, usar `HOST=0.0.0.0`.
- **Clientes lentos podem acumular mensagens em memória** → aceitável para uso local, conforme os Non-Goals.
- **O pnpm pode bloquear scripts de instalação de dependências como o `esbuild`** → liberar explicitamente os pacotes necessários na configuração do workspace.
- **Testes com sockets reais podem ficar instáveis por causa de tempo** → usar ciclos curtos e aguardar mensagens específicas, em vez de esperas fixas.
