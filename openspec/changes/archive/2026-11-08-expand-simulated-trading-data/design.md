# Design

## Context

Motivação em `proposal.md`. Hoje `MarketSimulator` guarda todo o estado, `gateway.ts` avança o mercado em um ciclo de 500 ms e publica `quote` antes de `book`. Os preços são inteiros em centavos e a carteira é uma constante de 3 posições.

Restrições que moldam a solução:

- Sem banco nem dependências novas, e toda a geração em memória.
- O frontend assina as cotações de todos os ativos, mas o `book` de um só. Cada frame WebSocket vira uma tarefa no navegador.
- A seed precisa reproduzir os dados mesmo que os clientes assinem canais diferentes, então o consumo do PRNG não pode depender das assinaturas.

## Goals / Non-Goals

**Goals:**

- Contrato WebSocket completo para cotações, book, candles, ordens, saldo e carteira.
- Invariantes entre seções garantidas por construção, não por correção posterior.
- Partida em até cerca de 5 s com o volume padrão.

**Non-Goals:**

- Envio, cancelamento ou casamento de ordens. Ordens abertas não executam se o preço cruzar o limite.
- Virada de pregão: o pregão corrente não fecha enquanto o servidor estiver em execução.
- Intervalos de candle além de 1 minuto. O cliente agrega se precisar.
- Stream de candles: o gráfico usa `getCandles` e as cotações.
- Novos painéis no frontend. Ele só passa a consumir `quotes`.
- Feriados na agenda de pregões, que considera apenas fins de semana.

## Decisions

### Estrutura das mensagens

Todas as mensagens continuam no WebSocket existente. Valores monetários em reais, datas em milissegundos desde a época Unix. Os campos completos estão nas specs da change.

| Sentido | Mensagem | Quando |
| --- | --- | --- |
| Servidor → cliente | `quotes` (`data: Quote[]`) | canal `quote`, uma por ciclo |
| Servidor → cliente | `book` | canal `book`, por ativo e ciclo |
| Servidor → cliente | `positions` | canal `positions`, a cada 2 ciclos |
| Servidor → cliente | `account` | canal `account`, a cada 2 ciclos, depois de `positions` |
| Cliente → servidor | `getCandles` | responde `candles` |
| Cliente → servidor | `getOrders` | responde `orders` |
| Servidor → cliente | `error` | ganha `requestId` opcional |

Canais para o que muda sozinho, requisição e resposta para consultas grandes e pontuais. Publicar 10.000 ordens ou 2.000 candles a cada assinatura desperdiçaria banda.

Alternativa descartada, por decisão do usuário: REST para consultas, que traria servidor HTTP e CORS.

### Cotações em lote

`quote` por ativo vira `quotes` com um frame por ciclo. Com 500 ativos, o formato antigo daria 500 tarefas e 500 atualizações de signal por ciclo no navegador, cada uma copiando um objeto de 500 chaves. O nome do canal continua `quote`, e só o tipo da mensagem muda.

Alternativa descartada: manter `quote` e reduzir a frequência por ativo, o que quebraria a publicação de ao menos uma cotação por segundo.

Clientes que assinam o catálogo inteiro reutilizam o mesmo frame serializado. Os demais recebem um frame filtrado.

### Geração aleatória e seed

`market/random.ts` passa a conter o PRNG mulberry32, hoje em `test-utils.ts`, e uma função que deriva sub-seeds por rótulo com hash FNV-1a. Fluxos independentes: `history:<ativo>`, `orders`, `tick` e `book:<ativo>:<ciclo>`.

- `tick` consome uma quantidade fixa de números por ativo e por ciclo, na ordem do catálogo.
- Os níveis do book são calculados sob demanda a partir da sub-seed `book:<ativo>:<ciclo>` e guardados em cache durante o ciclo. Só `bestBid` e `bestAsk` entram no estado do `tick`. Assim, 50 mil objetos por ciclo só são criados para quem assina, e as assinaturas não alteram os dados.

`startGateway` troca a opção `random` por `seed` e aceita `volume` parcial, usado nos testes com volumes pequenos. `main.ts` lê `SEED`, e `turbo.json` passa a repassar a variável no `dev`. Sem `SEED`, uma seed aleatória é sorteada e registrada no log.

### Relógio simulado

Com `SEED`, todos os timestamps vêm de um relógio que parte de `2026-01-05T16:00:00-03:00` e avança um intervalo de ciclo a cada ciclo. Sem `SEED`, vêm de `Date.now()`, e o ponto de partida do histórico é o instante da partida. Sem esse relógio, a seed reproduziria preços, mas não datas.

### Histórico de preços

A geração é uma caminhada aleatória por ativo, do passado para o presente, para que os fechamentos alimentem o estado inicial:

1. Preço inicial log-uniforme entre R$ 5 e R$ 300, para uma distribuição realista.
2. Cinco pregões de 390 candles nos dias úteis anteriores, das 10:00 às 16:30 no horário de Brasília, passo por candle de até 0,2% e gap de abertura de até 1%.
3. Pregão corrente com 120 candles nos minutos anteriores à partida, de forma que o dia já comece com volume.
4. O estado da cotação é derivado desses candles. Cada ciclo atualiza o último candle ou abre um novo a cada minuto do relógio.

Os pregões fechados ficam em typed arrays (`Int32Array` para OHLC e `Float64Array` para volumes), cerca de 30 MB. Objetos JS custariam várias vezes mais. O pregão corrente, que cresce, usa array comum.

Piso de preço: `max(R$ 3,00, open / 2)`. Como cada nível do book distancia no máximo 3 centavos do anterior, 49 níveis somam no máximo R$ 1,47 mais o spread, mantendo todo preço positivo.

### Ordens e carteira derivadas

As posições nascem das execuções, em vez de serem sorteadas separadamente. Com isso, quantidade e preço médio batem com o histórico por construção. A geração roda em duas fases, com um corte `Tc` 30 minutos antes da partida:

1. **Fase 1, ordens encerradas (85%), `updatedAt < Tc`:** `FILLED` e `CANCELLED`, em ordem cronológica. As primeiras `positions` ordens são compras `FILLED`, uma por ativo da carteira, de forma que toda posição exista. Só ativos da carteira têm execução. Vendas limitam a execução a deixar ao menos um lote, e viram compra se isso não for possível. O preço de execução fica dentro de `low..high` do candle do instante.
2. **Fase 2, ordens abertas (15%), `updatedAt >= Tc`:** `OPEN` e `PARTIALLY_FILLED`, sempre `LIMIT`. Compras ficam de 0,5% a 5% abaixo do último preço, e vendas, acima. Vendas abertas só existem em ativos da carteira, limitadas à quantidade livre, e o restante vira `blockedQuantity`.

Distribuição padrão: `FILLED` 60%, `CANCELLED` 25%, `OPEN` 10%, `PARTIALLY_FILLED` 5%. O preço médio usa aritmética em centavos: `round((avg * q + preço * fill) / (q + fill))` nas compras, sem alteração nas vendas.

`availableBalance` é sorteado entre R$ 50 mil e R$ 500 mil. `blockedBalance` é calculado uma vez a partir da fase 2, e `totalEquity` a cada publicação, em centavos.

Ordens ficam ordenadas por `createdAt` descendente, com listas pré-computadas por status e por ativo, para responder às consultas sem varrer tudo.

### Módulos

Em `apps/server/src/market/`: `random.ts`, `tickers.ts`, `volume.ts` (padrões e validação), `history.ts`, `orders.ts`, além de `simulator.ts` e `portfolio.ts` adaptados. `protocol.ts` ganha a união de mensagens do cliente. O protocolo é documentado em `apps/server/PROTOCOL.md`.

## Risks / Trade-offs

- [Lista de tickers curada manualmente pode conter papéis já deslistados] → aceitável em simulação. O teste garante 500 códigos distintos no formato da B3, inclusive ações, units, FIIs, ETFs e BDRs.
- [Tickers reais com preços inventados podem parecer cotações reais] → `PROTOCOL.md` registra que os preços são fictícios.
- [Ordem aberta pode ficar com limite cruzado após o preço se mover] → consequência de não haver casamento. A faixa de 0,5% a 5% torna isso raro no curto prazo.
- [Cliente que assina o `book` dos 500 ativos recebe cerca de 5 MB/s] → o frontend assina um só. Sem controle de backpressure nesta change.
- [Tabela de 500 linhas e carteira de 300 linhas renderizadas no ciclo pesam no navegador] → o lote concentra o trabalho em uma tarefa por ciclo. Otimizar a renderização fica fora do escopo.
- [Pregão corrente cresce em memória, cerca de 30 KB por minuto] → sem impacto em uso de desenvolvimento. Reiniciar o servidor limpa o estado.
- [Testes usando os volumes padrão ficariam lentos] → testes usam `volume` reduzido, e um único teste valida a partida com o volume padrão.

## Migration Plan

Mudança sem dados persistidos. Servidor e frontend precisam ser atualizados juntos, por causa de `quotes`. Rollback é reverter o commit.
