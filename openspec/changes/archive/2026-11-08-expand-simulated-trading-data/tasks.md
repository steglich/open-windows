# Tasks

## 1. Base de geração

- [x] 1.1 Criar `market/random.ts` com o PRNG mulberry32 e a derivação de sub-seeds, movendo `seededRandom` de `test-utils.ts`, e verificar por teste que a mesma seed gera a mesma sequência e rótulos diferentes geram sequências diferentes
- [x] 1.2 Criar `market/volume.ts` com os padrões (500, 50, 10.000, 300, 5 pregões) e a validação de volumes incompatíveis, e verificar por teste os padrões e os erros
- [x] 1.3 Criar `market/tickers.ts` com 500 tickers reais da B3 e verificar por teste que são distintos, seguem o formato da B3 e incluem `PETR4` e `VALE3`

## 2. Histórico de preços

- [x] 2.1 Criar `market/history.ts` com a caminhada aleatória de cinco pregões mais o pregão corrente em typed arrays, e verificar por teste os 390 candles por pregão, dias úteis, `time` múltiplo de 60.000 e as relações de OHLC
- [x] 2.2 Implementar a consulta com `limit` e `before`, e verificar por teste a paginação para trás sem repetição

## 3. Simulador e book

- [x] 3.1 Adaptar `MarketSimulator` para partir do histórico, usar o relógio injetado e atualizar o candle corrente a cada ciclo, e verificar por teste a coerência entre cotação e candles do pregão
- [x] 3.2 Acrescentar `financialVolume` e `updatedAt` à cotação e verificar por teste que os volumes nunca diminuem e que `updatedAt` respeita o `timestamp`
- [x] 3.3 Gerar os 50 níveis sob demanda com a sub-seed do ativo e do ciclo, adicionar `spread` e verificar por teste a ordenação, os preços positivos no piso, o book não cruzado e o mesmo book em consultas repetidas no ciclo

## 4. Ordens, carteira e saldo

- [x] 4.1 Criar `market/orders.ts` com as duas fases de geração e verificar por teste os status e seus mínimos, quantidades em lotes, preços por tipo e lado, datas, IDs únicos e o corte de tempo entre as fases
- [x] 4.2 Derivar as posições da reprodução das execuções em `portfolio.ts` e verificar por teste quantidade, preço médio, `blockedQuantity` e ausência de execuções fora da carteira
- [x] 4.3 Calcular `totalUnrealizedPnlPercent` e o saldo da conta, e verificar por teste `blockedBalance`, `totalEquity` e a constância de `availableBalance`
- [x] 4.4 Implementar a consulta de ordens com filtros, paginação e ordenação, e verificar por teste `total`, páginas sem repetição e filtros combinados

## 5. Protocolo e gateway

- [x] 5.1 Atualizar `protocol.ts` com os novos tipos e o parser de `getCandles` e `getOrders`, e verificar por `protocol.test.ts` os casos válidos, os erros com `requestId` e o `placeOrder` rejeitado
- [x] 5.2 Adaptar `gateway.ts` para publicar `quotes` em lote, `positions` e `account` no mesmo ciclo, trocando `random` por `seed` e aceitando `volume`, e verificar por `gateway.test.ts` com clientes reais a ordem das mensagens e o estado inicial
- [x] 5.3 Responder a `getCandles` e `getOrders` no gateway e verificar por `gateway.test.ts` a correlação por `requestId` e a coerência entre as seções em um mesmo ciclo
- [x] 5.4 Ler `SEED` em `main.ts`, registrar a seed no log e incluir a variável em `passThroughEnv` no `turbo.json`, e verificar que `SEED=abc pnpm --filter server exec tsx src/main.ts` termina com erro
- [x] 5.5 Implementar o relógio simulado e verificar por teste que duas execuções com a mesma seed geram mensagens idênticas por ciclo, mesmo com assinaturas diferentes
- [x] 5.6 Adicionar um teste de partida com o volume padrão, verificando 500 ativos, 10.000 ordens, 300 posições e tempo de partida de até 5 s
- [x] 5.7 Documentar mensagens, campos e seed em `apps/server/PROTOCOL.md`, atualizar as seções de arquitetura e comandos do `CLAUDE.md`, e verificar que cada mensagem de `protocol.ts` está descrita

## 6. Frontend

- [x] 6.1 Copiar os novos tipos para `market-protocol.ts`, registrar os novos tipos de mensagem em `market-socket.ts` e verificar por `market-socket.spec.ts` que as novas mensagens são aceitas
- [x] 6.2 Aplicar `quotes` em uma única atualização em `market-store.ts`, atualizar as fixtures de `market-data/testing/` e verificar por `market-store.spec.ts` que os ativos ausentes do lote permanecem iguais

## 7. Verificação integrada

- [x] 7.1 Rodar `pnpm build` e `pnpm test` na raiz e verificar que todos passam
- [x] 7.2 Rodar `pnpm dev` com o volume padrão e verificar no navegador que a grade de cotações, o book e a carteira continuam atualizando sem travar a página
