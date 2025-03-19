import {
  AbstractPrintTask,
  EncodedImage,
  LabelType,
  NiimbotAbstractClient,
  PacketReceivedEvent,
  PacketSentEvent,
  PrintProgressEvent,
  PrintTaskName,
  RequestCommandId,
  ResponseCommandId,
  Utils,
} from "@mmote/niimbluelib";
import fs from "fs";
import sharp from "sharp";
import { Readable } from "stream";
import { NiimbotHeadlessBleClient, NiimbotHeadlessSerialClient } from ".";

export type TransportType = "serial" | "ble";

export interface PrintOptions {
  quantity?: number;
  labelType?: LabelType;
  density?: number;
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

export const printImage = async (
  client: NiimbotAbstractClient,
  printTaskName: PrintTaskName,
  encoded: EncodedImage,
  options: PrintOptions
) => {
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

export const loadImageFromBase64 = async (b64: string): Promise<sharp.Sharp> => {
  const buf = Buffer.from(b64, "base64");
  const stream = Readable.from(buf);
  return stream.pipe(sharp());
};

export const loadImageFromUrl = async (url: string): Promise<sharp.Sharp> => {
  const { body, ok, status } = await fetch(url);

  if (!ok) {
    throw new Error(`Can't fetch image, error ${status}`);
  }

  if (body === null) {
    throw new Error("Body is null");
  }

  return Readable.fromWeb(body).pipe(sharp());
};

export const loadImageFromFile = async (path: string): Promise<sharp.Sharp> => {
  const stream = fs.createReadStream(path);
  return stream.pipe(sharp());
};
