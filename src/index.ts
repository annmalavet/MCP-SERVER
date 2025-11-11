import 'dotenv/config';
import express from 'express';

import cors from 'cors';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { server } from './server.js'; 


const app = express();
app.use(express.json({ limit: "2mb" }));
app.use(cors());
app.get("/", (_req, res) => res.status(200).send("GET uses POST /mcp."));
app.options("/mcp", (_req, res) => res.sendStatus(204));
app.options("/", (_req, res) => res.sendStatus(204));


async function handleMCPRequest(req: express.Request, res: express.Response) { 
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });

  transportCleanup(res, transport);
  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
}

app.get("/mcp", handleMCPRequest);
app.post("/mcp", handleMCPRequest);


function transportCleanup(res: express.Response, transport: StreamableHTTPServerTransport) {
  const cleanup = () => {
    try { transport.close(); } catch {}
    res.off("finish", cleanup);
    res.off("close", cleanup);
  };
  res.once("finish", cleanup);
  res.once("close", cleanup);
}

const port = process.env.PORT || 8080;
app.listen(port, () => {
  console.log(`MCP server w tool list listening on port ${port}`);
});