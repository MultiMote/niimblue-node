import { InvalidArgumentError } from "@commander-js/extra-typings";
import { FirmwareProgressEvent, NiimbotAbstractClient } from "@mmote/niimbluelib";
import { NiimbotHeadlessBleClient } from "..";
import fs from "fs";
import { initClient, PrintOptions, TransportType } from "../utils";

export interface TransportOptions {
  transport: TransportType;
  address: string;
};

export interface ScanOptions {
  transport: TransportType;
  timeout: number;
};

export interface InfoOptions {
  transport: TransportType;
  address: string;
  debug: boolean;
};

export interface FirmwareOptions {
  transport: TransportType;
  address: string;
  file: string;
  newVersion: string;
  debug: boolean;
};

export const cliConnectAndPrintImageFile = async (path: string, options: PrintOptions & TransportOptions) => {
  const client: NiimbotAbstractClient = initClient(options.transport, options.address, !!options.debug);
  // const png: PNG = await ImageEncoder.loadPngFile(path);

  await client.connect();

  try {
    // await printImage(client, png, options);
  } finally {
    await client.disconnect();
  }

  process.exit(0);
};

export const printBase64Image = async (client: NiimbotAbstractClient, b64: string, options: PrintOptions) => {
  // const png: PNG = await ImageEncoder.loadPngBase64(b64);
  // await printImage(client, png, options);
};

export const cliScan = async (options: ScanOptions) => {
  if (options.transport !== "ble") {
    throw new InvalidArgumentError("Scan is only available for ble");
  }

  const client = new NiimbotHeadlessBleClient();
  const devices = await client.scan(options.timeout);
  devices.forEach((dev) => {
    console.log(`${dev.address}: ${dev.name}`);
  });
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
