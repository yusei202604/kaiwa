# Vendor Assets

This directory contains vendored third-party browser libraries used at runtime.

## Included files

- `qrcode.min.js`
  - Source: `davidshimjs/qrcodejs`
  - Upstream URL: `https://github.com/davidshimjs/qrcodejs`
  - Retrieved file: `qrcode.min.js` from the upstream repository
  - License: MIT
  - Local license file: `LICENSE-qrcodejs.txt`

- `jsQR.js`
  - Source: `jsqr` npm package `1.4.0`
  - Upstream URL: `https://github.com/cozmo/jsQR`
  - Retrieved file: `dist/jsQR.js` from the npm package tarball
  - License: Apache-2.0
  - Local license file: `LICENSE-jsQR.txt`

## Notes

- These files are committed to avoid runtime CDN dependencies.
- Update them only from the upstream project or the official npm package.
- If a vendored file is modified locally, record the reason in this file.
