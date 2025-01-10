import { program, Option, InvalidArgumentError } from "@commander-js/extra-typings";
import { FirmwareProgressEvent, NiimbotAbstractClient, PrintDirection, printTaskNames, Utils } from "@mmote/niimbluelib";
import { startServer } from "./server";
import { TransportType, initClient, connectAndPrintImageFile } from "./service";
import fs from "fs";

type InfoOptions = {
  transport: TransportType;
  address: string;
  debug: boolean;
};

type FirmwareOptions = {
  transport: TransportType;
  address: string;
  file: string;
  newVersion: string;
  debug: boolean;
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


const flashFirmware = async (options: FirmwareOptions) => {
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
};

program.name("niimblue-cli");

program
  .command("info")
  .description("Printer information")
  .option("-d, --debug", "Debug information", false)
  .addOption(
    new Option("-t, --transport <type>", "Transport")
      .makeOptionMandatory()
      .choices(["bluetooth", "serial"] as TransportType[])
  )
  .requiredOption("-a, --address <string>", "Device bluetooth address or serial port name/path")
  .action(printerInfo);

program
  .command("print")
  .description("Prints image")
  .argument("<path>", "PNG image path")
  .option("-d, --debug", "Debug information", false)
  .addOption(
    new Option("-t, --transport <type>", "Transport")
      .makeOptionMandatory()
      .choices(["bluetooth", "serial"] as TransportType[])
  )
  .requiredOption("-a, --address <string>", "Device bluetooth address or serial port name/path")
  .addOption(new Option("-o, --direction <dir>", "Print direction").choices(["left", "top"] as PrintDirection[]))
  .addOption(new Option("-p, --print-task <type>", "Print task").choices(printTaskNames))
  .requiredOption("-l, --label-type <type number>", "Label type", intOption, 1)
  .requiredOption("-q, --density <number>", "Density", intOption, 3)
  .requiredOption("-n, --quantity <number>", "Quantity", intOption, 1)
  .action(connectAndPrintImageFile);

program
  .command("server")
  .description("Start in server mode")
  .option("-d, --debug", "Debug information", false)
  .requiredOption("-p, --port <number>", "Listen port", intOption, 5000)
  .requiredOption("-h, --host <host>", "Listen hostname", "localhost")
  .action(startServer);

program
  .command("flash")
  .description("Flash firmware")
  .option("-d, --debug", "Debug information", false)
  .addOption(
    new Option("-t, --transport <type>", "Transport")
      .makeOptionMandatory()
      .choices(["bluetooth", "serial"] as TransportType[])
  )
  .requiredOption("-a, --address <string>", "Device bluetooth address or serial port name/path")
  .requiredOption("-f, --file <path>", "Firmware path")
  .requiredOption("-n, --new-version <version>", "New firmware version")
  .action(flashFirmware);

program.parse();
