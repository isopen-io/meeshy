#!/usr/bin/env bash
# Construit le pont WASM de libsignal et l'écrit dans apps/web (#17114).
#
#   bash packages/libsignal-wasm/build.sh          # reconstruit et écrit
#   bash packages/libsignal-wasm/build.sh --check  # reconstruit et compare
#
# Prérequis : rustup (la chaîne de `rust-toolchain`, cible wasm32-unknown-unknown),
# protoc, et wasm-bindgen-cli à la version exacte du Cargo.lock
# (cargo install wasm-bindgen-cli --version <x> --locked).
# Les chemins de la machine sont effacés du binaire : deux constructions à la même
# chaîne rendent le même condensat, que `manifest.json` consigne.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
OUT="$REPO/apps/web/src/lib/e2ee/libsignal"
TOOLCHAIN="$(tr -d '[:space:]' < "$HERE/rust-toolchain")"
CARGO_HOME_DIR="${CARGO_HOME:-$HOME/.cargo}"
BINDGEN="$(awk '/^name = "wasm-bindgen"$/{getline; gsub(/[^0-9.]/, ""); print; exit}' "$HERE/Cargo.lock")"
LIBSIGNAL="$(awk -F'"' '/^version = /{print $2; exit}' "$HERE/Cargo.toml")"
TAG="$(sed -n 's/.*libsignal-protocol = .*tag = "v\([^"]*\)".*/\1/p' "$HERE/Cargo.toml")"

[ "$LIBSIGNAL" = "$TAG" ] || { echo "Cargo.toml : version $LIBSIGNAL ≠ tag libsignal v$TAG" >&2; exit 1; }
[ "$(wasm-bindgen --version | awk '{print $2}')" = "$BINDGEN" ] || {
  echo "wasm-bindgen-cli $BINDGEN requis (cargo install wasm-bindgen-cli --version $BINDGEN --locked)" >&2; exit 1; }

STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT

(
  cd "$HERE"
  RUSTFLAGS="--cfg getrandom_backend=\"wasm_js\" --remap-path-prefix=$CARGO_HOME_DIR=/cargo --remap-path-prefix=$HERE=/libsignal-wasm" \
    cargo "+$TOOLCHAIN" build --release --locked --target wasm32-unknown-unknown
)
wasm-bindgen --target web --out-name libsignal_wasm --out-dir "$STAGE" \
  "$HERE/target/wasm32-unknown-unknown/release/meeshy_libsignal_wasm.wasm"

SHA="$(sha256sum "$STAGE/libsignal_wasm_bg.wasm" | awk '{print $1}')"
cat > "$STAGE/manifest.json" <<JSON
{
  "_doc": "Écrit par packages/libsignal-wasm/build.sh — ne pas éditer à la main.",
  "libsignal": "$LIBSIGNAL",
  "rustToolchain": "$TOOLCHAIN",
  "wasmBindgen": "$BINDGEN",
  "wasmSha256": "$SHA"
}
JSON

FILES=(libsignal_wasm.js libsignal_wasm.d.ts libsignal_wasm_bg.wasm manifest.json)
if [ "${1:-}" = "--check" ]; then
  for file in "${FILES[@]}"; do
    cmp -s "$STAGE/$file" "$OUT/$file" || { echo "écart : $OUT/$file ne correspond pas à la construction" >&2; exit 1; }
  done
  echo "pont libsignal $LIBSIGNAL : construction identique ($SHA)"
  exit 0
fi

mkdir -p "$OUT"
for file in "${FILES[@]}"; do cp "$STAGE/$file" "$OUT/$file"; done
echo "pont libsignal $LIBSIGNAL écrit dans $OUT ($SHA)"
