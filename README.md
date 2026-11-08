# Open Windows Homebroker

Monorepo de um homebroker simulado. Um servidor Node.js publica por WebSocket cotações, book de ofertas e posições em tempo real, e uma aplicação Angular exibe esses dados na tela.

> [!NOTE]
> Todos os dados são fictícios e gerados em memória. Não há conexão com corretoras, bolsas ou feeds de mercado.

O frontend se conecta ao servidor em `ws://127.0.0.1:8090` e mostra o status da conexão, as cotações, o book de ofertas do ativo selecionado e a carteira. Se a conexão cair, ele mantém os últimos dados marcados como desatualizados e reconecta sozinho.

## Requisitos

- Node.js 24.15 ou superior
- pnpm 12.14

## Como executar

```bash
pnpm install
```

```bash
pnpm dev
```

Com o ambiente no ar:

| Serviço | Endereço |
| --- | --- |
| Servidor WebSocket | `ws://127.0.0.1:8090` |
| Aplicação web | `http://localhost:4200` |

## Scripts

Execute na raiz do repositório. As tarefas são orquestradas pelo [Turborepo](https://turborepo.com).

| Comando | Descrição |
| --- | --- |
| `pnpm dev` | Sobe o servidor e o frontend em modo de desenvolvimento |
| `pnpm build` | Compila todos os projetos |
| `pnpm test` | Executa todos os testes uma vez |
| `pnpm turbo run dev --filter=server` | Executa uma tarefa em um único projeto (`server` ou `web`) |

## Configuração do servidor

| Variável | Padrão | Descrição |
| --- | --- | --- |
| `PORT` | `8090` | Porta do WebSocket |
| `HOST` | `127.0.0.1` | Endereço em que o servidor escuta |

O servidor não tem autenticação. Se usar WSL2 e o navegador no Windows não alcançar o servidor, inicie-o com `HOST=0.0.0.0`.

## Protocolo WebSocket

Todas as mensagens são objetos JSON enviados como texto, com um campo `type`. Ao conectar, o cliente recebe uma mensagem `welcome` com os canais e os ativos disponíveis, e só recebe dados dos canais que assinar.

### Exemplo

```js
const socket = new WebSocket('ws://127.0.0.1:8090');

socket.onopen = () => {
  socket.send(JSON.stringify({ type: 'subscribe', channel: 'quote', symbols: ['ALFA3'] }));
  socket.send(JSON.stringify({ type: 'subscribe', channel: 'positions' }));
};

socket.onmessage = ({ data }) => console.log(JSON.parse(data));
```

### Canais

| Canal | Frequência | Conteúdo de `data` |
| --- | --- | --- |
| `quote` | A cada 500 ms, por ativo | `symbol`, `last`, `bid`, `ask`, `open`, `high`, `low`, `previousClose`, `change`, `changePercent`, `volume` |
| `book` | A cada 500 ms, por ativo | `symbol` e cinco níveis em `bids` e `asks`, cada um com `price`, `quantity` e `orders` |
| `positions` | A cada 1 s | `accountId`, `totalMarketValue`, `totalUnrealizedPnl` e a lista `positions` |

Os ativos disponíveis são `ALFA3`, `BETA4`, `GAMA3`, `DELT11`, `OMEG3` e `SIGM4`. As mensagens de dados têm o formato `{ "type": <canal>, "timestamp": <milissegundos>, "data": { ... } }`.

### Mensagens do cliente

```json
{ "type": "subscribe", "channel": "quote", "symbols": ["ALFA3", "BETA4"] }
```

```json
{ "type": "unsubscribe", "channel": "quote", "symbols": ["ALFA3"] }
```

- Sem `symbols`, a operação vale para todos os ativos do canal. No canal `positions`, `symbols` é ignorado.
- O servidor confirma com `subscribed` ou `unsubscribed`. Depois de `subscribed`, envia o estado atual dos itens assinados.

### Erros

Mensagens inválidas recebem a resposta abaixo, e a conexão continua aberta.

```json
{ "type": "error", "code": "UNKNOWN_SYMBOL", "message": "Ativo desconhecido: XPTO9." }
```

| Código | Causa |
| --- | --- |
| `INVALID_MESSAGE` | JSON malformado, frame binário, `type` desconhecido ou campos inválidos |
| `UNKNOWN_CHANNEL` | Canal inexistente |
| `UNKNOWN_SYMBOL` | Ativo inexistente. Nenhum ativo da lista é assinado |

Mensagens acima de 16 KiB encerram a conexão com o código `1009`.

O contrato completo está nas specs de [`openspec/specs/`](openspec/specs/).

## Estrutura

```
apps/
  server/    Servidor WebSocket em Node.js e TypeScript
  web/       Aplicação Angular
openspec/    Especificações e histórico de mudanças
```

## Licença

Distribuído sob a [GNU Affero General Public License v3.0](LICENSE).
