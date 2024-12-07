import { InvalidArgumentError } from "@commander-js/extra-typings";
import {
  AbstractPrintTask,
  EncodedImage,
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
import { ImageEncoder, NiimbotHeadlessBluetoothClient, NiimbotHeadlessSerialClient } from ".";

export type TransportType = "serial" | "bluetooth";

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

export const initClient = (transport: TransportType, address: string, debug: boolean): NiimbotAbstractClient => {
  let client = null;
  if (transport === "serial") {
    client = new NiimbotHeadlessSerialClient(address);
  } else if (transport === "bluetooth") {
    client = new NiimbotHeadlessBluetoothClient(address);
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

export const connectAndPrintImageFile = async (
  path: string,
  options: PrintOptions & DebugOptions & TransportOptions
) => {
  const client: NiimbotAbstractClient = initClient(options.transport, options.address, options.debug);
  const png: PNG = await ImageEncoder.loadPngFile(path);

  await client.connect();

  try {
    await printImage(client, png, options);
  } finally {
    await client.disconnect();
  }
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

  let encoded: EncodedImage = ImageEncoder.encodePng(
    png,
    options.direction ?? client.getModelMetadata()?.printDirection
  );

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
