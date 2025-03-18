import sharp from "sharp";

const src = sharp("src.png");
const meta = await src.metadata();
console.log([meta.width, meta.height]);

await src
  .flatten({ background: "#fff" })
  .resize(240, 96, {
    kernel: sharp.kernel.nearest,
    fit: "contain",
    position: "centre",
    background: "#fff",
  })
  .threshold(128)
  .toColorspace("b-w")
  .toFile("dst.png");
//   .raw()
//   .toBuffer()
//   .then(buf => {

//   })
