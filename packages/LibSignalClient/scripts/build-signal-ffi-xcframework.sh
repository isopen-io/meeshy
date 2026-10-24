#!/bin/bash
# Construit SignalFfi.xcframework depuis une copie de libsignal au tag épinglé
# (packages/LibSignalClient/LIBSIGNAL_VERSION), avec la chaîne Rust que ce tag
# déclare (rust-toolchain), puis l'archive et imprime la somme de contrôle
# SwiftPM à reporter dans packages/LibSignalClient/Package.swift.
#
# Usage : build-signal-ffi-xcframework.sh <dossier libsignal> <dossier de sortie>
# Le dossier libsignal doit être un clone au tag exact : le script le vérifie.
set -euo pipefail

SRC=$(cd "$1" && pwd)
OUT=$(mkdir -p "$2" && cd "$2" && pwd)
HERE=$(cd "$(dirname "$0")/.." && pwd)
TAG=$(tr -d '[:space:]' < "$HERE/LIBSIGNAL_VERSION")

ACTUAL=$(git -C "$SRC" describe --tags --exact-match HEAD)
if [[ "$ACTUAL" != "$TAG" ]]; then
  echo "error: libsignal est à $ACTUAL, le tag épinglé est $TAG" >&2
  exit 1
fi

export PATH="$HOME/.cargo/bin:$PATH"
TARGETS=(aarch64-apple-ios aarch64-apple-ios-sim x86_64-apple-ios)
for target in "${TARGETS[@]}"; do
  CARGO_BUILD_TARGET="$target" "$SRC/swift/build_ffi.sh" --release
done

WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT
mkdir -p "$WORK/headers" "$WORK/simulator"
cp "$SRC/swift/Sources/SignalFfi/signal_ffi.h" "$SRC/swift/Sources/SignalFfi/signal_ffi_testing.h" "$SRC/swift/Sources/SignalFfi/module.modulemap" "$WORK/headers/"
lipo -create \
  "$SRC/target/aarch64-apple-ios-sim/release/libsignal_ffi.a" \
  "$SRC/target/x86_64-apple-ios/release/libsignal_ffi.a" \
  -output "$WORK/simulator/libsignal_ffi.a"

rm -rf "$OUT/SignalFfi.xcframework" "$OUT/SignalFfi.xcframework.zip"
xcodebuild -create-xcframework \
  -library "$SRC/target/aarch64-apple-ios/release/libsignal_ffi.a" -headers "$WORK/headers" \
  -library "$WORK/simulator/libsignal_ffi.a" -headers "$WORK/headers" \
  -output "$OUT/SignalFfi.xcframework"
(cd "$OUT" && ditto -c -k --sequesterRsrc --keepParent SignalFfi.xcframework SignalFfi.xcframework.zip)
echo "checksum: $(swift package compute-checksum "$OUT/SignalFfi.xcframework.zip")"
