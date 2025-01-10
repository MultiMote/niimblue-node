import { BluetoothSerialPort } from "bluetooth-serial-port";
import {
  ConnectionInfo,
  NiimbotAbstractClient,
  ConnectResult,
  Utils,
  ConnectEvent,
  DisconnectEvent,
  RawPacketSentEvent,
} from "@mmote/niimbluelib";

// bluetooth-serial-port has no disconnect events
export class NiimbotHeadlessBluetoothClient extends NiimbotAbstractClient {
  private readonly mac: string;
  private readonly port: BluetoothSerialPort;

  constructor(mac: string) {
    super();
    this.mac = mac;
    this.port = new BluetoothSerialPort();
  }

  private async tryConnect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const rawPacketReceivedWrapped = this.processRawPacket.bind(this);

      const onConnect = async () => {
        this.port.on("data", rawPacketReceivedWrapped);
        resolve();
      };

      this.port.findSerialPortChannel(
        this.mac,
        (channel: number) => {
          this.port.connect(this.mac, channel, onConnect, (err?: Error) => {
            if (err) {
              reject(err);
            }
          });
        },
        () => {
          reject(new Error("No device found"));
        }
      );
    });
  }

  public async connect(): Promise<ConnectionInfo> {
    await this.disconnect();
    await this.tryConnect();

    try {
      await this.initialNegotiate();
      await this.fetchPrinterInfo();
    } catch (e) {
      console.error("Unable to fetch printer info.");
      console.error(e);
    }

    const result: ConnectionInfo = {
      deviceName: `Bluetooth (${this.mac})`,
      result: this.info.connectResult ?? ConnectResult.FirmwareErrors,
    };

    this.emit("connect", new ConnectEvent(result));

    return result;
  }

  public isConnected(): boolean {
    return this.port.isOpen();
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  public async disconnect() {
    this.stopHeartbeat();

    if (this.port.isOpen()) {
      this.port.close();
      this.emit("disconnect", new DisconnectEvent());
    }
  }

  public async sendRaw(data: Uint8Array, force?: boolean) {
    const send = async () => {
      if (!this.isConnected()) {
        this.disconnect();
        throw new Error("Disconnected");
      }

      await Utils.sleep(this.packetIntervalMs);

      this.port.write(Buffer.from(data), (err?: Error) => {
        if (err) {
          throw err;
        }
      });

      this.emit("rawpacketsent", new RawPacketSentEvent(data));
    };

    if (force) {
      await send();
    } else {
      await this.mutex.runExclusive(send);
    }
  }
}
