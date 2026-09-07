#!/usr/bin/env bash
set -euo pipefail

# Build a single-file x86_64 AppImage.  The resulting image contains:
#   * a private Chromium runtime (app mode; no system browser is opened)
#   * the bundled Node runtime and local GoT server
#   * KataGo v1.18.1 OpenCL and the b18 model
#
# Build-time inputs are deliberately explicit so the runtime itself never
# needs to access the network.

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RELEASE_DIR="$ROOT_DIR/release/release-ubuntu"
BUILD_DIR="${TMPDIR:-/tmp}/got-appimage-build"
APPDIR="$BUILD_DIR/AppDir"
OUT_DIR="$ROOT_DIR/release/packages"
OUT_FILE="$OUT_DIR/GoT-v1.0.1-ubuntu-x86_64.AppImage"
CHROME_DIR="${GOT_CHROME_DIR:-/opt/google/chrome}"
NODE_BIN="${GOT_NODE_BIN:-/home/tudou/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node}"
KATAGO_BIN="${GOT_KATAGO_BIN:-/tmp/katago-v1.18.1-opencl-linux-x64-tested}"
APPIMAGETOOL="${APPIMAGETOOL:-/tmp/got-build-tools/appimagetool-x86_64.AppImage}"
RUNTIME_FILE="${APPIMAGE_RUNTIME_FILE:-/tmp/got-build-tools/runtime-x86_64}"

die() { printf '[appimage] ERROR: %s\n' "$*" >&2; exit 1; }

[[ -d "$RELEASE_DIR" ]] || die "missing release directory: $RELEASE_DIR"
[[ -x "$CHROME_DIR/chrome" ]] || die "Chromium runtime not found: $CHROME_DIR/chrome"
[[ -x "$NODE_BIN" ]] || die "Node runtime not found: $NODE_BIN"
[[ -x "$KATAGO_BIN" ]] || die "KataGo binary not found: $KATAGO_BIN"
[[ -x "$APPIMAGETOOL" ]] || die "appimagetool not found: $APPIMAGETOOL"
[[ -r "$RUNTIME_FILE" ]] || die "AppImage runtime not found: $RUNTIME_FILE"

rm -rf "$BUILD_DIR"
mkdir -p "$APPDIR/usr/share/got" "$APPDIR/usr/lib/got/chrome" "$APPDIR/usr/bin"
cp -a "$RELEASE_DIR/." "$APPDIR/usr/share/got/"
# The folder release launcher is intentionally not shipped in the AppImage:
# it contains the optional GitHub downloader, while this image already has
# KataGo and must remain an offline-only runtime.
rm -f "$APPDIR/usr/share/got/start.sh" "$APPDIR/usr/share/got/GoT.desktop" "$APPDIR/usr/share/got/README.md"
install -m 0644 "$ROOT_DIR/tools/appimage/README.md" "$APPDIR/usr/share/got/README.md"
cp -a "$CHROME_DIR/." "$APPDIR/usr/lib/got/chrome/"
install -m 0755 "$NODE_BIN" "$APPDIR/usr/bin/node"
install -m 0755 "$KATAGO_BIN" "$APPDIR/usr/share/got/engines/katago/katago"

install -m 0755 "$ROOT_DIR/tools/appimage/AppRun" "$APPDIR/AppRun"
install -m 0644 "$ROOT_DIR/tools/appimage/GoT.desktop" "$APPDIR/GoT.desktop"
install -m 0644 "$RELEASE_DIR/favicon.svg" "$APPDIR/got.svg"

mkdir -p "$OUT_DIR"
rm -f "$OUT_FILE"
ARCH=x86_64 APPIMAGETOOL_APP_NAME=GoT "$APPIMAGETOOL" --appimage-extract-and-run --runtime-file "$RUNTIME_FILE" "$APPDIR" "$OUT_FILE"
chmod 0755 "$OUT_FILE"
printf '[appimage] created %s\n' "$OUT_FILE"
sha256sum "$OUT_FILE"
du -h "$OUT_FILE"
