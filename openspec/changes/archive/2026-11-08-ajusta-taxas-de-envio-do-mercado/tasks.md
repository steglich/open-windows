# Tasks

## 1. Cadência de envio

- [x] 1.1 Criar `apps/server/src/pacing.ts` com o cálculo de mensagens devidas por tempo decorrido, relógio injetado e limite de compensação de 100 ms, e verificar com `pacing.test.ts` as taxas 1000, 500 e 350 (sem perda de mensagens em taxa fracionária por fatia) e o descarte do atraso excedente
- [x] 1.2 Adicionar ao módulo o rodízio entre ativos, com cursor estável em `subscribe` e `unsubscribe`, e verificar em `pacing.test.ts` a alternância e a remoção de ativos durante o rodízio
- [x] 1.3 Adicionar ao módulo o descarte sem acúmulo quando a conexão estiver acima do limite, e verificar em `pacing.test.ts` que nenhuma mensagem é enviada acima do limite e que, abaixo dele, o envio volta sem rajada

## 2. Protocolo e canal `candle` no servidor

- [x] 2.1 Adicionar `candle` a `CHANNELS` e a mensagem `candle` a `ServerMessage` em `apps/server/src/protocol.ts`, e verificar com `protocol.test.ts` que o canal é aceito em `subscribe` com e sem `symbols`
- [x] 2.2 Implementar a assinatura de `candle` em `gateway.ts`, com confirmação e estado inicial por ativo, e verificar em `gateway.test.ts` os cenários de assinatura e de primeiro candle imediato
- [x] 2.3 Documentar o canal `candle` em `apps/server/PROTOCOL.md` e verificar que o `welcome` de exemplo lista os cinco canais

## 3. Envio contínuo no gateway

- [x] 3.1 Adicionar a opção `rates` a `startGateway`, com padrões 1000, 500 e 350 e `0` desligando o canal, e fazer o helper `launch` de `gateway.test.ts` usar `0` por padrão; verificar que os testes de estado inicial e de assinatura passam com `pnpm --filter server exec vitest run src/gateway.test.ts`
- [x] 3.2 Trocar `publishQuotes` e `publishBooks` por um único timer de 10 ms que usa `pacing.ts` e o limite de 8 MiB de `bufferedAmount`, mantendo o timer de 500 ms para o simulador e para `positions` e `account`; verificar com um teste que mede cada canal e confirma as taxas configuradas dentro da tolerância
- [x] 3.3 Adicionar o cache de frames por canal e ativo, descartado a cada ciclo, com `timestamp` igual ao instante do ciclo, e verificar em `gateway.test.ts` que `quotes` e `book` com o mesmo `timestamp` têm `bid` e `ask` iguais
- [x] 3.4 Reescrever em `gateway.test.ts` os testes de fluxo, de lote por ciclo, de ordem entre `quotes` e `book` e de reprodutibilidade por seed conforme as delta specs, e verificar que `pnpm --filter server exec vitest run` passa
- [x] 3.5 Atualizar `apps/server/PROTOCOL.md` (taxas, rodízio, `timestamp`, cliente lento) e a seção de arquitetura do servidor em `CLAUDE.md`, e verificar que não restam menções à publicação de `quotes` e `book` a cada 500 ms

## 4. Frontend

- [x] 4.1 Copiar o canal e a mensagem `candle` para `market-protocol.ts` e aceitar o novo tipo em `market-socket.ts`, e verificar com a spec do socket que a mensagem é repassada ao store
- [x] 4.2 Assinar `candle` do ativo selecionado em `welcome` e em `select`, cancelando a do ativo anterior, e verificar em `market-store.spec.ts` os cenários de assinatura e de troca de ativo
- [x] 4.3 Substituir `applyQuoteToCandles` pela atualização a partir da mensagem `candle`, aplicada assim que ela chega e incluindo a virada do minuto, e verificar em `market-store.spec.ts` os cenários de candle atualizado, candle de minuto anterior, candle atrasado do ativo anterior, novo minuto, consulta já pendente e mensagens seguidas aplicadas uma a uma
- [x] 4.4 Atualizar as specs de `market/` e os fixtures de `market-data/testing/` que dependem de candle vindo de cotações, e verificar que `pnpm --filter web test` passa com o cenário do gráfico atualizado
- [x] 4.5 Atualizar a seção de arquitetura web do `CLAUDE.md` com o canal `candle`, e verificar que não resta a descrição de candle atualizado por cotações

## 5. Integração

- [x] 5.1 Rodar `pnpm build` e `pnpm test` na raiz e verificar que todos os projetos passam
- [x] 5.2 Subir `pnpm dev`, medir com um cliente WebSocket as taxas de cada canal em cinco segundos e verificar no navegador que book, gráfico e cotações se atualizam conforme as mensagens chegam, sem timer de agregação, registrando o uso de CPU e eventuais travamentos
