import { NiimbotAbstractClient, printTaskNames } from "@mmote/niimbluelib";
import { IncomingMessage } from "http";
import { z } from "zod";
import { readBodyJson, RestError } from "./simple_server";
import { NiimbotHeadlessBleClient } from "../client/headless_ble_impl";
import { initClient } from "../utils";

let client: NiimbotAbstractClient | null = null;
let debug: boolean = false;

const ConnectSchema = z.object({
  transport: z.enum(["serial", "ble"]),
  address: z.string(),
});

const ScanSchema = z.object({
  transport: z.enum(["serial", "ble"]),
  timeout: z.number().default(5000),
});

const [firstTask, ...otherTasks] = printTaskNames;

const PrintSchema = z
  .object({
    direction: z.enum(["left", "top"]).optional(),
    printTask: z.enum([firstTask, ...otherTasks]).optional(),
    quantity: z.number().min(1).optional(),
    labelType: z.number().min(1).optional(),
    density: z.number().min(1).optional(),
    imageBase64: z.string().optional(),
    imageUrl: z.string().optional(),
    labelWidth: z.number().positive().optional(),
    labelHeight: z.number().positive().optional(),
    threshold: z.number().min(1).max(255).default(128),
    imagePosition: z
      .enum(["centre", "top", "right top", "right", "right bottom", "bottom", "left bottom", "left", "left top"])
      .default("centre"),
    imageFit: z.enum(["contain", "cover", "fill", "inside", "outside"]).default("contain"),
  })
  .refine(
    ({ imageUrl, imageBase64 }) => {
      return !!imageUrl !== !!imageBase64;
    },
    { message: "imageUrl or imageBase64 must be defined", path: ["image"] }
  );

export const setDebug = (v: boolean): void => {
  debug = v;
};

const assertConnected = () => {
  if (!client?.isConnected()) {
    throw new RestError("Not connected", 400);
  }
};

export const index = () => ({ message: "Server is working" });

export const connect = async (r: IncomingMessage) => {
  const data = await readBodyJson(r, ConnectSchema);

  if (client?.isConnected()) {
    throw new RestError("Already connected", 400);
  }

  client = initClient(data.transport, data.address, debug);
  await client.connect();

  return { message: "Connected" };
};

export const disconnect = async () => {
  assertConnected();

  await client!.disconnect();
  client = null;
  return [{ message: "Disconnected" }];
};

export const connected = async () => {
  return { connected: !!client?.isConnected() };
};

export const info = async () => {
  assertConnected();

  return {
    printerIInfo: client!.getPrinterInfo(),
    modelMetadata: client!.getModelMetadata(),
    detectedPrintTask: client!.getPrintTaskType(),
  };
};

export const print = async (r: IncomingMessage) => {
  assertConnected();

  const options = await readBodyJson(r, PrintSchema);
  //await printBase64Image(client, data.image, { debug, ...data });

  return { message: "Printed" };
};

export const scan = async (r: IncomingMessage) => {
  const options = await readBodyJson(r, ScanSchema);

  if (options.transport !== "ble") {
    throw new RestError("Scan is only available for ble", 400);
  }

  const c = new NiimbotHeadlessBleClient();
  const devices = await c.scan(options.timeout);

  return { devices };
};
