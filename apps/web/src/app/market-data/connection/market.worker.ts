import { MarketHub } from './market-hub';

// O `tsconfig.app.json` usa a lib `dom`, que não declara `SharedWorkerGlobalScope`.
const scope = self as unknown as { onconnect: (event: MessageEvent) => void };
// `navigator.locks` só existe em contexto seguro, embora a lib `dom` o declare sempre.
const locks = navigator.locks as LockManager | undefined;
const hub = new MarketHub((lock, onExit) => void locks?.request(lock, onExit));

scope.onconnect = (event) => {
  const port = event.ports[0];
  const receive = hub.addPort(port);
  port.onmessage = (message) => receive(message.data);
};
