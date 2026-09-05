import {
  EncodedImage,
  PrintDirection,
  ImageEncoder as BaseEncoder,
  ImageSource,
  PageColorType,
} from "@mmote/niimbluelib";
import { Sharp } from "sharp";

export class SharpImageSource implements ImageSource {
  private constructor(
    private readonly buffer: Buffer<ArrayBufferLike>,
    public readonly width: number,
    public readonly height: number,
  ) {}

  public static async fromSharp(src: Sharp): Promise<SharpImageSource> {
    const { data, info } = await src
      .flatten({ background: "#fff" })
      .toColorspace("b-w")
      .raw()
      .toBuffer({ resolveWithObject: true });

    return new SharpImageSource(data, info.width, info.height);
  }

  public getPixelColor(
    x: number,
    y: number,
    printDirection: PrintDirection = "left",
  ): number {
    let idx = y * this.width + x;

    if (printDirection === "left") {
      idx = (this.height - 1 - x) * this.width + y;
    }

    return this.buffer.at(idx) === 0xff ? 0xffffff : 0x000000; // only black and white currently
  }
}

export class ImageEncoder {
  static async encodeImage(src: Sharp, pageColor: PageColorType, printDirection: PrintDirection = "left"): Promise<EncodedImage> {
    const imageSource = await SharpImageSource.fromSharp(src);
    return BaseEncoder.encode(imageSource, pageColor, printDirection);
  }
}
