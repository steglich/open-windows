# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

A pnpm + Turborepo monorepo for a simulated homebroker. There is no lint or CI setup.

- `apps/server`: Node + TypeScript WebSocket server that publishes fictitious market data from memory.
- `apps/web`: Angular app styled with Tailwind CSS that shows the server's market data in real time.

## Commands

Run from the repository root.

```bash
pnpm install                                      # Install all projects
pnpm dev                                          # Server on ws://127.0.0.1:8090 and web on http://localhost:4200
pnpm build                                        # Build all projects
pnpm test                                         # Run all tests once
pnpm turbo run dev --filter=server                # Run a task in one project (server or web)
pnpm --filter server exec vitest run src/gateway.test.ts   # Run a single server test file
```

The server reads `PORT` (default `8090`), `HOST` (default `127.0.0.1`), and `SEED` (an integer from `0` to `4294967295`; unset means a random seed and the real clock). `turbo.json` passes them through to `dev` only, so a new environment variable must be added there or Turborepo filters it out.

Inside WSL, the `ng` on `PATH` may be the Windows binary. Use the project's CLI instead, for example `pnpm --filter web exec ng generate ...`.

TypeScript is pinned to `~6.0.3` in both apps because Angular 22.2 requires `>=6.0 <6.1`, so do not upgrade it to 7.x independently of Angular. pnpm rejects dependencies with unapproved build scripts, and approvals live in `allowBuilds` in `pnpm-workspace.yaml`.

## Server architecture

The protocol contract (message shapes, channels, error codes) is specified in the OpenSpec specs, typed in `apps/server/src/protocol.ts`, and documented field by field in `apps/server/PROTOCOL.md`.

- A single `MarketSimulator` holds all market state, and `gateway.ts` advances it in one 500 ms cycle, publishing positions then account every second cycle. A single 10 ms timer sends `quote`, `book`, and `candle` continuously to each client at `DEFAULT_CHANNEL_RATES`, one asset per message in rotation (`pacing.ts`). Quote and book agree when they share the cycle `timestamp`, not by send order, so do not add per-channel timers.
- Candle history and orders are answered on request (`getCandles`, `getOrders`) and correlated by `requestId`. Everything else that changes on its own is a channel.
- The quote state is derived from the current session's candles in `market/history.ts`, and positions are replayed from the fills generated in `market/orders.ts`. Keep those derivations: they are what make the sections agree with each other.
- Reproducibility depends on RNG consumption not varying with subscriptions. `tick` draws a fixed amount per asset, and book levels come from a per-asset, per-cycle sub-seed (`deriveSeed`) computed on demand.
- Prices are integer cents internally and are converted to reais only when building messages (`centsToReais`). Keep arithmetic in cents.
- `startGateway` takes the port, cycle interval, seed, volume, and channel rates as options. With a seed, all timestamps come from a simulated clock. Tests use port `0`, short cycles, a seed, a reduced `volume`, explicit `rates` (`0` turns a channel off), and real WebSocket clients (`TestClient` in `src/test-utils.ts`).
- `tsconfig.json` excludes `*.test.ts` and `test-utils.ts`, so `pnpm build` does not type-check tests.

## Web architecture

- `src/app/market-data/` has no UI. The WebSocket lives in a SharedWorker shared by all tabs of the origin: `connection/market.worker.ts` hosts `MarketHub` (per-tab subscriptions, message routing, `requestId` rewriting) on top of `UpstreamSocket` (parsing, reconnection, silence detection). `MarketSocket` is a facade over the `MarketConnection` built by `MarketConnectionFactory`, and `MarketStore` holds the state as signals. Components under `src/app/market/` only read the store, so do not open sockets or subscribe to channels from a component.
- Worker code must not import Angular or RxJS. Without SharedWorker the factory returns a connection whose status is `unavailable`; there is deliberately no main-thread fallback.
- Messages go from socket to store through an RxJS `Subject`, not a signal, because a signal would drop all but the last message of a burst.
- Every `welcome` redoes the subscriptions, since they do not survive a reconnection on the server.
- Each document subscribes only to what its visible panels read. `PANELS[].feeds` in `panel-catalog.ts` declares that per panel, so change it when a panel starts reading another `MarketStore` signal. `Dashboard` and `PanelWindowPage` pass the result to `MarketStore.setFeeds`, and `syncSubscriptions` is the only place that subscribes or unsubscribes. Data no longer in use is discarded.
- `market-protocol.ts` copies the types from `apps/server/src/protocol.ts`, so change both together.
- Components use only Tailwind utility classes. Colors are tokens in `src/styles.css`: `@theme` holds the light values and `:root[data-theme="dark"]` overrides them, so do not use `dark:` variants. Chart colors repeat the tokens in `market/shared/chart-theme.ts`, so change both together. Specs use `FakeWebSocket`, the helpers in `market-data/testing/`, and `IN_PROCESS_MARKET_CONNECTION_PROVIDERS`, because SharedWorker does not exist in jsdom. That connection skips `MarketHub`, whose routing is covered by `market-hub.spec.ts`.
- ApexCharts is reached only through `app-apex-chart` (`market/shared/apex-chart/`), which loads it with a dynamic `import()` via `APEX_CHARTS_LOADER`. A static import would put about 950 kB in the initial bundle and break the 1 MB budget. Specs provide `FAKE_APEX_CHARTS_PROVIDERS`, since the library cannot render in jsdom.
- `app.routes.ts` serves `Dashboard` at `''` and one panel per window at `janela/:painel`, whose slugs come from `market/panel-windows/panel-catalog.ts`. A panel window is a normal Angular document, so it gets its own `MarketStore` and selected asset over the shared worker connection.
- `PanelWindows` opens the windows with `noopener`, so each one gets its own process and `window.open` returns `null`. Do not poll `closed` or rely on messages sent in `pagehide`, which are lost when a process ends. The lifecycle uses Web Locks through `PANEL_WINDOW_BRIDGE`: a window holds a lock and sends `panel-window-ready` over a `BroadcastChannel`, the page waits for that lock and returns the panel after `PANEL_RETURN_DELAY_MS` without a new `ready` (the lock is also released on reload), and windows close themselves when the page's lock is released. `MarketHub` uses a per-tab lock the same way. Web Locks need a secure context; without them the open control is hidden.
- Candle history is requested with `getCandles` for the selected asset. `MarketStore` replaces the in-progress candle from the `candle` channel and requests again when the minute turns.
- The worker validates each frame and forwards its original text. `SharedWorkerMarketConnection` holds data frames until the next animation frame (a 100 ms timer covers hidden documents), parsing only the latest per channel and asset, except `candle`, whose frames are all applied in order. Any other worker message flushes what is pending first, so do not add another batching layer. `MarketStore` applies each message it receives immediately.

## Spec-driven workflow (OpenSpec)

Planning is set up to run through [OpenSpec](https://github.com/Fission-AI/OpenSpec) (CLI 1.16.1, `spec-driven` schema, configured in `openspec/config.yaml`).

- `openspec/specs/<capability-path>/spec.md`: main specs, the current source of truth for system behavior.
- `openspec/changes/<name>/`: active changes, each with `proposal.md`, delta specs under `specs/`, `design.md`, and `tasks.md`. Delta specs describe ADDED/MODIFIED/REMOVED/RENAMED requirements rather than the full spec.
- `openspec/changes/archive/YYYY-MM-DD-<name>/`: completed changes.

The lifecycle is driven by slash commands in `.claude/commands/opsx/`, backed by skills in `.claude/skills/openspec-*`:

| Command | Purpose |
| --- | --- |
| `/opsx:explore` | Think through an idea before or during a change |
| `/opsx:propose` | Create a change and generate all its planning artifacts |
| `/opsx:update` | Revise a change's planning artifacts (never edits code) |
| `/opsx:apply` | Implement the tasks of a change |
| `/opsx:sync` | Merge a change's delta specs into the main specs |
| `/opsx:archive` | Finalize a completed change and move it to the archive |

`/opsx:propose` authorizes planning only: stop once the artifacts exist and wait for a separate request before running `/opsx:apply`, even if the original request asked to build something.

The `.claude/commands/opsx/` and `.claude/skills/openspec-*` files are generated by OpenSpec (`openspec update` refreshes them), so avoid hand-editing them. Project-specific constraints for artifacts belong in the `context`, `rules`, and `operations` fields of `openspec/config.yaml`.

## OpenSpec commands

```bash
openspec list --json                  # Active changes and task progress
openspec list --specs                 # Main specs
openspec status --change "<name>"     # Artifact completion for a change
openspec show <name>                  # Show a change or spec
openspec validate <name>              # Validate a change or spec
```
