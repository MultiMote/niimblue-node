import {
  AbstractPrintTask,
  EncodedImage,
  LabelType,
  NiimbotAbstractClient,
  PacketReceivedEvent,
  PacketSentEvent,
  PrintDirection,
  PrintProgressEvent,
  PrintTaskName,
  RequestCommandId,
  ResponseCommandId,
  Utils,
} from "@mmote/niimbluelib";
import { NiimbotHeadlessSerialClient, NiimbotHeadlessBleClient } from ".";

export type TransportType = "serial" | "ble";

export interface PrintOptions {
  direction?: PrintDirection;
  printTask?: PrintTaskName;
  quantity?: number;
  labelType?: number;
  density?: number;
  debug?: boolean;
}

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

export const printImage = async (client: NiimbotAbstractClient, encoded: EncodedImage, options: PrintOptions) => {
  const printTaskName: PrintTaskName | undefined = options.printTask ?? client.getPrintTaskType();

  if (printTaskName === undefined) {
    throw new Error("Unable to detect print task, please set it manually");
  }

  //   let encoded: EncodedImage = ImageEncoder.encodePng(png, options.direction ?? client.getModelMetadata()?.printDirection);

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
