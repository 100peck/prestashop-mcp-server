import type { IncomingMessage, ServerResponse } from "node:http";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { loadConfig } from "../src/config.js";
import { PrestaShopClient } from "../src/prestashop-client.js";
import { registerAllTools } from "../src/tools/index.js";

function unauthorized(res: ServerResponse) {
  res.statusCode = 401;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify({ error: "Unauthorized" }));
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  // Validate config on each request (env vars available at runtime)
  let config;
  try {
    config = loadConfig();
  } catch (err) {
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: String(err) }));
    return;
  }

  // Bearer token authentication
  const authHeader = req.headers["authorization"] ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (token !== config.mcpApiKey) {
    unauthorized(res);
    return;
  }

  // Create a fresh MCP server per request (stateless mode for serverless)
  const mcpServer = new McpServer({
    name: "prestashop-mcp",
    version: "5.0.0",
  });

  const client = new PrestaShopClient(config);
  registerAllTools(mcpServer, client);

  // Stateless transport — no session management needed for serverless
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });

  // Read and parse body manually so the stream isn't consumed before transport reads it
  let parsedBody: unknown;
  try {
    const raw = await new Promise<string>((resolve, reject) => {
      let data = "";
      req.on("data", (chunk: Buffer) => { data += chunk.toString(); });
      req.on("end", () => resolve(data));
      req.on("error", reject);
    });
    parsedBody = raw ? JSON.parse(raw) : undefined;
  } catch {
    res.statusCode = 400;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "Invalid JSON body" }));
    return;
  }

  try {
    await mcpServer.connect(transport);
    await transport.handleRequest(req, res, parsedBody);
  } catch (err) {
    console.error("[MCP ERROR]", err);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: String(err) }));
    }
  } finally {
    await mcpServer.close();
  }
}
