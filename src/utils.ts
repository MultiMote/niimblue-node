import {
  AbstractPrintTask,
  EncodedImage,
  LabelType,
  NiimbotAbstractClient,
  NiimbotNodeBleClient,
  NiimbotNodeSerialClient,
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

export type TransportType = "serial" | "ble";

export interface PrintOptions {
  quantity?: number;
  labelType?: LabelType;
  density?: number;
}

/** One page of a multi-page print job. */
export interface PrintPage {
  encoded: EncodedImage;
  /** How many copies of this page to print. Defaults to 1. */
  quantity?: number;
}

export const initClient = (transport: TransportType, address: string, debug: boolean): NiimbotAbstractClient => {
  let client = null;
  if (transport === "serial") {
    client = new NiimbotNodeSerialClient();
    client.setPort(address);
  } else if (transport === "ble") {
    client = new NiimbotNodeBleClient();
    client.setAddress(address);
  } else {
    throw new Error("Invalid transport");
  }

  client.on("printprogress", (e: PrintProgressEvent) => {
    console.log(`Page ${e.page}/${e.pagesTotal}, Page print ${e.pagePrintProgress}%, Page feed ${e.pageFeedProgress}%`);
  });

  client.on("heartbeatfailed", (e) => {
    const maxFails = 5;
    console.warn(`Heartbeat failed ${e.failedAttempts}/${maxFails}`);

    if (e.failedAttempts >= maxFails) {
      console.warn("Disconnecting");
      client.disconnect();
    }
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

/**
 * Prints one or more pages (images) as a single print task/job.
 * Each page carries its own `quantity` (label copies), falling back to
 * `options.quantity` (and finally 1) when not set on the page itself.
 */
export const printImages = async (
  client: NiimbotAbstractClient,
  printTaskName: PrintTaskName,
  pages: PrintPage[],
  options: PrintOptions
) => {
  const defaultQuantity = options.quantity ?? 1;
  const resolvedPages = pages.map((p) => ({ encoded: p.encoded, quantity: p.quantity ?? defaultQuantity }));
  const totalPages = resolvedPages.reduce((sum, p) => sum + p.quantity, 0);

  const printTask: AbstractPrintTask = client.abstraction.newPrintTask(printTaskName, {
    density: options.density ?? 3,
    labelType: options.labelType ?? LabelType.WithGaps,
    totalPages,
    statusPollIntervalMs: 500,
    statusTimeoutMs: 8_000,
  });

  try {
    await printTask.printInit();

    for (const page of resolvedPages) {
      await printTask.printPage(page.encoded, page.quantity);
      await printTask.waitForPageFinished();
    }

    await printTask.waitForFinished();
  } finally {
    await printTask.printEnd();
  }
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
