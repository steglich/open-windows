# Design

## Context

`gateway.ts` tem um único `setInterval` de 500 ms que avança o simulador e publica tudo em seguida: um `quotes` por cliente com todos os ativos, um `book` por ativo assinado e, a cada dois ciclos, `positions` e `account`. Candles só saem por `getCandles`. O frontend assina `quote` de todos os ativos e `book` só do selecionado, e grava cada mensagem em signals. A aplicação é zoneless.

O book de um ativo tem cerca de 4,5 KB (100 níveis). Os requisitos estão nas delta specs. Aqui ficam as decisões de como atendê-los.

## Goals / Non-Goals

**Goals:**

- Atingir 1000, 500 e 350 mensagens por segundo por conexão em `book`, `quote` e `candle`, com envio espaçado.
- Manter a simulação, o consumo de RNG e a cadência de `positions` e `account` como estão.
- Impedir que um cliente lento faça a memória do servidor crescer.
- Aplicar cada mensagem ao estado do frontend assim que ela chegar, sem limitador de tempo.

**Non-Goals:**

- Acelerar o mercado: os preços continuam mudando a cada 500 ms.
- Tornar as taxas configuráveis por variável de ambiente ou por cliente.
- Tornar reprodutíveis a quantidade e a ordem das mensagens entregues; só os dados por ativo e ciclo são.
- Comprimir ou trocar o formato das mensagens.

## Decisions

### Uma mensagem carrega um ativo, em rodízio

Cada mensagem traz um único ativo, e a conexão percorre em ciclo a lista dos ativos que assinou. Com 500 ativos assinados, isso dá 1 cotação por ativo por segundo, 2 books por ativo por segundo e 0,7 candle por ativo por segundo.

Alternativa descartada: manter o lote completo em cada mensagem `quotes`. Seriam 250 mil cotações por segundo, cerca de 75 MB/s por cliente. `quotes` mantém `data` como lista, com um item, para não criar um novo tipo de mensagem.

### A taxa vale por conexão e por canal

Com um único ativo assinado, a conexão recebe a taxa inteira desse ativo, como o usuário pediu. Quase todas as mensagens repetem o estado anterior, porque o mercado só muda a cada 500 ms.

Alternativa descartada: enviar só quando o estado mudasse. Limitaria o navegador a 2 mensagens de book por segundo, longe da taxa pedida.

### Mercado e envio com relógios separados

O timer de 500 ms continua avançando o simulador e publicando `positions` e `account`. Um segundo e único timer, de 10 ms, faz o envio contínuo dos três canais. Nada de um timer por canal, para manter uma só ordem de execução sobre o estado.

Um módulo novo, `apps/server/src/pacing.ts`, calcula quantas mensagens estão devidas a partir do tempo decorrido: `floor(taxa * decorrido / 1000) - enviadas`. Assim o arredondamento de 3,5 mensagens por fatia de 350/s não perde mensagens, e atrasos do timer são compensados. O relógio é injetado para os testes.

Alternativa descartada: um `setInterval` de 1 a 3 ms por canal. O Node não garante essa precisão, e a taxa real ficaria abaixo da pedida.

### Compensação de atraso limitada

Um atraso do event loop maior que 100 ms não é compensado por inteiro: o excedente é descartado. Sem isso, uma pausa longa geraria uma rajada justamente quando o processo está sobrecarregado.

### Frame serializado por ciclo

O envio guarda um frame pronto por canal e ativo, descartado a cada ciclo de mercado. Serializa cada item uma vez por ciclo em vez de milhares de vezes, e o custo fica parecido com o atual. Para isso, o `timestamp` das mensagens contínuas é o instante do ciclo que as gerou. Isso também dá ao cliente a forma de identificar cotação e book do mesmo ciclo. As mensagens de estado inicial na assinatura continuam usando o instante atual.

### Lista de rodízio por assinatura

Cada conexão mantém, por canal, o `Set` atual e um array com os ativos na ordem do catálogo, reconstruído em `subscribe` e `unsubscribe`, com um cursor. Procurar o próximo ativo no catálogo custaria até 500 passos por mensagem quando há um só assinado.

### Cliente lento

Se `socket.bufferedAmount` passar de 8 MiB, a fatia não envia `quote`, `book` nem `candle` para aquela conexão e o contador de enviadas avança, sem acumular dívida. Hoje não há proteção, e a 4,5 MB/s por conexão a fila de um cliente parado cresceria rápido. Os demais tipos de mensagem continuam, porque são poucos e pequenos.

### Aplicação imediata no frontend

O `MarketStore` grava cada mensagem de `quotes`, `book` e `candle` nos signals no momento em que ela chega, como já faz hoje, sem buffer nem timer. A tela deve refletir cada informação nova assim que ela chega, por decisão do usuário.

Na prática, o Angular junta as mudanças de signals até a próxima renderização e o navegador pinta na taxa do monitor. O código da aplicação não acrescenta nenhum outro limite.

Alternativa descartada: agregar as mensagens no `MarketStore` e aplicá-las a cada 100 ms, o que reduziria o trabalho do navegador, mas atrasaria a tela.

### Canal `candle` usa o histórico existente

A mensagem usa `simulator.candles(symbol, 1)`, a mesma fonte de `getCandles`, o que mantém a derivação do candle em `market/history.ts`. O frontend continua pedindo `getCandles` na virada do minuto, agora detectada pelo `time` do candle recebido, para obter o fechamento definitivo do candle anterior.

## Risks / Trade-offs

- [Quote defasada em relação ao book] Com 500 ativos em rodízio, a cotação de um ativo pode atrasar até 1 s, enquanto book e candle do selecionado chegam em milissegundos. O preço do cabeçalho pode divergir brevemente do book e do gráfico. → Aceito e explicitado na spec de `order-book-feed`; mudar exigiria priorizar o ativo selecionado, fora do escopo.
- [Carga no navegador] São 1850 `JSON.parse` por segundo na thread principal, a maior parte de books de 4,5 KB. O `MarketStore` copia o mapa de 500 cotações a cada mensagem `quotes`, e o ApexCharts pode redesenhar o gráfico a cada renderização. A interface pode travar. → Sem mitigação por tempo, por decisão do usuário; medir o uso de CPU e a fluidez no navegador durante a implementação e relatar o resultado.
- [Banda] Cerca de 4,5 MB/s por conexão só de book, mesmo em localhost. → Aceito para um simulador local; o limite de 8 MiB protege o servidor.
- [Precisão do timer em testes] Taxas reais variam em máquinas carregadas. → Spec com tolerância de 10% em 5 s, e testes com o relógio injetado no módulo de cadência.
- [Testes existentes] `gateway.test.ts` assume um `quotes` completo por ciclo e silêncio com `NEVER_TICKS_MS`. → `startGateway` recebe `rates` opcional, e taxa `0` desliga o envio do canal; o helper `launch` usa `0` por padrão e os testes de fluxo definem as taxas.

## Migration Plan

Servidor e frontend mudam juntos neste repositório. Não há dados persistidos, e reverter o change restaura o comportamento anterior.
