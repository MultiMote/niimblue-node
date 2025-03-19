// import sharp from "sharp";
import { ImageEncoder, loadImageFromUrl, loadImageFromFile } from './dist/index.js';



// const img = await loadImageFromUrl("https://github.com/MultiMote/niimbluelib-headless");
// const img = await loadImageFromUrl("https://i.imgur.com/iXGg9LI.png");
// const img = await loadImageFromUrl("https://github.com/MultiMote/niimbluelib-headless/blob/218bbdfd0941d6cf5ee4d8a3d98463cde37bad70/label_15x310.png?raw=true");
const img = await loadImageFromFile("D:\\projects\\js\\niimbluelib-headless\\label_15x30.png");

const result = await ImageEncoder.encodeImage(img, "top");

console.log(result);


// const src = sharp("src.png");
// const meta = await src.metadata();
// console.log([meta.width, meta.height]);

// await src
//   .flatten({ background: "#fff" })
//   .resize(240, 96, {
//     kernel: sharp.kernel.nearest,
//     fit: "contain",
//     position: "centre",
//     background: "#fff",
//   })
//   .threshold(128)
//   .toColorspace("b-w")
//   .toFile("dst.png");
//   .raw()
//   .toBuffer()
//   .then(buf => {

//   })
