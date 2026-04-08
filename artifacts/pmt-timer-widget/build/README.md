# Build Assets

This directory contains build resources for Electron packaging.

## Required Icon Files

To package the app, you need to add the following icon files:

- `icon.ico` — Windows icon (256×256, ICO format)
- `icon.icns` — macOS icon (ICNS format, contains multiple sizes)
- `icon.png` — Linux icon (512×512 PNG)

A reference SVG (`icon.svg`) is included. Convert it to the required formats using:
- [CloudConvert](https://cloudconvert.com) or
- `npm install -g electron-icon-builder && electron-icon-builder --input=icon.svg --output=./`

## Packaging

From the `artifacts/pmt-timer-widget` directory:

```bash
# Install packaging tools (first time only, on local machine)
npm install -g electron electron-builder concurrently wait-on

# Development preview (browser, no Electron needed)
pnpm dev

# Development with Electron (requires Electron installed)
pnpm dev:electron

# Package for Windows (.exe installer)
pnpm package:win

# Package for macOS (.dmg)
pnpm package:mac
```

Output will be in `dist-electron/`.
