import { SerialPort } from "serialport";
import {
  ConnectionInfo,
  NiimbotAbstractClient,
  ConnectResult,
  NiimbotPacket,
  Utils,
  ConnectEvent,
  DisconnectEvent,
  PacketReceivedEvent,
  RawPacketReceivedEvent,
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
  private port?: SerialPort = undefined;
  private readonly path: string;
  private isOpen: boolean = false;
  /** Buffer for fragmented data accumulation */
  private packetBuf: Uint8Array = new Uint8Array();

  constructor(path: string) {
    super();
    this.path = path;
  }

  public async connect(): Promise<ConnectionInfo> {
    await this.disconnect();

    const _port: SerialPort = await serialOpenAsync(this.path);

    this.isOpen = true;

    _port.on("close", () => {
      this.isOpen = false;
      this.emit("disconnect", new DisconnectEvent());
    });

    _port.on("readable", () => {
      this.dataReady();
    });

    this.port = _port;

    try {
      await this.initialNegotiate();
      await this.fetchPrinterInfo();
    } catch (e) {
      console.error("Unable to fetch printer info (is it turned on?).");
      console.error(e);
    }

    const result: ConnectionInfo = {
      deviceName: `Serial (${this.path})`,
      result: this.info.connectResult ?? ConnectResult.FirmwareErrors,
    };

    this.emit("connect", new ConnectEvent(result));
    return result;
  }

  private dataReady() {
    while (true) {
      const result: Buffer | null = this.port!.read();
      if (result !== null) {
        const chunk = Uint8Array.from(result);
        if (this.debug) {
          console.info(`<< serial chunk ${Utils.bufToHex(chunk)}`);
        }
        this.packetBuf = Utils.u8ArrayAppend(this.packetBuf, chunk);
      } else {
        break;
      }

      try {
        const packets: NiimbotPacket[] = NiimbotPacket.fromBytesMultiPacket(this.packetBuf);

        if (packets.length > 0) {
          this.emit("rawpacketreceived", new RawPacketReceivedEvent(this.packetBuf));

          packets.forEach((p) => {
            this.emit("packetreceived", new PacketReceivedEvent(p));
          });

          this.packetBuf = new Uint8Array();
        }
      } catch (e) {
        console.info(`Incomplete packet, ignoring:${Utils.bufToHex(this.packetBuf)}`);
      }
    }
  }

  public async disconnect() {
    this.stopHeartbeat();
    this.port?.close();
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
      this.port!.write(Buffer.from(data));
      this.emit("rawpacketsent", new RawPacketSentEvent(data));
    };

    if (force) {
      await send();
    } else {
      await this.mutex.runExclusive(send);
    }
  }
}
