import { EncodedImage, ImageRow, PrintDirection, Utils } from "@mmote/niimbluelib";
import fs from "fs";
import { PNG, PNGOptions } from "pngjs";
import { Readable } from "stream";

const pngOptions: PNGOptions = {
  // remove alpha channel and add white background
  colorType: 2,
  bgColor: {
    red: 255,
    green: 255,
    blue: 255,
  },
};

export class ImageEncoder {
  static loadPngStream(stream: Readable): Promise<PNG> {
    return new Promise((resolve, reject) => {
      stream
        .pipe(new PNG(pngOptions))
        .on("parsed", function () {
          resolve(this);
        })
        .on("error", (e: Error) => reject(e));
    });
  }

  static async loadPngFile(path: string): Promise<PNG> {
    const stream = fs.createReadStream(path);
    return await this.loadPngStream(stream);
  }

  static async loadPngBase64(b64: string): Promise<PNG> {
    const buf = Buffer.from(b64, "base64");
    const stream = Readable.from(buf);
    return await this.loadPngStream(stream);
  }

  static encodePng(png: PNG, printDirection: PrintDirection = "left"): EncodedImage {
    const rowsData: ImageRow[] = [];

    let cols: number = png.width;
    let rows: number = png.height;

    if (printDirection === "left") {
      cols = png.height;
      rows = png.width;
    }

    if (cols % 8 !== 0) {
      throw new Error("Column count must be multiple of 8");
    }

    for (let row = 0; row < rows; row++) {
      let isVoid: boolean = true;
      let blackPixelsCount: number = 0;
      const rowData = new Uint8Array(cols / 8);

      for (let colOct = 0; colOct < cols / 8; colOct++) {
        let pixelsOctet: number = 0;
        for (let colBit = 0; colBit < 8; colBit++) {
          if (ImageEncoder.isPixelNonWhite(png, colOct * 8 + colBit, row, printDirection)) {
            pixelsOctet |= 1 << (7 - colBit);
            isVoid = false;
            blackPixelsCount++;
          }
        }
        rowData[colOct] = pixelsOctet;
      }

      const newPart: ImageRow = {
        dataType: isVoid ? "void" : "pixels",
        rowNumber: row,
        repeat: 1,
        rowData: isVoid ? undefined : rowData,
        blackPixelsCount,
      };

      // Check previous row and increment repeats instead of adding new row if data is same
      if (rowsData.length === 0) {
        rowsData.push(newPart);
      } else {
        const lastPacket: ImageRow = rowsData[rowsData.length - 1];
        let same: boolean = newPart.dataType === lastPacket.dataType;

        if (same && newPart.dataType === "pixels") {
          same = Utils.u8ArraysEqual(newPart.rowData!, lastPacket.rowData!);
        }

        if (same) {
          lastPacket.repeat++;
        } else {
          rowsData.push(newPart);
        }
      }
    }

    return { cols, rows, rowsData };
  }

  public static isPixelNonWhite(png: PNG, x: number, y: number, printDirection: PrintDirection = "left"): boolean {
    let idx = y * png.width + x;

    if (printDirection === "left") {
      idx = (png.height - 1 - x) * png.width + y;
    }

    idx *= 4;
    return png.data[idx] !== 255 || png.data[idx + 1] !== 255 || png.data[idx + 2] !== 255;
  }

  /**
   * @param data Pixels encoded by {@link encodeCanvas} (byte is 8 pixels)
   * @returns Array of indexes where every index stored in two bytes (big endian)
   */
  public static indexPixels(data: Uint8Array): Uint8Array {
    const result: number[] = [];

    for (let bytePos = 0; bytePos < data.byteLength; bytePos++) {
      const b: number = data[bytePos];
      for (let bitPos = 0; bitPos < 8; bitPos++) {
        // iterate from most significant bit of byte
        if (b & (1 << (7 - bitPos))) {
          result.push(...Utils.u16ToBytes(bytePos * 8 + bitPos));
        }
      }
    }

    return new Uint8Array(result);
  }
}
