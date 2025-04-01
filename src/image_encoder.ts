import { EncodedImage, ImageRow, PrintDirection, Utils } from "@mmote/niimbluelib";
import sharp from "sharp";

export class ImageEncoder {
  static async encodeImage(src: sharp.Sharp, printDirection: PrintDirection = "left"): Promise<EncodedImage> {
    const rowsData: ImageRow[] = [];

    const { data, info } = await src
      .flatten({ background: "#fff" })
      .toColorspace("b-w")
      .raw()
      .toBuffer({ resolveWithObject: true });


    let cols: number = info.width;
    let rows: number = info.height;

    if (printDirection === "left") {
      cols = info.height;
      rows = info.width;
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
          if (ImageEncoder.isPixelNonWhite(data, info.width, info.height, colOct * 8 + colBit, row, printDirection)) {
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

  public static isPixelNonWhite(
    buf: Buffer<ArrayBufferLike>,
    imgWidth: number,
    imgHeight: number,
    x: number,
    y: number,
    printDirection: PrintDirection = "left"
  ): boolean {
    let idx = y * imgWidth + x;

    if (printDirection === "left") {
      idx = (imgHeight - 1 - x) * imgWidth + y;
    }

    return buf.at(idx) !== 0xff;
  }
}
