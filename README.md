# Open Windows Homebroker

Aplicação Angular de um homebroker simulado, feita para exibir um fluxo intenso de dados de mercado em tempo real e distribuir os painéis em janelas independentes do navegador, por exemplo em vários monitores.

> [!NOTE]
> Todos os dados são fictícios. Os preços são inventados, mesmo que os tickers existam na B3, e não há conexão com corretoras, bolsas ou feeds de mercado. Também não há envio de ordens.

## Painéis

| Painel | Janela | O que mostra | Dados assinados |
| --- | --- | --- | --- |
| Status da conexão | `/janela/status` | Estado da conexão e último erro | Nenhum |
| Saldo | `/janela/saldo` | Saldo disponível, saldo bloqueado e patrimônio | `account` |
| Gráfico de preço | `/janela/grafico` | Candlestick de 1 minuto do ativo selecionado, com os últimos 120 candles | `quote` e `candle` do ativo selecionado, além de `getCandles` |
| Cotações | `/janela/cotacoes` | Tabela de todos os ativos e resumo de altas e baixas | `quote` de todos os ativos |
| Book de ofertas | `/janela/book` | 50 níveis por lado, melhor preço e spread do ativo selecionado | `book` do ativo selecionado |
| Carteira | `/janela/carteira` | Posições, resultado e distribuição por ativo | `positions` |

A página principal reúne todos os painéis. Clicar em um ativo da tabela de cotações troca o gráfico e o book. A interface tem tema claro e escuro, e os valores seguem o formato `pt-BR`.

## Como executar

São necessários Node.js 24.15 ou superior e pnpm 12.14. Execute os comandos na raiz do repositório:

```bash
pnpm install
```

```bash
pnpm dev
```

A aplicação abre em `http://localhost:4200` e se conecta ao simulador em `ws://127.0.0.1:8090`. O `pnpm dev` sobe os dois.

No WSL2, se o navegador no Windows não alcançar o simulador, inicie com `HOST=0.0.0.0`:

```bash
HOST=0.0.0.0 pnpm dev
```

| Comando | Descrição |
| --- | --- |
| `pnpm dev` | Sobe a aplicação e o simulador |
| `pnpm build` | Compila todos os projetos |
| `pnpm test` | Executa todos os testes uma vez |
| `pnpm --filter web test` | Executa só os testes da aplicação web |
| `pnpm turbo run dev --filter=web` | Sobe só a aplicação web |

## Volume de dados

O backend é apenas um simulador que alimenta a tela. Ele gera os dados em memória e os envia pelo WebSocket:

| Canal | Mensagens por segundo | Conteúdo de cada mensagem |
| --- | --- | --- |
| `book` | 1000 | Um ativo, com 50 níveis por lado (cerca de 4,5 KB) |
| `quote` | 500 | Um ativo |
| `candle` | 350 | Candle de 1 minuto em andamento de um ativo |
| `positions` | 1 | Carteira completa, com 300 posições |
| `account` | 1 | Saldos da conta |

Com todos os painéis visíveis, são cerca de 1850 mensagens por segundo. Só o book soma cerca de 4,5 MB/s, mesmo em `localhost`.

- O catálogo tem 500 ativos. O histórico de candles é pedido sob demanda com `getCandles`.
- As taxas valem por conexão e por canal, e o servidor alterna entre os ativos assinados. Nas cotações de 500 ativos, cada um é atualizado cerca de uma vez por segundo. O book e o candle do ativo selecionado usam a taxa inteira.
- O mercado só muda a cada 500 ms, então a maior parte das mensagens repete o estado mais recente.
- Se a conexão acumular mais de 8 MiB sem entrega, o servidor para de enviar `quote`, `book` e `candle` até o buffer esvaziar.

O contrato completo das mensagens está em [`apps/server/PROTOCOL.md`](apps/server/PROTOCOL.md).

## Como o front lida com isso

```text
Servidor ──WebSocket──▶ SharedWorker ──postMessage──▶ MarketSocket ──Subject──▶ MarketStore ──signals──▶ Painéis
                        (uma conexão,                 (um por aba                (um por aba
                         parse e roteamento)           ou janela)                 ou janela)
```

**Uma conexão por origem.** O WebSocket, o `JSON.parse`, a validação, a reconexão e a detecção de silêncio rodam em um SharedWorker. Todas as abas e janelas da origem compartilham a mesma conexão.

**Cada documento recebe só o que usa.** O worker soma as assinaturas e entrega a cada documento apenas os ativos e canais que ele assinou. Uma assinatura só é cancelada no servidor quando nenhum documento a usa. Cada painel declara os dados que lê em `PANELS[].feeds`, e `MarketStore.syncSubscriptions` é o único ponto que assina ou cancela. Quando um painel sai de um documento, os dados dele são descartados ali.

**Cada mensagem é aplicada na chegada.** O `MarketStore` grava cada mensagem nos signals assim que ela chega, sem buffer nem limitador de tempo. Entre o socket e o store as mensagens passam por um `Subject` do RxJS, porque um signal perderia todas as mensagens de uma rajada, exceto a última. O Angular, sem `zone.js`, agrupa as mudanças até a próxima renderização, e o navegador pinta na taxa do monitor.

**O trabalho desnecessário é evitado onde não muda o que aparece na tela:**

- Mensagens de um ativo que não é mais o selecionado são ignoradas, e respostas de `getCandles` antigas são identificadas pelo `requestId`.
- Um candle igual ao atual mantém o mesmo array, para o gráfico não redesenhar.
- O gráfico limita a série a 120 candles, sem animações, e atualiza a série existente em vez de recriar o gráfico.
- O ApexCharts é carregado sob demanda, o que mantém o bundle inicial abaixo do limite de 1 MB.
- As listas usam `track` por chave, para reaproveitar as linhas.

### Limites conhecidos

- As medições feitas na thread principal, durante 30 s, mostraram ganho modesto com o SharedWorker: 2,6% menos tempo de tarefas com uma aba e 11,3% com duas. Com uma aba, o tempo de script subiu 6,1%, porque a desserialização do `postMessage` custa mais que o `JSON.parse` que saiu da thread principal.
- O maior custo restante é layout e renderização. As 500 linhas de cotações e as 300 de carteira ficam todas no DOM, sem virtualização.
- A taxa é por conexão. Se documentos selecionarem ativos diferentes, cada ativo fica com uma fração dos 1000 books e 350 candles por segundo.
- Em um rodízio com 500 ativos, a cotação do ativo selecionado pode atrasar até 1 s em relação ao book e ao candle.

## Conexão e estados

| Estado | Quando ocorre |
| --- | --- |
| Conectando | Primeira tentativa de conexão |
| Conectado | O `welcome` do servidor foi recebido |
| Reconectando | A conexão caiu ou ficou 5 s sem mensagens |
| Desconectado | A conexão foi encerrada pela aplicação |
| Indisponível neste navegador | Não há SharedWorker ou o worker não carregou. A aplicação não recebe dados, pois não existe conexão alternativa na thread principal |

As tentativas de reconexão esperam de 1 s a 30 s, com backoff exponencial e sem limite de tentativas. Enquanto a conexão não volta, os painéis mantêm os últimos valores marcados como desatualizados. Cada `welcome` refaz as assinaturas, porque elas não sobrevivem a uma reconexão.

## Janelas independentes

Cada painel tem um controle que o abre em uma janela própria. Enquanto ela existe, o painel sai da página principal e as seções se recompõem. Ao fechar a janela, ele volta ao lugar.

- Cada janela é um documento Angular normal na rota `janela/:painel`, com o próprio `MarketStore` e o próprio ativo selecionado, sobre a conexão compartilhada do worker.
- As janelas abrem com `noopener`, então cada uma roda em processo próprio e uma janela pesada não atrasa as outras.
- O ciclo de vida usa Web Locks, que o navegador libera mesmo se o processo travar. Fechar ou recarregar a página principal fecha as janelas abertas por ela.
- Recarregar uma janela não devolve o painel, desde que ela volte em até 1 s.
- Se a janela não confirmar a abertura em 5 s, por exemplo por bloqueio de pop-up, o painel continua na página e um aviso é exibido.
- A troca de tema na página principal vale também para as janelas abertas.

Web Locks exigem contexto seguro (HTTPS ou `localhost`). Sem esse recurso, o controle de abrir em janela não aparece.

O ativo selecionado não é sincronizado entre documentos, e as janelas de book e gráfico não têm seletor próprio, então elas ficam no primeiro ativo do catálogo. As janelas abertas também não são restauradas depois de recarregar a página principal.

## Tecnologias

- Angular 22, sem `zone.js`, com signals e Angular CLI
- RxJS no transporte de mensagens até o store
- Tailwind CSS 4, somente com classes utilitárias e tokens de tema em `src/styles.css`
- ApexCharts para o candlestick e a distribuição da carteira
- SharedWorker, Web Locks e `BroadcastChannel`
- Vitest com jsdom

## Estrutura

```text
apps/web/src/app/
  market-data/          Sem interface: protocolo, conexão e estado
    connection/         SharedWorker, MarketHub e UpstreamSocket
    market-socket.ts    Fachada da conexão
    market-store.ts     Estado em signals e assinaturas
  market/               Componentes, que apenas leem o MarketStore
    dashboard/          Página principal
    panel-windows/      Catálogo de painéis e janelas independentes
    shared/             Moldura dos painéis, ApexCharts e valores com sinal
  theme/                Tema claro e escuro
apps/server/            Simulador que alimenta a tela
openspec/               Especificações e histórico de mudanças
```

## Licença

Distribuído sob a [GNU Affero General Public License v3.0](LICENSE).

O ApexCharts tem licença própria, com faixa gratuita condicionada à receita e restrições a uso embutido em produtos de terceiros. Confirme os termos antes de distribuir o projeto.
