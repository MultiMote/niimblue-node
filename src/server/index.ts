import { NiimbotAbstractClient } from "@mmote/niimbluelib";
import { IncomingMessage } from "http";
import { z } from "zod";
import { initClient, printBase64Image, PrintOptionsSchema } from "../service";
import { readBodyJson, SimpleServer } from "./simple_server";
import { NiimbotHeadlessBleClient } from "../client/headless_ble_impl";
import canvas from "canvas";

let client: NiimbotAbstractClient | null = null;
let debug: boolean = false;

export type ServerOptions = {
  debug: boolean;
  port: number;
  host: string;
  cors: boolean;
};

const ConnectSchema = z.object({
  transport: z.enum(["serial", "ble"]),
  address: z.string(),
});

const ScanSchema = z.object({
  transport: z.enum(["serial", "ble"]),
  timeout: z.number().default(5000),
});

const PrintSchema = PrintOptionsSchema.merge(z.object({ image: z.string() }));
const PrintUrlSchema = PrintOptionsSchema.merge(
  z.object({
    image: z.string(),
    labelW: z.number(),
    labelH: z.number(),
    alignX: z.enum(["left", "center", "right"]).default("left"),
  })
);

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

const printUrl = async (r: IncomingMessage) => {
  if (!client?.isConnected()) {
    return [{ error: "Not connected" }, 400];
  }

  const options = await readBodyJson(r, PrintUrlSchema);

  const c = canvas.createCanvas(options.labelW, options.labelH);
  const ctx = c.getContext("2d");

  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, c.width, c.height);

  const putImage = new Promise<void>((resolve, reject) => {
    const img = new canvas.Image();
    img.src = options.image;
    img.onload = () => {
      const imgW = Math.min(img.width, c.height);
      const imgH = Math.min(img.height, c.height);

      let imgX = 0;
      if (options.alignX == "center") {
        imgX = c.width / 2 - imgW / 2;
      } else if (options.alignX == "right") {
        imgX = c.width - imgW;
      }

      ctx.drawImage(img, imgX, 0, imgW, imgH);

      resolve();
    };

    img.onerror = () => {
      reject(new Error("Image load error"));
    };
  });

  await putImage;

  const imageBase64 = c.toDataURL().split("base64,")[1];

  await printBase64Image(client, imageBase64, { debug, ...options });

  return { message: "Printed" };
};

const scan = async (r: IncomingMessage) => {
  const options = await readBodyJson(r, ScanSchema);
  if (options.transport !== "ble") {
    return [{ error: "Scan is only available for ble" }, 400];
  }

  const c = new NiimbotHeadlessBleClient();
  const devices = await c.scan(options.timeout);

  return { devices };
};

export const startServer = (options: ServerOptions) => {
  debug = options.debug;

  const s = new SimpleServer();

  if (options.cors) {
    s.enableCors();
  }

  s.anything("/", index);
  s.post("/connect", connect);
  s.post("/disconnect", disconnect);
  s.get("/connected", connected);
  s.get("/info", info);
  s.post("/print", print);
  s.post("/print-url", printUrl);
  s.post("/scan", scan);

  s.start(options.host, options.port, () => {
    console.log(`Server is listening ${options.host}:${options.port}`);
  });
};
