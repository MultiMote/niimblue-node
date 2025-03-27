import {
  FirmwareProgressEvent,
  LabelType,
  NiimbotAbstractClient,
  PrintDirection,
  PrintTaskName,
} from "@mmote/niimbluelib";
import fs from "fs";
import sharp from "sharp";
import { ImageEncoder, NiimbotHeadlessBleClient, NiimbotHeadlessSerialClient } from "..";
import { initClient, loadImageFromFile, printImage, TransportType } from "../utils";
import { InvalidArgumentError } from "@commander-js/extra-typings";

export type SharpImageFit = "contain" | "cover" | "fill" | "inside" | "outside";
export type SharpImagePosition =
  | "left"
  | "top"
  | "centre"
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

export const cliConnectAndPrintImageFile = async (path: string, options: PrintOptions & TransportOptions) => {
  const client: NiimbotAbstractClient = initClient(options.transport, options.address, options.debug);

  if (options.debug) {
    console.log("Connecting to", options.transport, options.address);
  }

  await client.connect();

  let image: sharp.Sharp = await loadImageFromFile(path);

  image = image.flatten({ background: "#fff" }).threshold(options.threshold);

  if (options.labelWidth !== undefined && options.labelHeight !== undefined) {
    image = image.resize(options.labelWidth, options.labelHeight, {
      kernel: sharp.kernel.nearest,
      fit: options.imageFit,
      position: options.imagePosition,
      background: "#fff",
    });
  } else if(options.imageFit !== undefined || options.imagePosition !== undefined) {
    throw new InvalidArgumentError("label-width and label-height must be set");
  }

  const printDirection: PrintDirection | undefined = options.printDirection ?? client.getModelMetadata()?.printDirection;
  const printTask: PrintTaskName | undefined = options.printTask ?? client.getPrintTaskType();

  const encoded = await ImageEncoder.encodeImage(image, printDirection);

  if (printTask === undefined) {
    throw new Error("Unable to detect print task, please set it manually");
  }

  if (options.debug) {
    console.log("Print task:", printTask);
  }

  try {
    await printImage(client, printTask, encoded, {
      quantity: options.quantity,
      labelType: options.labelType,
      density: options.density,
    });
  } finally {
    await client.disconnect();
  }

  process.exit(0);
};

export const cliScan = async (options: ScanOptions) => {
  if (options.transport === "ble") {
    const devices = await NiimbotHeadlessBleClient.scan(options.timeout);
    devices.forEach((dev) => console.log(`${dev.address}: ${dev.name}`));
  } else if (options.transport === "serial") {
    const devices = await NiimbotHeadlessSerialClient.scan();
    devices.forEach((dev) => console.log(`${dev.address}: ${dev.name}`));
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
