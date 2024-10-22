import { program, Option, InvalidArgumentError } from "@commander-js/extra-typings";
import { NiimbotHeadlessSerialClient, NiimbotHeadlessBluetoothClient, ImageEncoder } from ".";
import {
  Utils,
  RequestCommandId,
  ResponseCommandId,
  PrintTaskName,
  NiimbotAbstractClient,
  PrintProgressEvent,
  PacketSentEvent,
  PacketReceivedEvent,
  PrintDirection,
  EncodedImage,
  printTaskNames,
} from "@mmote/niimbluelib";
import { Canvas, CanvasRenderingContext2D, createCanvas, Image, loadImage } from "canvas";
import { AbstractPrintTask } from "@mmote/niimbluelib/dist/print_tasks/AbstractPrintTask";

type ConnectionType = "serial" | "bluetooth";

type PrintOptions = {
  direction?: PrintDirection;
  transport: ConnectionType;
  printTask?: PrintTaskName;
  address: string;
  debug: boolean;
  quantity: number;
};

type InfoOptions = {
  transport: ConnectionType;
  address: string;
  debug: boolean;
};

const initClient = (transport: ConnectionType, address: string, debug: boolean): NiimbotAbstractClient => {
  let client = null;
  if (transport === "serial") {
    client = new NiimbotHeadlessSerialClient(address);
  } else if (transport === "bluetooth") {
    client = new NiimbotHeadlessBluetoothClient(address);
  } else {
    throw new Error("Invalid transport");
  }

  client.addEventListener("printprogress", (e: PrintProgressEvent) => {
    console.log(`Page ${e.page}/${e.pagesTotal}, Page print ${e.pagePrintProgress}%, Page feed ${e.pageFeedProgress}%`);
  });

  if (debug) {
    client.addEventListener("packetsent", (e: PacketSentEvent) => {
      console.log(`>> ${Utils.bufToHex(e.packet.toBytes())} (${RequestCommandId[e.packet.command]})`);
    });

    client.addEventListener("packetreceived", (e: PacketReceivedEvent) => {
      console.log(`<< ${Utils.bufToHex(e.packet.toBytes())} (${ResponseCommandId[e.packet.command]})`);
    });

    client.addEventListener("connect", () => {
      console.log("Connected");
    });

    client.addEventListener("disconnect", () => {
      console.log("Disconnected");
    });
  }

  return client;
};

const printImage = async (path: string, options: PrintOptions) => {
  const image: Image = await loadImage(path);
  const canvas: Canvas = createCanvas(image.width, image.height);
  const ctx: CanvasRenderingContext2D = canvas.getContext("2d");

  ctx.fillStyle = "white";
  ctx.lineWidth = 3;

  // fill background
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);


  const client: NiimbotAbstractClient = initClient(options.transport, options.address, options.debug);
  await client.connect();

  const printTaskName: PrintTaskName | undefined = options.printTask ?? client.getPrintTaskType();

  if (printTaskName === undefined) {
    throw new InvalidArgumentError("Unable to detect print task, please set it manually");
  }

  const encoded: EncodedImage = ImageEncoder.encodeCanvas(canvas, options.direction ?? client.getModelMetadata()?.printDirection);

  const printTask: AbstractPrintTask = client.abstraction.newPrintTask(printTaskName, {
    totalPages: options.quantity,
    statusPollIntervalMs: 100,
    statusTimeoutMs: 8_000,
  });

  try {
    await printTask.printInit();
    await printTask.printPage(encoded, options.quantity);
    await printTask.waitForFinished();
  } catch (e) {
    console.error(e);
  }

  await client.abstraction.printEnd();
  await client.disconnect();
};

const intOption = (value: string): number => {
  const parsed = parseInt(value, 10);
  if (isNaN(parsed) || parsed < 0) {
    throw new InvalidArgumentError("Integer required");
  }
  return parsed;
};

const printerInfo = async (options: InfoOptions) => {
  const client: NiimbotAbstractClient = initClient(options.transport, options.address, options.debug);
  await client.connect();
  console.log("Printer info:", client.getPrinterInfo());
  console.log("Model metadata:", client.getModelMetadata());
  console.log("Detected print task:", client.getPrintTaskType());
  await client.disconnect();
};

program
  .name("niimblue-cli");

program
  .command("info")
  .description("Printer information")
  .option("-d, --debug", "Debug information", false)
  .addOption(
    new Option("-t, --transport <type>", "Transport")
      .makeOptionMandatory()
      .choices(["bluetooth", "serial"] as ConnectionType[])
  )
  .requiredOption("-a, --address <string>", "Device bluetooth address or serial port name/path")
  .action(printerInfo);

program
  .command("print")
  .description("Prints image")
  .argument("<path>", "Image path")
  .option("-d, --debug", "Debug information", false)
  .addOption(
    new Option("-t, --transport <type>", "Transport")
      .makeOptionMandatory()
      .choices(["bluetooth", "serial"] as ConnectionType[])
  )
  .requiredOption("-a, --address <string>", "Device bluetooth address or serial port name/path")
  .addOption(
    new Option("-o, --direction <dir>", "Print direction")
      .choices(["left", "top"] as PrintDirection[])
  )
  .addOption(new Option("-p, --print-task <type>", "Print task").choices(printTaskNames))
  .requiredOption("-q, --quantity <number>", "Quantity", intOption, 1)
  .action(printImage);

program.parse();
