import http from "node:http";
import net from "node:net";
import { permittedUrl, resolveTarget } from "./security.mjs";

/** Chromium cannot bypass this DNS-pinning proxy, even if a page changes DNS after validation. */
export async function createEgressProxy(origins, env = process.env) {
  const sockets = new Set();
  const server = http.createServer(async (request, response) => {
    try {
      const url = permittedUrl(request.url, origins, env),
        resolved = await resolveTarget(url, env);
      const headers = { ...request.headers, host: url.host };
      delete headers["proxy-authorization"];
      delete headers.authorization;
      delete headers.cookie;
      const outbound = http.request(
        {
          hostname: resolved.address,
          port: url.port || 80,
          path: `${url.pathname}${url.search}`,
          method: request.method,
          headers,
          timeout: 15000,
        },
        (incoming) => {
          response.writeHead(incoming.statusCode, incoming.headers);
          incoming.pipe(response);
        },
      );
      outbound.on("timeout", () => outbound.destroy());
      outbound.on("error", () => {
        if (!response.headersSent) response.writeHead(502);
        response.end();
      });
      request.pipe(outbound);
    } catch {
      response.writeHead(403);
      response.end("Blocked target.");
    }
  });
  server.on("connection", (socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
  });
  server.on("connect", async (request, client, head) => {
    try {
      const url = permittedUrl(`https://${request.url}`, origins, env),
        resolved = await resolveTarget(url, env);
      const target = net.connect({
        host: resolved.address,
        port: Number(url.port || 443),
      });
      sockets.add(target);
      target.on("close", () => sockets.delete(target));
      target.setTimeout(20000, () => target.destroy());
      target.once("connect", () => {
        client.write("HTTP/1.1 200 Connection Established\r\n\r\n");
        if (head.length) target.write(head);
        target.pipe(client);
        client.pipe(target);
      });
      target.on("error", () => client.destroy());
      client.on("error", () => target.destroy());
      client.on("close", () => target.destroy());
    } catch {
      client.end("HTTP/1.1 403 Forbidden\r\n\r\n");
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return {
    url: `http://127.0.0.1:${server.address().port}`,
    close: async () => {
      for (const socket of sockets) socket.destroy();
      await new Promise((resolve) => server.close(resolve));
    },
  };
}
