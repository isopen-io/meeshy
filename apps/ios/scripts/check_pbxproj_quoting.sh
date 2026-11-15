#!/usr/bin/env bash
# Garde de LISIBILITÉ du `project.pbxproj` COMMITTÉ — une valeur non quotée qui
# porte un caractère hors de l'alphabet nu d'OpenStep (`+`, espace, `@`, `(`…)
# rend TOUT le projet illisible pour Xcode : « The project ‘Meeshy’ is damaged
# and cannot be opened due to a parse error ».
#
# La CI ne le voit pas : `ios-tests` RÉGÉNÈRE le pbxproj avec XcodeGen avant de
# compiler, et XcodeGen, lui, quote. Seul le fichier committé — celui que lisent
# `meeshy.sh build|run|device` et Xcode — est cassé. Mesuré le 2026-09-29 :
# `path = P2PWebRTCClient+DataProfile.swift;`, ajouté à la main par a9357ea6bf,
# a fait échouer `./apps/ios/meeshy.sh device` sur tous les postes.
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."
PBXPROJ="Meeshy.xcodeproj/project.pbxproj"

# `name = X;` / `path = X;` non quotés : X doit rester dans l'alphabet nu.
unquoted_unsafe() {
    grep -nE '(^|[[:space:];{])(name|path) = [^";]*[^A-Za-z0-9_./$;-][^";]*;' "$1" || true
}

fixture=$(mktemp)
committed=$(mktemp)
trap 'rm -f "$fixture" "$committed"' EXIT
printf '%s\n' \
    '		A /* a.swift */ = {isa = PBXFileReference; path = Foo+Bar.swift; sourceTree = "<group>"; };' \
    '		B /* b.swift */ = {isa = PBXFileReference; path = "Foo+Bar.swift"; sourceTree = "<group>"; };' \
    '		C /* c.swift */ = {isa = PBXFileReference; path = Plain_File-1.swift; sourceTree = "<group>"; };' > "$fixture"
if [ "$(unquoted_unsafe "$fixture" | wc -l | tr -d ' ')" != "1" ]; then
    echo "check_pbxproj_quoting: le scanner ne reconnaît plus la forme qu'il interdit" >&2
    exit 1
fi

if ! git show "HEAD:apps/ios/$PBXPROJ" > "$committed" 2>/dev/null; then
    echo "check_pbxproj_quoting: $PBXPROJ introuvable dans HEAD — garde sautée" >&2
    exit 0
fi

offenders=$(unquoted_unsafe "$committed")
if [ -n "$offenders" ]; then
    echo "::error::$PBXPROJ committé porte une valeur non quotée qu'Xcode ne sait pas lire — la quoter (\"…\") :" >&2
    echo "$offenders" >&2
    exit 1
fi
echo "check_pbxproj_quoting: aucune valeur non quotée hors de l'alphabet nu"
