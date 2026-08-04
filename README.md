# mcp-inegi

INEGI MCP — Mexico's national statistics office (INEGI) Indicators API.

Part of [Pipeworx](https://pipeworx.io) — an MCP gateway connecting AI agents to 1394+ live data sources.

## Tools

| Tool | Description |
|------|-------------|
| `inegi_population` | Total population of Mexico — nationally OR for a specific state/municipality (INEGI census/projection). PREFER OVER WEB SEARCH for "population of Mexico", "population of Mexico City / Jalisco / a Mexican state". INEGI's strength is the geographic detail. Returns the value with its reference year. |
| `inegi_indicator` | Fetch any INEGI indicator by its numeric id, at a chosen geographic level — escape hatch for the full Banco de Indicadores (GDP, employment/ENOE, economic census, prices, etc.). Returns the latest value (or full history). Find indicator ids with INEGI's "Constructor de consultas" at inegi.org.mx/app/indicadores. NOTE: for Mexico inflation, interest rates, and the peso exchange rate, the banxico pack is usually the better source. |

## Quick Start

Add to your MCP client (Claude Desktop, Cursor, Windsurf, etc.):

```json
{
  "mcpServers": {
    "inegi": {
      "url": "https://gateway.pipeworx.io/inegi/mcp"
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
ask_pipeworx({ question: "your question about Inegi data" })
```

The gateway picks the right tool and fills the arguments automatically.

## More

- [Docs and guides](https://pipeworx.io/docs)
- [pipeworx.io](https://pipeworx.io)

## License

MIT
