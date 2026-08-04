# mcp-entur

Entur MCP — Norway public transport, nationwide, all modes (developer.entur.org)

Part of [Pipeworx](https://pipeworx.io) — an MCP gateway connecting AI agents to 1394+ live data sources.

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

Or connect to the full Pipeworx gateway for access to all 1394+ data sources:

```json
{
  "mcpServers": {
    "pipeworx": {
      "url": "https://gateway.pipeworx.io/mcp"
    }
  }
}
```

## Using with ask_pipeworx

Instead of calling tools directly, you can ask questions in plain English:

```
ask_pipeworx({ question: "your question about Entur data" })
```

The gateway picks the right tool and fills the arguments automatically.

## More

- [Docs and guides](https://pipeworx.io/docs)
- [pipeworx.io](https://pipeworx.io)

## License

MIT
