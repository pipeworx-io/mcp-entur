# mcp-entur

Entur MCP — Norway public transport, nationwide, all modes (developer.entur.org)

Part of [Pipeworx](https://pipeworx.io) — an MCP gateway connecting AI agents to 1679+ live data sources.

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

Both URLs reach the same gateway and the same 1679+ data sources. The
only difference is which pack's tools are listed **directly**; `ask_pipeworx`
reaches all of them from either one.

## No MCP client? Call it over HTTP

```bash
curl -X POST https://gateway.pipeworx.io/v1/tools/entur_departures \
  -H 'Content-Type: application/json' \
  -d '{"stop":"Oslo S"}'
```

No account needed for the first calls. Inspect any tool: `GET https://gateway.pipeworx.io/v1/tools/entur_departures`. Find one: `POST https://gateway.pipeworx.io/v1/tools/search_packs` with `{"query":"..."}`.

## Standalone (no gateway account)

This package also runs as a local stdio MCP server — no Pipeworx account, no
gateway round-trip:

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

Or run it directly to confirm it starts:

```bash
npx -y @pipeworx/mcp-entur
```

It speaks MCP over stdin/stdout and answers `initialize`/`tools/list`/`tools/call`
for **only** this pack's tools — none of the shared meta-tools the gateway
connection above adds. Same source, same tools, no ask_pipeworx routing.

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
