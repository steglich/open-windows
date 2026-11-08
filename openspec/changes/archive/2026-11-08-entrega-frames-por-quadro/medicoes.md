# Medições

## Procedimento

Mesmo procedimento da change `conexao-socket-em-shared-worker`: `medir.mjs` abre a build de produção no Chromium headless (Playwright 1228) e lê por CDP, em cada aba, `Performance.getMetrics`. Depois de 8 s de aquecimento, mede o intervalo de 30 s, com `SEED=42`. Com duas abas, a primeira fica em segundo plano.

```bash
SEED=42 pnpm --filter server exec tsx src/main.ts
pnpm --filter web build
node openspec/changes/archive/2026-11-08-conexao-socket-em-shared-worker/medir.mjs <chromium> apps/web/dist/web/browser <abas> 30
```

## Antes (commit 84abb91, três rodadas)

| Abas | task (ms) por rodada | script (ms) por rodada | layout (ms) por rodada | long tasks |
| --- | --- | --- | --- | --- |
| 1 | 15207, 14839, 14913 | 4029, 3959, 3972 | 4534, 4399, 4437 | 0 |
| 2 (soma) | 20582, 20293, 20254 | 8244, 8146, 8184 | 5029, 4898, 4907 | 0 |

## Depois (três rodadas)

| Abas | task (ms) por rodada | script (ms) por rodada | layout (ms) por rodada | long tasks |
| --- | --- | --- | --- | --- |
| 1 | 13400, 13240, 13149 | 2409, 2427, 2406 | 4454, 4422, 4376 | 0 |
| 2 (soma) | 15816, 15783, 15730 | 3689, 3739, 3690 | 4792, 4820, 4783 | 0 |

## Comparação (médias da thread principal em 30 s)

| Abas | task antes → depois | script antes → depois | layout antes → depois |
| --- | --- | --- | --- |
| 1 | 14986 → 13263 ms (-11,5%) | 3987 → 2414 ms (-39,4%) | 4457 → 4417 ms (-0,9%) |
| 2 (soma) | 20376 → 15776 ms (-22,6%) | 8191 → 3706 ms (-54,8%) | 4945 → 4798 ms (-3,0%) |

O ganho superou a previsão de cerca de 5% do benchmark isolado, que não incluía RxJS, gravações em signals nem o trabalho do Angular disparado por elas. O script caiu cerca de 52 ms por segundo com uma aba, contra os 22 ms previstos. Layout e renderização praticamente não mudaram, como esperado, e seguem como o maior custo. A medição cobre só a thread principal, não o consumo do worker.

## Verificação integrada (5.2 e 5.3)

Roteiro automatizado por CDP em Chromium headless, com a build de produção e sem desligar a limitação de abas ocultas:

| Verificação | Resultado |
| --- | --- |
| Duas abas em ativos diferentes (PETR4 e VALE3), cada uma com book e candle do próprio ativo | OK |
| Book, cotações e gráfico atualizam nas duas abas | OK |
| Virada do minuto gera `getCandles` | OK |
| Derrubar e subir o servidor: as duas abas passam a reconectando, voltam e mantêm o ativo | OK |
| Aba oculta por 65 s: 22750 candles aplicados, contra 22756 na aba visível com a mesma assinatura | OK (a diferença é o lote ainda pendente) |
| Book parseado em 65 s: 66 vezes na aba oculta e 3833 na visível | Informativo |
| Maior lote de candles na aba oculta: 353 na primeira metade e 354 na segunda | OK (fila não cresce) |
| Virada do minuto na aba oculta e gráfico atualizado ao voltar | OK |
| Exceções nas páginas | Nenhuma |
