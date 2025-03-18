import { SimpleServer } from "./simple_server";
import * as w from "./worker";

export type ServerOptions = {
  debug: boolean;
  port: number;
  host: string;
  cors: boolean;
};

export const cliStartServer = (options: ServerOptions) => {
  w.setDebug(options.debug);

  const s = new SimpleServer();

  if (options.cors) {
    s.enableCors();
  }

  s.anything("/", w.index);
  s.post("/connect", w.connect);
  s.post("/disconnect", w.disconnect);
  s.get("/connected", w.connected);
  s.get("/info", w.info);
  s.post("/print", w.print);
  s.post("/scan", w.scan);

  s.start(options.host, options.port, () => {
    console.log(`Server is listening ${options.host}:${options.port}`);
  });
};
