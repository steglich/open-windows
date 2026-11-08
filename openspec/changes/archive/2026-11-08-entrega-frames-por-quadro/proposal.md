# Proposal

## Why

Mover a conexão para o SharedWorker aumentou em 6,1% o tempo de script da thread principal com uma aba, porque desserializar o objeto do `postMessage` custa mais que o `JSON.parse` que saiu dela: 21,1 µs contra 10,9 µs em um book de 4,5 KB, medidos no V8. Além disso, a aba processa cerca de 1850 mensagens por segundo, embora só consiga exibir uma atualização por quadro. Em um benchmark isolado, entregar a string original e aplicar as mensagens por quadro reduziu o custo de recepção e aplicação de 24,5 para 2,7 ms por segundo de tráfego.

## What Changes

- O SharedWorker continua fazendo o parse para validar e rotear, mas entrega à aba o texto original do frame em `quotes` de um único ativo, `book`, `candle`, `positions` e `account`.
- A aba guarda os frames recebidos e só os parseia e aplica ao estado no próximo quadro de renderização, com `requestAnimationFrame`.
- Entre dois quadros, vale só o frame mais recente de cada canal e ativo em `quotes`, `book`, `positions` e `account`.
- **O canal `candle` não perde mensagens**: todos os frames são aplicados, na ordem de chegada, dentro do quadro.
- `welcome`, `subscribed`, `error`, respostas com `requestId`, `quotes` com vários ativos e mudanças de estado da conexão continuam sem esperar o quadro, e antes delas os frames pendentes são aplicados.
- Em documento oculto, onde o `requestAnimationFrame` não dispara, um temporizador de reserva aplica os frames pendentes.
- **BREAKING** (de spec): a regra que proibia agregar ou atrasar mensagens por tempo passa a permitir a espera de até um quadro.
- Fora do escopo: alterações no servidor e no protocolo, deduplicação de mensagens repetidas pelo `timestamp` e formatos binários.

## Capabilities

### New Capabilities

Nenhuma.

### Modified Capabilities

- `market-data-client`: as mensagens de dados passam a ser aplicadas por quadro, com substituição pela mais recente exceto em `candle`, e o worker passa a entregar o frame original às abas.

## Impact

- `apps/web/src/app/market-data/connection/`: `upstream-socket.ts`, `market-hub.ts`, `worker-messages.ts`, `shared-worker-market-connection.ts`, `market-connection.ts` e seus specs.
- `MarketStore`, `MarketSocket` e os painéis não mudam. Os specs que usam `IN_PROCESS_MARKET_CONNECTION_PROVIDERS` continuam síncronos, pois essa conexão não passa pelo agrupamento.
- `CLAUDE.md` e `README.md` descrevem a aplicação imediata e precisam acompanhar a mudança.
- Servidor, protocolo e dependências não mudam.
- Expectativa de ganho: cerca de 5% do tempo total da thread principal, já que layout e renderização continuam sendo o maior custo. O resultado real será medido no navegador.
