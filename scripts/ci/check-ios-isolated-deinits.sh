#!/usr/bin/env bash
# Garde BINAIRE de #9694 : aucune deinit ISOLÉE dans l'app ni dans MeeshyTests.
#
# Sous SWIFT_DEFAULT_ACTOR_ISOLATION = MainActor (apps/ios/project.yml), une
# classe non `nonisolated` reçoit une deinit isolée au MainActor (SE-0371),
# appelée par `swift_task_deinitOnExecutor…`. Exécutée sans tâche courante
# (test XCTest synchrone, démontage de xctest), elle double-libère le scope
# task-local sur les runtimes iOS 18.4+ et 26.x (Swift #85663) et tue le
# processus de test. Les gardes de SOURCE (MainActorDeinitSourceGuardTests,
# MeeshyUIDeinitSourceGuardTests) lisent des déclarations ; celle-ci lit ce que
# le compilateur a PRODUIT : chaque deinit isolée laisse un symbole
# `…__isolated_deallocating_deinit` (mangling `fZ`). Aucune forme implicite ne
# lui échappe — classe imbriquée, fichier généré, cible de tests.
#
# Usage : check-ios-isolated-deinits.sh <dossier Products/Debug-iphonesimulator>
#         check-ios-isolated-deinits.sh --binary <mach-o> [...]
#         check-ios-isolated-deinits.sh --self-test
set -euo pipefail

# Accesseurs de ressources GÉNÉRÉS (SwiftPM `BundleFinder`, XcodeGen
# `ResourceBundleClass`) : ils ne servent qu'à `Bundle(for: X.self)`, ne sont
# jamais instanciés, donc leur deinit ne s'exécute jamais.
ALLOWED='\((BundleFinder|ResourceBundleClass) in _[0-9A-F]+\)\.__isolated_deallocating_deinit$'

# --self-test : la garde se garde elle-même. Un échantillon compilé sous la
# MÊME isolation par défaut que l'app doit montrer deux deinit isolées
# (classe implicite, classe @MainActor écrite) et aucune pour les deux formes
# corrigées — sinon le mangling ou l'inférence ont changé, et la garde
# passerait au vert par omission.
if [ "${1:-}" = "--self-test" ]; then
  work=$(mktemp -d)
  trap 'rm -rf "$work"' EXIT
  cat > "$work/sample.swift" <<'SWIFT'
final class ImplicitlyIsolated { var x = 0 }
@MainActor final class ExplicitlyIsolated { var x = 0 }
final class NonisolatedDeinit { var x = 0; nonisolated deinit {} }
nonisolated final class NonisolatedType { var x = 0 }
SWIFT
  xcrun --sdk iphonesimulator swiftc -swift-version 6 -default-isolation MainActor \
    -target arm64-apple-ios16.0-simulator -parse-as-library -emit-library \
    -o "$work/libsample.dylib" "$work/sample.swift"
  if out=$("$0" --binary "$work/libsample.dylib"); then
    echo "::error::self-test : la garde n'a rien vu dans un binaire qui porte deux deinit isolées"; exit 1
  fi
  for want in ImplicitlyIsolated ExplicitlyIsolated; do
    grep -q "sample\.${want}\.__isolated_deallocating_deinit" <<<"$out" \
      || { echo "::error::self-test : ${want} non signalée"; printf '%s\n' "$out"; exit 1; }
  done
  for clean in NonisolatedDeinit NonisolatedType; do
    ! grep -q "$clean" <<<"$out" \
      || { echo "::error::self-test : ${clean} signalée à tort"; printf '%s\n' "$out"; exit 1; }
  done
  echo "self-test : 2 deinit isolées signalées, 2 formes corrigées ignorées"
  exit 0
fi

binaries=()
if [ "${1:-}" = "--binary" ]; then
  shift
  binaries=("$@")
else
  PRODUCTS=${1:?usage: $0 <Products/Debug-iphonesimulator>}
  APP="$PRODUCTS/Meeshy.app"
  if [ -f "$APP/Meeshy.debug.dylib" ]; then binaries+=("$APP/Meeshy.debug.dylib"); else binaries+=("$APP/Meeshy"); fi
  TESTS=$(find "$PRODUCTS" -path '*MeeshyTests.xctest/MeeshyTests' -type f | head -n 1)
  [ -n "$TESTS" ] || { echo "::error::MeeshyTests.xctest introuvable sous $PRODUCTS"; exit 1; }
  binaries+=("$TESTS")
fi

total=0
offenders=""
for bin in "${binaries[@]}"; do
  [ -f "$bin" ] || { echo "::error::binaire absent : $bin"; exit 1; }
  syms=$(nm -U "$bin" | awk '{print $3}' | grep -E 'fZ$' | xcrun swift-demangle || true)
  count=$(printf '%s' "$syms" | grep -c . || true)
  bad=$(printf '%s\n' "$syms" | grep . | grep -vE "$ALLOWED" || true)
  echo "$(basename "$bin") : ${count} deinit isolée(s), $(printf '%s' "$bad" | grep -c . || true) hors liste blanche"
  total=$((total + count))
  [ -z "$bad" ] || offenders+="$(printf '%s\n' "$bad" | sed "s|^|$(basename "$bin"): |")"$'\n'
done

if [ -n "$offenders" ]; then
  echo "::error title=Deinit isolée (#9694)::$(printf '%s' "$offenders" | grep -c .) classe(s) portent une deinit isolée au MainActor — elles tuent xctest au démontage sur iOS 18.4+/26 (Swift #85663). Ajouter \`nonisolated deinit {}\` (ou \`nonisolated\` sur le type)."
  printf '%s' "$offenders"
  exit 1
fi
echo "aucune deinit isolée hors liste blanche (${total} au total)"
