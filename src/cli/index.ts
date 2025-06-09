import { InvalidArgumentError, Option, program } from "@commander-js/extra-typings";
import { PrintDirection, printTaskNames } from "@mmote/niimbluelib";
import { cliStartServer } from "../server";
import { TransportType } from "../utils";
import {
  cliConnectAndPrintImageFile,
  cliFlashFirmware,
  cliPrinterInfo,
  cliScan,
  SharpImageFit,
  SharpImagePosition,
} from "./worker";

const intOption = (value: string): number => {
  const parsed = parseInt(value, 10);
  if (isNaN(parsed) || parsed < 0) {
    throw new InvalidArgumentError("Integer required");
  }
  return parsed;
};

program.name("niimblue-cli");

program
  .command("info")
  .description("Printer information")
  .requiredOption("-d, --debug", "Debug information", false)
  .addOption(
    new Option("-t, --transport <type>", "Transport").makeOptionMandatory().choices(["ble", "serial"] as TransportType[])
  )
  .requiredOption("-a, --address <string>", "Device bluetooth address/name or serial port name/path")
  .action(cliPrinterInfo);

program
  .command("scan")
  .description("Get available device list")
  .requiredOption("-n, --timeout <number>", "Timeout", intOption, 5000)
  .addOption(
    new Option("-t, --transport <type>", "Transport").makeOptionMandatory().choices(["ble", "serial"] as TransportType[])
  )
  .action(cliScan);

program
  .command("print")
  .description("Prints image")
  .argument("<path>", "PNG image path")
  .requiredOption("-d, --debug", "Debug information", false)
  .addOption(
    new Option("-t, --transport <type>", "Transport").makeOptionMandatory().choices(["ble", "serial"] as TransportType[])
  )
  .requiredOption("-a, --address <string>", "Device bluetooth address/name or serial port name/path")
  .addOption(new Option("-o, --print-direction <dir>", "Print direction").choices(["left", "top"] as PrintDirection[]))
  .addOption(new Option("-p, --print-task <type>", "Print task").choices(printTaskNames))
  .requiredOption("-l, --label-type <type number>", "Label type", intOption, 1)
  .requiredOption("-q, --density <number>", "Density", intOption, 3)
  .requiredOption("-n, --quantity <number>", "Quantity", intOption, 1)
  .requiredOption("-x, --threshold <number>", "Threshold", intOption, 128)
  .option("-w, --label-width <number>", "Label width", intOption)
  .option("-h, --label-height <number>", "Label height", intOption)
  .addOption(
    new Option("-f, --image-fit <dir>", "Image fit while resizing (label-width and label-height must be set)").choices([
      "contain",
      "cover",
      "fill",
      "inside",
      "outside",
    ] as SharpImageFit[]).default("contain" as SharpImageFit)
  )
  .addOption(
    new Option("-m, --image-position <dir>", "Image position while resizing (label-width and label-height must be set)").choices([
      "left",
      "top",
      "centre",
      "right top",
      "right",
      "right bottom",
      "bottom",
      "left bottom",
      "left top",
    ] as SharpImagePosition[]).default("centre" as SharpImagePosition)
  )
  .action(cliConnectAndPrintImageFile);

program
  .command("server")
  .description("Start in server mode")
  .requiredOption("-d, --debug", "Debug information", false)
  .requiredOption("-c, --cors", "Enable CORS", false)
  .requiredOption("-p, --port <number>", "Listen port", intOption, 5000)
  .requiredOption("-h, --host <host>", "Listen hostname", "localhost")
  .action(cliStartServer);

program
  .command("flash")
  .description("Flash firmware")
  .requiredOption("-d, --debug", "Debug information", false)
  .addOption(
    new Option("-t, --transport <type>", "Transport").makeOptionMandatory().choices(["ble", "serial"] as TransportType[])
  )
  .requiredOption("-a, --address <string>", "Device bluetooth address/name or serial port name/path")
  .requiredOption("-f, --file <path>", "Firmware path")
  .requiredOption("-n, --new-version <version>", "New firmware version")
  .action(cliFlashFirmware);

program.parse();
