import { program, Option, InvalidArgumentError } from "@commander-js/extra-typings";
import { PrintDirection, printTaskNames } from "@mmote/niimbluelib";
import { startServer as cliStartServer } from "./server";
import { TransportType, cliConnectAndPrintImageFile, cliScan, cliPrinterInfo, cliFlashFirmware } from "./service";

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
  .option("-d, --debug", "Debug information", false)
  .addOption(
    new Option("-t, --transport <type>", "Transport").makeOptionMandatory().choices(["ble", "serial"] as TransportType[])
  )
  .requiredOption("-a, --address <string>", "Device bluetooth address or serial port name/path")
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
  .option("-d, --debug", "Debug information", false)
  .addOption(
    new Option("-t, --transport <type>", "Transport").makeOptionMandatory().choices(["ble", "serial"] as TransportType[])
  )
  .requiredOption("-a, --address <string>", "Device bluetooth address or serial port name/path")
  .addOption(new Option("-o, --direction <dir>", "Print direction").choices(["left", "top"] as PrintDirection[]))
  .addOption(new Option("-p, --print-task <type>", "Print task").choices(printTaskNames))
  .requiredOption("-l, --label-type <type number>", "Label type", intOption, 1)
  .requiredOption("-q, --density <number>", "Density", intOption, 3)
  .requiredOption("-n, --quantity <number>", "Quantity", intOption, 1)
  .action(cliConnectAndPrintImageFile);

program
  .command("server")
  .description("Start in server mode")
  .option("-d, --debug", "Debug information", false)
  .option("-c, --cors", "Enable CORS", false)
  .requiredOption("-p, --port <number>", "Listen port", intOption, 5000)
  .requiredOption("-h, --host <host>", "Listen hostname", "localhost")
  .action(cliStartServer);

program
  .command("flash")
  .description("Flash firmware")
  .option("-d, --debug", "Debug information", false)
  .addOption(
    new Option("-t, --transport <type>", "Transport").makeOptionMandatory().choices(["ble", "serial"] as TransportType[])
  )
  .requiredOption("-a, --address <string>", "Device bluetooth address or serial port name/path")
  .requiredOption("-f, --file <path>", "Firmware path")
  .requiredOption("-n, --new-version <version>", "New firmware version")
  .action(cliFlashFirmware);

program.parse();
