import { MarketHub } from './market-hub';

// O `tsconfig.app.json` usa a lib `dom`, que não declara `SharedWorkerGlobalScope`.
const scope = self as unknown as { onconnect: (event: MessageEvent) => void };
const hub = new MarketHub();

scope.onconnect = (event) => {
  const port = event.ports[0];
  const receive = hub.addPort(port);
  port.onmessage = (message) => receive(message.data);
};
