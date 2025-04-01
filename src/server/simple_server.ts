import http from "http";
import { z } from "zod";

type RouteHandler = (request: http.IncomingMessage) => unknown;

type Route = {
  path: string;
  method?: "GET" | "POST";
  handler: RouteHandler;
};

export class RestError extends Error {
  readonly status;
  constructor(message: string, status: number = 500) {
    super(message);
    this.status = status;
  }
}

export const writeObj = (response: http.ServerResponse, o: unknown, status: number = 200) => {
  response.setHeader("Content-Type", "application/json");
  response.writeHead(status);
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
  private readonly routes: Route[] = [];
  private corsEnabled: boolean = false;

  enableCors() {
    this.corsEnabled = true;
  }

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

    console.log(`${request.socket.remoteAddress} ${request.method} ${request.url}`);

    if (this.corsEnabled) {
      response.setHeader("Access-Control-Allow-Origin", "*");
      response.setHeader("Access-Control-Allow-Headers", "*");
      response.setHeader("Access-Control-Allow-Methods", "OPTIONS, POST, GET");
      response.setHeader("Access-Control-Max-Age", 2592000); // 30 days

      if (request.method === "OPTIONS") {
        response.writeHead(204);
        response.end();
        return;
      }
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
      writeObj(response, result, 200);

    } catch (e) {
      if (e instanceof z.ZodError) {
        const error = e.issues.map((i) => `${i.path.join("→")}: ${i.message}`).join("\n");
        writeObj(response, { error }, 400);
      } else if (e instanceof RestError) {
        writeObj(response, { error: e.message }, e.status);
      } else {
        writeObj(response, { error: `${e}` }, 500);
      }
    }
  }

  start(host: string, port: number, listeningListener?: () => void) {
    const server: http.Server = http.createServer();
    server.on("request", (req, res) => this.onRequest(req, res));
    server.listen({ port, host }, listeningListener);
  }
}
