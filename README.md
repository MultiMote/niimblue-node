## NiimBlueLib-Headless [![NPM](https://img.shields.io/npm/v/@mmote/niimbluelib-headless)](https://npmjs.com/package/@mmote/niimbluelib-headless)

[niimbluelib](https://github.com/MultiMote/niimbluelib) client implementations for not-browser use.

Command line interface, simple REST server are also included.

Tested with:

* Windows 10
* Bluetooth adapter (TP-LINK UB500)
* USB serial connection
* Printers: B1, D110

Usage example:

* [src/service.ts](src/service.ts)

### Install

Global (for cli usage):

```bash
npm i -g @mmote/niimbluelib-headless
```

[node-gyp](https://www.npmjs.com/package/node-gyp) is required to install [noble](https://www.npmjs.com/package/@abandonware/noble) dependency.
It requires working compiler installed on your system.

Windows requirements:

* [MS Build tools 2019+](https://visualstudio.microsoft.com/downloads/?q=build+tools)
  - C++ build tools with `Windows SDK >=22000` must be installed
* Python 3

See [node-gyp](https://github.com/nodejs/node-gyp) and [noble](https://github.com/abandonware/noble) installation.

### Command-line usage

While development:

```bash
npm run cli --- <options>
```

If installed as package globally:

```bash
niimblue-cli <options>
```

Available options:

```bash
niimblue-cli help print
niimblue-cli help info
niimblue-cli help scan
niimblue-cli help server
niimblue-cli help flash
```

#### Examples

B1 BLE:

```bash
niimblue-cli print -d -t ble -a 27:03:07:17:6E:82 -p B1 -o top label_15x30.png
```

D110 BLE:

```bash
niimblue-cli print -d -t ble -a 26:03:03:c3:f9:11 -p D110 -o left label_15x30.png
```

B1 serial, long parameter names (will resize image to fit 50x30 label keeping aspect ration):

```bash
niimblue-cli print --debug --transport serial --address COM8 --print-task B1 --print-direction top --label-width 384 --label-height 240 label_15x30.png
```

B1 firmware upgrade via serial:

```bash
niimblue-cli flash -t serial -a COM8 -n 5.14 -f path/to/B1_5.14.bin
```

### Server mode

You can start a simple server with:

```bash
niimblue-cli server
```

Enable debug logging, set host and port, enable CORS:

```bash
niimblue-cli server -d -h 0.0.0.0 -p 5000 --cors
```

See request examples in [server-test.http](docs/server-test.http).
