import { NiimbotAbstractClient } from "@mmote/niimbluelib";
import { IncomingMessage } from "http";
import { z } from "zod";
import { initClient, printBase64Image, PrintOptionsSchema } from "../service";
import { readBodyJson, SimpleServer } from "./simple_server";

let client: NiimbotAbstractClient | null = null;
let debug: boolean = false;

export type ServerOptions = {
  debug: boolean;
  port: number;
  host: string;
};

const ConnectSchema = z.object({
  transport: z.enum(["serial", "bluetooth"]),
  address: z.string(),
});

const PrintSchema = PrintOptionsSchema.merge(z.object({ image: z.string() }));

const index = () => ({ message: "Server is working" });

const connect = async (r: IncomingMessage) => {
  const data = await readBodyJson(r, ConnectSchema);

  if (client?.isConnected()) {
    return [{ error: "Already connected" }, 400];
  }

  client = initClient(data.transport, data.address, debug);
  await client.connect();

  return { message: "Connected" };
};

const disconnect = async () => {
  if (!client?.isConnected()) {
    return [{ error: "Not connected" }, 400];
  }

  await client.disconnect();
  client = null;
  return [{ message: "Disconnected" }];
};

const connected = async () => {
  return { connected: !!client?.isConnected() };
};

const info = async () => {
  if (!client?.isConnected()) {
    return [{ error: "Not connected" }, 400];
  }

  return {
    printerIInfo: client.getPrinterInfo(),
    modelMetadata: client.getModelMetadata(),
    detectedPrintTask: client.getPrintTaskType(),
  };
};

const print = async (r: IncomingMessage) => {
  if (!client?.isConnected()) {
    return [{ error: "Not connected" }, 400];
  }

  const data = await readBodyJson(r, PrintSchema);

  await printBase64Image(client, data.image, { debug, ...data });

  return { message: "Printed" };
};

export const startServer = (options: ServerOptions) => {
  debug = options.debug;

  const s = new SimpleServer();

  s.anything("/", index);
  s.post("/connect", connect);
  s.post("/disconnect", disconnect);
  s.get("/connected", connected);
  s.get("/info", info);
  s.post("/print", print);

  s.start(options.host, options.port, () => {
    console.log(`Server is listening ${options.host}:${options.port}`);
  });
};
