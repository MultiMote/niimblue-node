import http from "http";
import { z } from "zod";

type RouteResponse = [resp: unknown, code: number] | unknown;

type RouteHandler = (request: http.IncomingMessage) => RouteResponse;

type Route = {
  path: string;
  method?: "GET" | "POST";
  handler: RouteHandler;
};

export const writeObj = (response: http.ServerResponse, o: unknown, status: number = 200) => {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(o));
};

export const readBodyJson = async <T>(request: http.IncomingMessage, schema: z.ZodType<T>): Promise<T> => {
  return new Promise((resolve, reject) => {
    const bodyParts: any[] = [];

    request
      .on("data", (chunk: any) => {
        bodyParts.push(chunk);
      })
      .on("end", () => {
        let body = Buffer.concat(bodyParts).toString();
        let data = null;

        try {
          data = JSON.parse(body);
        } catch (e) {
          reject(e as Error);
        }

        if (data === null) {
          reject(new Error("No data"));
        }

        const result = schema.safeParse(data);
        if (result.success) {
          resolve(result.data);
        } else {
          reject(result.error);
        }
      });
  });
};

export class SimpleServer {
  private routes: Route[] = [];

  get(path: string, handler: RouteHandler) {
    this.routes.push({ path, handler, method: "GET" });
  }

  post(path: string, handler: RouteHandler) {
    this.routes.push({ path, handler, method: "POST" });
  }

  anything(path: string, handler: RouteHandler) {
    this.routes.push({ path, handler });
  }

  private async onRequest(request: http.IncomingMessage, response: http.ServerResponse) {
    if (request.url === undefined || request.method === undefined) {
      return;
    }

    try {

      const route = this.routes.find(
        (r) => r.path === request.url && (r.method === undefined || r.method === request.method)
      );

      if (route === undefined) {
        writeObj(response, { error: "Not found" }, 404);
        return;
      }

      if (request.method === "POST" && request.headers["content-type"] !== "application/json") {
        writeObj(response, { error: "Only JSON accepted" }, 400);
        return;
      }

      const result = await route.handler(request);

      if (Array.isArray(result)) {
        writeObj(response, result[0], result[1]);
      } else {
        writeObj(response, result, 200);
      }
    } catch (e) {
      writeObj(response, { error: `${e}` }, 500);
    }
  }

  start(host: string, port: number, listeningListener?: () => void) {
    const server: http.Server = http.createServer();
    server.on("request", (req, res) => this.onRequest(req, res));
    server.listen({ port, host }, listeningListener);
  }
}
