# Proposal

## Why

O servidor envia mensagens continuamente (um timer de 10 ms por cliente), e hoje todo o tratamento delas acontece na thread principal do navegador: recepção do frame, `JSON.parse`, validação e timers de reconexão e silêncio disputam tempo com a renderização. Cada aba aberta também mantém o seu próprio WebSocket, e abas em segundo plano têm os timers limitados pelo navegador. Este é o primeiro passo da melhoria de performance do frontend: tirar a conexão da thread principal e compartilhá-la entre as abas.

## What Changes

- A conexão WebSocket, o parse e a validação dos frames, a reconexão e a detecção de silêncio passam a rodar dentro de um SharedWorker.
- A criação da conexão passa a ser feita por uma Factory injetável, e o `MarketSocket` deixa de instanciar `WebSocket` diretamente.
- Todas as abas da mesma origem passam a compartilhar um único WebSocket. **BREAKING** para quem conta conexões no servidor: várias abas agora aparecem como uma só conexão.
- Cada aba mantém o seu próprio ativo selecionado. O worker soma as assinaturas das abas, entrega a cada uma somente o que ela assinou e cancela uma assinatura no servidor só quando nenhuma aba a usa.
- Uma aba aberta com a conexão já ativa recebe o estado atual e o `welcome` imediatamente, sem abrir outra conexão.
- Novo estado de conexão `unavailable`, exibido no painel de status quando o navegador não oferece SharedWorker ou o worker não pode ser carregado. **BREAKING**: nesses navegadores a aplicação deixa de receber dados, por decisão de não manter uma conexão alternativa na thread principal.

Fora de escopo: alterações no servidor e no protocolo, agregação ou descarte de mensagens, otimizações de renderização dos painéis e do gráfico.

A thread principal continua pagando a desserialização do `postMessage` de cada mensagem, de custo comparável ao `JSON.parse`. O ganho esperado vem do restante do trabalho que sai dela, da conexão única e dos timers que deixam de sofrer limitação em segundo plano. Por isso o plano inclui medir o antes e o depois.

## Capabilities

### New Capabilities

Nenhuma.

### Modified Capabilities

- `market-data-client`: a conexão única passa a valer entre abas e a rodar fora da thread principal, com assinaturas independentes por aba, entrega dirigida das mensagens, entrada e saída de abas e o novo estado `unavailable`.
- `market-dashboard`: o painel de status passa a indicar o estado `unavailable`.

## Impact

- `apps/web/src/app/market-data/`: o `MarketSocket` vira uma fachada sobre a nova conexão, e a lógica de reconexão, silêncio e parse migra para o código do worker. A API pública do `MarketSocket` e o `MarketStore` se mantêm.
- `apps/web/src/app/market/connection-status-panel/`: exibição do novo estado.
- Specs do `web` que usam `FakeWebSocket`: passam a fornecer uma conexão em processo, já que `SharedWorker` não existe no jsdom.
- Build: passa a emitir um bundle separado para o worker. Nenhuma dependência nova.
- Servidor: sem alteração de código, mas uma conexão passa a concentrar as assinaturas de todas as abas (ver riscos em `design.md`).
