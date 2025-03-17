import { SerialPort } from "serialport";
import {
  ConnectionInfo,
  NiimbotAbstractClient,
  ConnectResult,
  Utils,
  ConnectEvent,
  DisconnectEvent,
  RawPacketSentEvent,
} from "@mmote/niimbluelib";

// Open SerialPort asynchronously instead of callback
const serialOpenAsync = (path: string): Promise<SerialPort> => {
  return new Promise((resolve, reject) => {
    const p: SerialPort = new SerialPort({ path, baudRate: 115200, endOnClose: true, autoOpen: false });
    p.open((err) => {
      if (err) {
        reject(err);
      } else {
        resolve(p);
      }
    });
  });
};

/** WIP. Uses serial communication (serialport lib) */
export class NiimbotHeadlessSerialClient extends NiimbotAbstractClient {
  private device?: SerialPort;
  private portName?: string;
  private isOpen: boolean = false;

  constructor() {
    super();
  }

  /** Set port for connect */
  public setPort(portName: string) {
    this.portName = portName;
  }

  public async connect(): Promise<ConnectionInfo> {
    await this.disconnect();

    if (!this.portName) {
      throw new Error("Port not set");
    }

    const _port: SerialPort = await serialOpenAsync(this.portName);

    this.isOpen = true;

    _port.on("close", () => {
      this.isOpen = false;
      this.emit("disconnect", new DisconnectEvent());
    });

    _port.on("readable", () => {
      this.dataReady();
    });

    this.device = _port;

    try {
      await this.initialNegotiate();
      await this.fetchPrinterInfo();
    } catch (e) {
      console.error("Unable to fetch printer info (is it turned on?).");
      console.error(e);
    }

    const result: ConnectionInfo = {
      deviceName: `Serial (${this.portName})`,
      result: this.info.connectResult ?? ConnectResult.FirmwareErrors,
    };

    this.emit("connect", new ConnectEvent(result));
    return result;
  }

  private dataReady() {
    while (true) {
      try {
        const result: Buffer | null = this.device!.read();

        if (result !== null) {
          if (this.debug) {
            console.info(`<< serial chunk ${Utils.bufToHex(result)}`);
          }
          this.processRawPacket(result);
        } else {
          break;
        }
      } catch (_e) {
        break;
      }
    }
  }

  public async disconnect() {
    this.stopHeartbeat();
    this.device?.close();
  }

  public isConnected(): boolean {
    return this.isOpen;
  }

  public async sendRaw(data: Uint8Array, force?: boolean) {
    const send = async () => {
      if (!this.isConnected()) {
        throw new Error("Not connected");
      }
      await Utils.sleep(this.packetIntervalMs);
      this.device!.write(Buffer.from(data));
      this.emit("rawpacketsent", new RawPacketSentEvent(data));
    };

    if (force) {
      await send();
    } else {
      await this.mutex.runExclusive(send);
    }
  }
}
