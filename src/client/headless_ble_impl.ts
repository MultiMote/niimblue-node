import noble from "@abandonware/noble";

import {
  ConnectEvent,
  ConnectionInfo,
  ConnectResult,
  DisconnectEvent,
  NiimbotAbstractClient,
  RawPacketSentEvent,
  Utils,
} from "@mmote/niimbluelib";

export interface ScanItem {
  address: string;
  name: string;
}

export class NiimbotHeadlessBleClient extends NiimbotAbstractClient {
  private addr: string = "";
  private device: noble.Peripheral | undefined;
  private channel: noble.Characteristic | undefined;

  constructor() {
    super();
  }

  /** Set device mac address for connect */
  public setAddress(address: string) {
    this.addr = address;
  }

  public static async waitAdapterReady(): Promise<void> {
    if (noble._state === "poweredOn") {
      return;
    }

    return new Promise((resolve, reject) => {
      let timer: NodeJS.Timeout | undefined;

      noble.on("stateChange", async (state) => {
        clearTimeout(timer);

        if (state === "poweredOn") {
          resolve();
        } else {
          reject(new Error(`BLE state is ${state}`));
        }
      });

      timer = setTimeout(() => {
        reject(new Error("Can't init BLE"));
      }, 5000);
    });
  }

  public static async scan(timeoutMs: number = 5000): Promise<ScanItem[]> {
    await NiimbotHeadlessBleClient.waitAdapterReady();

    return new Promise((resolve, reject) => {
      const peripherals: ScanItem[] = [];
      let timer: NodeJS.Timeout | undefined;

      noble.on("discover", async (peripheral: noble.Peripheral) => {
        peripherals.push({
          address: peripheral.address,
          name: peripheral.advertisement.localName || "unknown",
        });
      });

      noble.startScanning([], false, (error?: Error) => {
        if (error) {
          clearTimeout(timer);
          reject(error);
        }
      });

      timer = setTimeout(() => {
        noble.stopScanning();
        resolve(peripherals);
      }, timeoutMs ?? 5000);
    });
  }

  private async getDevice(address: string, timeoutMs: number = 5000): Promise<noble.Peripheral> {
    await NiimbotHeadlessBleClient.waitAdapterReady();

    return new Promise((resolve, reject) => {
      let timer: NodeJS.Timeout | undefined;

      noble.on("discover", async (peripheral: noble.Peripheral) => {
        if (peripheral.address === address) {
          clearTimeout(timer);
          resolve(peripheral);
        }
      });

      noble.startScanning([], false, (error?: Error) => {
        if (error) reject(error);
      });

      timer = setTimeout(() => {
        noble.stopScanning();
        reject(new Error("Device not found"));
      }, timeoutMs ?? 5000);
    });
  }

  private async connectToDevice(address: string, timeoutMs: number = 5000): Promise<void> {
    const periph = await this.getDevice(address, timeoutMs);
    await periph.connectAsync();

    const services: noble.Service[] = await periph.discoverServicesAsync();

    let channelCharacteristic: noble.Characteristic | undefined;

    for (const service of services) {
      if (service.uuid.length < 5) {
        continue;
      }

      const characteristics = await service.discoverCharacteristicsAsync();
      const suitableCharacteristic = characteristics.find(
        (ch) => ch.properties.includes("notify") && ch.properties.includes("writeWithoutResponse")
      );

      if (suitableCharacteristic) {
        channelCharacteristic = suitableCharacteristic;
        break;
      }
    }

    if (channelCharacteristic === undefined) {
      await periph.disconnectAsync();
      throw new Error("Unable to find suitable channel characteristic");
    }

    periph.on("disconnect", () => {
      this.stopHeartbeat();
      this.emit("disconnect", new DisconnectEvent());
      this.device = undefined;
      this.channel = undefined;
    });

    channelCharacteristic.on("read", (data: Buffer, isNotification: boolean) => {
      if (isNotification) this.processRawPacket(new Uint8Array(data));
    });

    channelCharacteristic.subscribeAsync();

    this.channel = channelCharacteristic;
    this.device = periph;
  }

  public async connect(): Promise<ConnectionInfo> {
    await this.disconnect();

    if (!this.addr) {
      throw new Error("Device address not set");
    }

    await this.connectToDevice(this.addr);

    try {
      await this.initialNegotiate();
      await this.fetchPrinterInfo();
    } catch (e) {
      console.error("Unable to fetch printer info.");
      console.error(e);
    }

    const result: ConnectionInfo = {
      deviceName: this.device!.advertisement.localName ?? this.addr,
      result: this.info.connectResult ?? ConnectResult.FirmwareErrors,
    };

    this.emit("connect", new ConnectEvent(result));

    return result;
  }

  public isConnected(): boolean {
    return this.device !== undefined && this.channel !== undefined;
  }

  public async disconnect() {
    this.stopHeartbeat();

    if (this.device !== undefined) {
      await this.device.disconnectAsync();
      this.emit("disconnect", new DisconnectEvent());
    }

    this.device = undefined;
    this.channel = undefined;
  }

  public async sendRaw(data: Uint8Array, force?: boolean) {
    const send = async () => {
      if (!this.isConnected()) {
        this.disconnect();
        throw new Error("Disconnected");
      }

      await Utils.sleep(this.packetIntervalMs);

      await this.channel!.writeAsync(Buffer.from(data), true);

      this.emit("rawpacketsent", new RawPacketSentEvent(data));
    };

    if (force) {
      await send();
    } else {
      await this.mutex.runExclusive(send);
    }
  }
}
