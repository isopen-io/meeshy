#!/usr/bin/env bash
# Reconstruit le pont navigateur de libsignal depuis les SOURCES (#14592) :
# aucun binaire téléchargé. Prérequis : rustup (le toolchain du tag libsignal,
# cible wasm32-unknown-unknown) et wasm-bindgen-cli à la version épinglée.
#   rustup toolchain install 1.98.1 --profile minimal --target wasm32-unknown-unknown
#   cargo install wasm-bindgen-cli --version 0.2.126 --locked
# protoc est remplacé par un shim construit depuis protox (crates.io), pour que
# prost-build de libsignal compile ses .proto sans binaire externe.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
out="$here/../../apps/web/src/lib/e2ee/libsignal"
target="${CARGO_TARGET_DIR:-$here/target}"
toolchain="1.98.1"
cargo +"$toolchain" build --locked --release --manifest-path "$here/tools/protoc-shim/Cargo.toml" --target-dir "$target/protoc-shim"
PROTOC="$target/protoc-shim/release/protoc" \
RUSTFLAGS='--cfg getrandom_backend="wasm_js" --remap-path-prefix='"$HOME"'=~' \
  cargo +"$toolchain" build --locked --release --target wasm32-unknown-unknown --manifest-path "$here/Cargo.toml" --target-dir "$target"
wasm-bindgen --target web --out-dir "$out" --out-name libsignal "$target/wasm32-unknown-unknown/release/meeshy_libsignal_wasm.wasm"
rm -f "$out/libsignal_bg.wasm.d.ts"
( cd "$out" && sha256sum libsignal_bg.wasm > libsignal_bg.wasm.sha256 )
echo "pont écrit dans $out"
