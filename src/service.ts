import { InvalidArgumentError } from "@commander-js/extra-typings";
import {
  AbstractPrintTask,
  EncodedImage,
  FirmwareProgressEvent,
  LabelType,
  NiimbotAbstractClient,
  PacketReceivedEvent,
  PacketSentEvent,
  PrintProgressEvent,
  PrintTaskName,
  printTaskNames,
  RequestCommandId,
  ResponseCommandId,
  Utils,
} from "@mmote/niimbluelib";
import { PNG } from "pngjs";
import { z } from "zod";
import { ImageEncoder, NiimbotHeadlessBleClient, NiimbotHeadlessSerialClient } from ".";
import fs from "fs";

export type TransportType = "serial" | "ble";

const [firstTask, ...otherTasks] = printTaskNames;

export const PrintOptionsSchema = z.object({
  direction: z.enum(["left", "top"]).optional(),
  printTask: z.enum([firstTask, ...otherTasks]).optional(),
  quantity: z.number().min(1).optional(),
  labelType: z.number().min(1).optional(),
  density: z.number().min(1).optional(),
});

export type PrintOptions = z.infer<typeof PrintOptionsSchema>;

export type TransportOptions = {
  transport: TransportType;
  address: string;
};

export type DebugOptions = {
  debug: boolean;
};

export type ScanOptions = {
  transport: TransportType;
  timeout: number;
};

export type InfoOptions = {
  transport: TransportType;
  address: string;
  debug: boolean;
};

export type FirmwareOptions = {
  transport: TransportType;
  address: string;
  file: string;
  newVersion: string;
  debug: boolean;
};

export const initClient = (transport: TransportType, address: string, debug: boolean): NiimbotAbstractClient => {
  let client = null;
  if (transport === "serial") {
    client = new NiimbotHeadlessSerialClient();
    client.setPort(address);
  } else if (transport === "ble") {
    client = new NiimbotHeadlessBleClient();
    client.setAddress(address);
  } else {
    throw new Error("Invalid transport");
  }

  client.on("printprogress", (e: PrintProgressEvent) => {
    console.log(`Page ${e.page}/${e.pagesTotal}, Page print ${e.pagePrintProgress}%, Page feed ${e.pageFeedProgress}%`);
  });

  if (debug) {
    client.on("packetsent", (e: PacketSentEvent) => {
      console.log(`>> ${Utils.bufToHex(e.packet.toBytes())} (${RequestCommandId[e.packet.command]})`);
    });

    client.on("packetreceived", (e: PacketReceivedEvent) => {
      console.log(`<< ${Utils.bufToHex(e.packet.toBytes())} (${ResponseCommandId[e.packet.command]})`);
    });

    client.on("connect", () => {
      console.log("Connected");
    });

    client.on("disconnect", () => {
      console.log("Disconnected");
    });
  }

  return client;
};

export const cliConnectAndPrintImageFile = async (path: string, options: PrintOptions & DebugOptions & TransportOptions) => {
  const client: NiimbotAbstractClient = initClient(options.transport, options.address, options.debug);
  const png: PNG = await ImageEncoder.loadPngFile(path);

  await client.connect();

  try {
    await printImage(client, png, options);
  } finally {
    await client.disconnect();
  }

  process.exit(0);
};

export const printBase64Image = async (
  client: NiimbotAbstractClient,
  b64: string,
  options: PrintOptions & DebugOptions
) => {
  const png: PNG = await ImageEncoder.loadPngBase64(b64);
  await printImage(client, png, options);
};

export const printImage = async (client: NiimbotAbstractClient, png: PNG, options: PrintOptions & DebugOptions) => {
  const printTaskName: PrintTaskName | undefined = options.printTask ?? client.getPrintTaskType();

  if (printTaskName === undefined) {
    throw new InvalidArgumentError("Unable to detect print task, please set it manually");
  }

  let encoded: EncodedImage = ImageEncoder.encodePng(png, options.direction ?? client.getModelMetadata()?.printDirection);

  if (options.debug) {
    console.log("Print task:", printTaskName);
  }

  const printTask: AbstractPrintTask = client.abstraction.newPrintTask(printTaskName, {
    density: options.density ?? 3,
    labelType: options.labelType ?? LabelType.WithGaps,
    totalPages: options.quantity ?? 1,
    statusPollIntervalMs: 500,
    statusTimeoutMs: 8_000,
  });

  try {
    await printTask.printInit();
    await printTask.printPage(encoded, options.quantity ?? 1);
    await printTask.waitForFinished();
  } catch (e) {
    console.error(e);
  }

  await client.abstraction.printEnd();
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
