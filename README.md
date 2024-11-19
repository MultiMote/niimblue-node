## NiimBlueLib-Headless [![NPM](https://img.shields.io/npm/v/@mmote/niimbluelib-headless)](https://npmjs.com/package/@mmote/niimbluelib-headless)

[niimbluelib](https://github.com/MultiMote/niimbluelib) client implementations for not-browser use.

Tested with:

* Windows 10
* Bluetooth adapter (TP-LINK UB500)
* USB serial connection
* Printers: B1, D110

Usage example:

* [src/cli.ts](src/cli.ts)

### Install

[node-gyp](https://www.npmjs.com/package/node-gyp) is required to install [bluetooth-serial-port](https://www.npmjs.com/package/bluetooth-serial-port) dependency.
It requires working compiler installed on your system.

See [node-gyp](https://github.com/nodejs/node-gyp?tab=readme-ov-file#on-unix) and [bluetooth-serial-port](https://github.com/eelcocramer/node-bluetooth-serial-port?tab=readme-ov-file#prerequisites-on-linux) installation.

### Command-line usage

While development:

```bash
yarn cli <options>
```

If installed as package globally:

```bash
niimblue-cli <options>
```

Available options:

```bash
niimblue-cli help print
niimblue-cli help info
```

#### Examples

B1 serial:

```bash
niimblue-cli print -d -t serial -a COM8 -p B1 -o top label_15x30.png
```

B1 Bluetooth:

```bash
niimblue-cli print -d -t bluetooth -a 07:27:03:17:6E:82 -p B1 -o top label_15x30.png
```

D110 Bluetooth:

```bash
niimblue-cli print -d -t bluetooth -a 03:26:03:C3:F9:11 -p D110 -o left label_15x30.png
```
