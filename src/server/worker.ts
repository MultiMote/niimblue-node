import {
  LabelType,
  NiimbotAbstractClient,
  NiimbotNodeBleClient,
  NiimbotNodeSerialClient,
  PrintDirection,
  PrintTaskName,
  printTaskNames
} from "@mmote/niimbluelib";
import { IncomingMessage } from "http";
import sharp from "sharp";
import { z } from "zod";
import { ImageEncoder } from "../image_encoder";
import { initClient, loadImageFromBase64, loadImageFromUrl, printImages, PrintPage } from "../utils";
import { readBodyJson, RestError } from "./simple_server";

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

const PageSchema = z
  .object({
    imageBase64: z.string().optional(),
    imageUrl: z.string().optional(),
    quantity: z.number().min(1).optional(),
  })
  .refine(
    ({ imageUrl, imageBase64 }) => {
      return !!imageUrl !== !!imageBase64;
    },
    { message: "imageUrl or imageBase64 must be defined", path: ["image"] }
  );

const PrintSchema = z
  .object({
    printDirection: z.enum(["left", "top"]).optional(),
    printTask: z.enum([firstTask, ...otherTasks]).optional(),
    quantity: z.number().min(1).default(1),
    labelType: z.number().min(1).default(LabelType.WithGaps),
    density: z.number().min(1).default(3),
    imageBase64: z.string().optional(),
    imageUrl: z.string().optional(),
    pages: z.array(PageSchema).min(1).optional(),
    labelWidth: z.number().positive().optional(),
    labelHeight: z.number().positive().optional(),
    threshold: z.number().min(1).max(255).default(128),
    imagePosition: z
      .enum(["centre", "center", "top", "right top", "right", "right bottom", "bottom", "left bottom", "left", "left top"])
      .default("center"),
    imageFit: z.enum(["contain", "cover", "fill", "inside", "outside"]).default("contain"),
    waitUntilFinished: z.boolean().default(true),
  })
  .refine(
    ({ imageUrl, imageBase64, pages }) => {
      // Either the legacy single-image shape, or the new `pages` array, must be provided (not both).
      const hasSingleImage = !!imageUrl || !!imageBase64;
      const hasPages = !!pages;
      return hasSingleImage !== hasPages;
    },
    { message: "Provide either imageUrl/imageBase64 or pages, but not both", path: ["image"] }
  )
  .refine(
    ({ imageUrl, imageBase64 }) => {
      if (!imageUrl && !imageBase64) {
        // handled by the pages branch above
        return true;
      }
      return !!imageUrl !== !!imageBase64;
    },
    { message: "imageUrl or imageBase64 must be defined, not both", path: ["image"] }
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
  return { message: "Disconnected" };
};

export const connected = async () => {
  return { connected: !!client?.isConnected() };
};

export const info = async () => {
  assertConnected();

  return {
    printerInfo: client!.getPrinterInfo(),
    modelMetadata: client!.getModelMetadata(),
    detectedPrintTask: client!.getPrintTaskType(),
  };
};

export const rfid = async () => {
  assertConnected();

  const paperRfidInfo = await client!.abstraction.rfidInfo();

  let ribbonRfidInfo;
  try {
    ribbonRfidInfo = await client!.abstraction.rfidInfo2();
  } catch (ignored) {}

  return { paperRfidInfo, ribbonRfidInfo };
};

const prepareImage = async (
  options: z.infer<typeof PrintSchema>,
  imageBase64: string | undefined,
  imageUrl: string | undefined
): Promise<sharp.Sharp> => {
  let image: sharp.Sharp;

  if (imageBase64 !== undefined) {
    image = await loadImageFromBase64(imageBase64);
  } else if (imageUrl !== undefined) {
    image = await loadImageFromUrl(imageUrl);
  } else {
    throw new RestError("Image is not defined", 400);
  }

  image = image.flatten({ background: "#fff" });

  if (options.labelWidth !== undefined && options.labelHeight !== undefined) {
    image = image.resize(options.labelWidth, options.labelHeight, {
      kernel: sharp.kernel.nearest,
      fit: options.imageFit,
      position: options.imagePosition,
      background: "#fff",
    });
  }

  return image.threshold(options.threshold);
};

export const print = async (r: IncomingMessage) => {
  assertConnected();

  const options = await readBodyJson(r, PrintSchema);

  const printDirection: PrintDirection | undefined = options.printDirection ?? client!.getModelMetadata()?.printDirection;
  const printTask: PrintTaskName | undefined = options.printTask ?? client!.getPrintTaskType();

  if (printTask === undefined) {
    throw new RestError("Unable to detect print task, please set it manually", 400);
  }

  if (debug) {
    console.log("Print task:", printTask);
  }

  // Normalize both the legacy single-image shape and the new `pages` array
  // into a single list of pages to be printed as one multi-page job.
  const pageInputs = options.pages ?? [{ imageBase64: options.imageBase64, imageUrl: options.imageUrl, quantity: options.quantity }];

  const pages: PrintPage[] = [];

  for (const p of pageInputs) {
    const image = await prepareImage(options, p.imageBase64, p.imageUrl);
    const encoded = await ImageEncoder.encodeImage(image, printDirection);
    pages.push({ encoded, quantity: p.quantity });
  }

  const printJob = printImages(client!, printTask, pages, {
    quantity: options.quantity,
    labelType: options.labelType,
    density: options.density,
  });

  if (options.waitUntilFinished) {
    await printJob;
    return { message: "Printed" };
  }

  // Fire-and-forget: don't block the HTTP response on the printer finishing.
  printJob.catch((err) => {
    console.error("Print job failed:", err instanceof Error ? err.message : err);
  });

  return { message: "Print job submitted" };
};

export const scan = async (r: IncomingMessage) => {
  const options = await readBodyJson(r, ScanSchema);

  if (options.transport === "ble") {
    return { devices: await NiimbotNodeBleClient.scan(options.timeout) };
  } else if (options.transport === "serial") {
    return { devices: await NiimbotNodeSerialClient.scan() };
  }

  throw new RestError("Invalid transport", 400);
};
