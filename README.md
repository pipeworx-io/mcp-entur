# mcp-entur

Entur MCP — Norway public transport, nationwide, all modes (developer.entur.org)

Part of [Pipeworx](https://pipeworx.io) — an MCP gateway connecting AI agents to 1856+ live data sources. This is an independent, unofficial integration — not affiliated with, endorsed by, or published by the upstream provider.

## Tools

| Tool | Description |
|------|-------------|
| `entur_departures` | Real-time departures board for any public-transport stop in Norway — train, tram, metro, bus, and ferry departures for Oslo, Bergen, Trondheim, Stavanger and every other Norwegian stop, from Entur (the national journey-planning authority covering Vy, Flytoget, Ruter, Skyss, AtB, formerly NSB). Returns line, destination, aimed vs expected time, delay in minutes, platform/quay, and realtime flag. Example: entur_departures({ stop: "Oslo S", mode: "rail" }) |
| `entur_journey` | Entur journey planner — plan a public-transport trip between any two places in Norway (Oslo to Bergen train, airport connections, city tram/metro/bus routes, ferries). Returns door-to-door itineraries with legs (mode, line, operator like Vy or Flytoget, aimed and expected times), total duration, transfer count, and walking distance. Example: entur_journey({ from: "Oslo S", to: "Bergen stasjon" }) |
| `entur_stops_search` | Search Norwegian public-transport stops, train stations, tram/metro/bus stops, ferry quays and places by name via the Entur national stop-register geocoder. Returns official name, NSR id (usable in entur_departures and entur_journey), locality, categories, transport modes, and coordinates. Example: entur_stops_search({ query: "Trondheim" }) |

## Quick Start

Add to your MCP client (Claude Desktop, Cursor, Windsurf, etc.):

```json
{
  "mcpServers": {
    "entur": {
      "url": "https://gateway.pipeworx.io/entur/mcp"
    }
  }
}
```

### What this endpoint actually serves

`tools/list` at `https://gateway.pipeworx.io/entur/mcp` returns the tools in the table
above **plus the shared Pipeworx meta-tools** — `ask_pipeworx`,
`discover_tools`, `search_within`, `remember`/`recall` and the rest of the
gateway-wide set. So the tool count you see is larger than this table: a
single-pack endpoint currently lists roughly 30 shared tools alongside the
pack's own. The connection's `initialize` response states its exact scope, and
is the authoritative answer for a given day.

This is deliberate, not multiplexing by accident. The meta-tools are what let a
scoped connection answer a question this pack does not cover — via
`ask_pipeworx`, which routes across the whole catalog — without you adding a
second MCP server. There is currently no way to mount a pack endpoint without
them; if the extra schemas cost you more context than the routing is worth,
connect to the full gateway once rather than to several pack endpoints.

Or connect to the full Pipeworx gateway to get every pack's tools listed
directly, instead of just this one's:

```json
{
  "mcpServers": {
    "pipeworx": {
      "url": "https://gateway.pipeworx.io/mcp"
    }
  }
}
```

Both URLs reach the same gateway and the same 1856+ data sources. The
only difference is which pack's tools are listed **directly**; `ask_pipeworx`
reaches all of them from either one.

## No MCP client? Call it over HTTP

```bash
curl -X POST https://gateway.pipeworx.io/v1/tools/entur_departures \
  -H 'Content-Type: application/json' \
  -d '{"stop":"Oslo S"}'
```

No account needed for the first calls. Inspect any tool: `GET https://gateway.pipeworx.io/v1/tools/entur_departures`. Find one: `POST https://gateway.pipeworx.io/v1/tools/search_packs` with `{"query":"..."}`.

## Run it from npm

`@pipeworx/mcp-entur` is a local stdio bridge to the Pipeworx gateway: your MCP client
starts it with `npx`, and it forwards every call to the same
`https://gateway.pipeworx.io/entur/mcp` endpoint shown above. It needs network access;
there is no offline mode.

```json
{
  "mcpServers": {
    "entur": {
      "command": "npx",
      "args": ["-y", "@pipeworx/mcp-entur"]
    }
  }
}
```

Without a key it calls anonymously, capped at 50 calls a day. A free account
raises that to 200 a day: get a key at https://pipeworx.io/signup and add
`"env": { "PIPEWORX_API_KEY": "<your key>" }` to the server entry.
The key is sent as a Bearer token, the same way a hosted connection sends it,
so calls are metered and billed exactly as they are there.

It lists **only** this pack's tools by default. Set `PIPEWORX_META_TOOLS=1` to
also list `ask_pipeworx` and the other gateway-wide tools.

Behind an HTTPS proxy: Node's built-in `fetch` does not read `HTTPS_PROXY` by
default. Newer Node releases honour it when `NODE_USE_ENV_PROXY=1` is set; check
your Node version's documentation.

## Using with ask_pipeworx

Instead of calling tools directly, you can ask questions in plain English —
this works on the pack endpoint above as well as on the full gateway:

```
ask_pipeworx({ question: "your question about Entur data" })
```

The gateway picks the right tool and fills the arguments automatically.

## More

- [Docs and guides](https://pipeworx.io/docs)
- [pipeworx.io](https://pipeworx.io)

## License

MIT
