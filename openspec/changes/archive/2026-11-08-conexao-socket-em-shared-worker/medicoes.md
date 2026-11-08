# Medições

## Procedimento

`medir.mjs` (nesta pasta) abre a build de produção no Chromium headless (Playwright 1228) e lê por CDP, em cada aba, `Performance.getMetrics` e as long tasks observadas. Depois de 8 s de aquecimento, mede o intervalo de 30 s.

```bash
SEED=42 pnpm --filter server exec tsx src/main.ts
pnpm --filter web build
node medir.mjs <chromium> apps/web/dist/web/browser <abas> 30
```

O caminho do socket do Chromium é limitado; o script usa `XDG_RUNTIME_DIR` para isso. `task` é o tempo total de tarefas da thread principal e `script`, a parte em JavaScript. Com duas abas, a primeira fica em segundo plano e renderiza menos.

## Antes (commit 0b548ca, três rodadas)

| Abas | task (ms) por rodada | script (ms) por rodada | layout (ms) | long tasks |
| --- | --- | --- | --- | --- |
| 1 | 14387, 13834, 14040 | 3582, 3501, 3545 | 4077, 3904, 3978 | 0 |
| 2 (soma) | 21642, 21633, 21887 | 7964, 8040, 8162 | 5092, 5049, 5128 | 0 |

Observações: nenhuma long task, o que indica muitas tarefas curtas. Script responde por cerca de 25% do tempo; o restante é layout e renderização, que esta change não altera.

## Depois (três rodadas)

| Abas | task (ms) por rodada | script (ms) por rodada | layout (ms) | long tasks |
| --- | --- | --- | --- | --- |
| 1 | 13806, 13683, 13675 | 3793, 3729, 3751 | 4045, 4033, 4038 | 0 |
| 2 (soma) | 19190, 19272, 19359 | 7824, 7760, 7755 | 4556, 4649, 4705 | 0 |

## Comparação (médias da thread principal em 30 s)

| Abas | task antes → depois | script antes → depois |
| --- | --- | --- |
| 1 | 14087 → 13721 ms (-2,6%) | 3543 → 3758 ms (+6,1%) |
| 2 (soma) | 21721 → 19274 ms (-11,3%) | 8055 → 7780 ms (-3,4%) |

Com uma aba, o ganho fica perto do ruído das rodadas (cerca de 2%) e o tempo de script sobe: a desserialização do `postMessage` custa mais do que o `JSON.parse` que saiu da thread principal. Com duas abas, a melhora vem quase toda da aba em segundo plano (task de cerca de 7600 para 5130 ms). A medição cobre só a thread principal, não o consumo total de CPU com o worker. O maior custo restante é layout e renderização.

## Verificação integrada (6.1)

Roteiro automatizado por CDP em Chromium headless, com duas abas em ativos diferentes (PETR4 e ITUB4):

| Verificação | `pnpm dev` | Build de produção |
| --- | --- | --- |
| Uma única conexão com o `:8090` | OK | OK |
| Página não abre WebSocket com o servidor | OK (só o HMR em `:4200`) | OK |
| Cada aba com book e candles do próprio ativo, atualizando | OK | OK |
| Ao fechar uma aba, a outra segue e a conexão continua | OK | OK |
| Nova aba reaproveita a conexão e recebe o estado inicial | OK | OK |
| Derrubar e subir o servidor: as duas abas reconectam, com uma conexão e o ativo mantido | não exercitado | OK |

Sem exceções nas páginas. O estado `unavailable` e a volta do bfcache foram cobertos só por specs com `SharedWorker` falso.
