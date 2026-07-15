import {
  FirmwareProgressEvent,
  LabelType,
  NiimbotAbstractClient,
  NiimbotNodeBleClient,
  NiimbotNodeSerialClient,
  PrintDirection,
  PrintTaskName,
} from "@mmote/niimbluelib";
import fs from "fs";
import sharp from "sharp";
import { ImageEncoder } from "..";
import { initClient, loadImageFromFile, printImages, TransportType } from "../utils";
import { InvalidArgumentError } from "@commander-js/extra-typings";

export type SharpImageFit = "contain" | "cover" | "fill" | "inside" | "outside";
export type SharpImagePosition =
  | "left"
  | "top"
  | "centre"
  | "center"
  | "right top"
  | "right"
  | "right bottom"
  | "bottom"
  | "left bottom"
  | "left top";

export interface TransportOptions {
  transport: TransportType;
  address: string;
}

export interface ScanOptions {
  transport: TransportType;
  timeout: number;
}

export interface InfoOptions {
  transport: TransportType;
  address: string;
  debug: boolean;
}

export interface FirmwareOptions {
  transport: TransportType;
  address: string;
  file: string;
  newVersion: string;
  debug: boolean;
}

export interface PrintOptions {
  printTask?: PrintTaskName;
  printDirection?: PrintDirection;
  quantity: number;
  labelType: LabelType;
  density: number;
  threshold: number;
  labelWidth?: number;
  labelHeight?: number;
  imageFit?: SharpImageFit;
  imagePosition?: SharpImagePosition;
  debug: boolean;
}

const encodeSingleImage = async (
  client: NiimbotAbstractClient,
  path: string,
  options: PrintOptions
): Promise<{ encoded: Awaited<ReturnType<typeof ImageEncoder.encodeImage>>; printTask: PrintTaskName }> => {
  let image: sharp.Sharp = await loadImageFromFile(path);

  image = image.flatten({ background: "#fff" }).threshold(options.threshold);

  if (options.labelWidth !== undefined && options.labelHeight !== undefined) {
    image = image.resize(options.labelWidth, options.labelHeight, {
      kernel: sharp.kernel.nearest,
      fit: options.imageFit ?? "contain",
      position: options.imagePosition ?? "center",
      background: "#fff",
    });
  } else if (options.imageFit !== undefined || options.imagePosition !== undefined) {
    throw new InvalidArgumentError("label-width and label-height must be set");
  }

  const printDirection: PrintDirection | undefined = options.printDirection ?? client.getModelMetadata()?.printDirection;
  const printTask: PrintTaskName | undefined = options.printTask ?? client.getPrintTaskType();

  if (printTask === undefined) {
    throw new Error("Unable to detect print task, please set it manually");
  }

  const encoded = await ImageEncoder.encodeImage(image, printDirection);

  return { encoded, printTask };
};

export const cliConnectAndPrintImageFile = async (paths: string[], options: PrintOptions & TransportOptions) => {
  if (paths.length === 0) {
    console.error("Error: No files provided");
    process.exit(1);
  }

  const missing = paths.filter((p) => !fs.existsSync(p));
  if (missing.length > 0) {
    for (const m of missing) {
      console.error(`Error: File not found: ${m}`);
    }
    process.exit(1);
  }

  const client: NiimbotAbstractClient = initClient(options.transport, options.address, options.debug);

  if (options.debug) {
    console.log("Connecting to", options.transport, options.address);
  }

  await client.connect();

  let status = 0;

  try {
    // Decode/encode all pages up front, then print them as a single multi-page task
    const pages: Awaited<ReturnType<typeof ImageEncoder.encodeImage>>[] = [];
    let printTaskName: PrintTaskName | undefined;

    for (let i = 0; i < paths.length; i++) {
      const path = paths[i];

      if (paths.length > 1) {
        console.log(`Encoding file ${i + 1}/${paths.length}: ${path}`);
      }

      const { encoded, printTask } = await encodeSingleImage(client, path, options);

      if (printTaskName === undefined) {
        printTaskName = printTask;
        if (options.debug) {
          console.log("Print task:", printTaskName);
        }
      }

      pages.push(encoded);
    }

    if (printTaskName === undefined) {
      throw new Error("Unable to detect print task, please set it manually");
    }

    await printImages(
      client,
      printTaskName,
      pages.map((encoded) => ({ encoded })),
      {
        quantity: options.quantity,
        labelType: options.labelType,
        density: options.density,
      }
    );
  } catch (err) {
    console.error("Error printing:", err instanceof Error ? err.message : err);
    status = 1;
  } finally {
    await client.disconnect();
  }

  process.exit(status);
};

export const cliScan = async (options: ScanOptions) => {
  if (options.transport === "ble") {
    const devices = await NiimbotNodeBleClient.scan(options.timeout);
    for (const dev of devices) {
      console.log(`${dev.address}: ${dev.name}`);
    }
  } else if (options.transport === "serial") {
    const devices = await NiimbotNodeSerialClient.scan();
    for (const dev of devices) {
      console.log(`${dev.address}: ${dev.name}`)
    }
  }

  process.exit(0);
};

export const cliPrinterInfo = async (options: InfoOptions) => {
  const client: NiimbotAbstractClient = initClient(options.transport, options.address, options.debug);
  await client.connect();
  console.log("Printer info:", client.getPrinterInfo());
  console.log("Model metadata:", client.getModelMetadata());
  console.log("Detected print task:", client.getPrintTaskType());
  await client.disconnect();
  process.exit(0);
};

export const cliPrinterRfidInfo = async (options: InfoOptions) => {
  const client: NiimbotAbstractClient = initClient(options.transport, options.address, options.debug);
  await client.connect();
  console.log("Paper RFID info:", await client.abstraction.rfidInfo());

  try {
    console.log("Ribbon RFID info:", await client.abstraction.rfidInfo2());
  } catch (ignored) {}

  await client.disconnect();
  process.exit(0);
};

export const cliFlashFirmware = async (options: FirmwareOptions) => {
  const data: Uint8Array = fs.readFileSync(options.file);

  const client: NiimbotAbstractClient = initClient(options.transport, options.address, options.debug);
  await client.connect();

  client.stopHeartbeat();

  const listener = (e: FirmwareProgressEvent) => {
    console.log(`Sending ${e.currentChunk}/${e.totalChunks}`);
  };

  client.on("firmwareprogress", listener);

  try {
    console.log("Uploading firmware...");
    await client.abstraction.firmwareUpgrade(data, options.newVersion);
    console.log("Done, printer will shut down");
  } finally {
    client.off("firmwareprogress", listener);
    await client.disconnect();
  }

  process.exit(0);
};
