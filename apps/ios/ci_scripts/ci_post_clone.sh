#!/bin/sh
# Xcode Cloud — runs after the repository is cloned, before xcodebuild.
# Apple invokes this with PWD = $CI_PRIMARY_REPOSITORY_PATH/apps/ios/ci_scripts.
#
# ─── PLUS AUCUN PATCH DE SIGNATURE ICI (incident builds 1744-1750) ───────────
#
# De mai à août 2026 ce hook injectait CODE_SIGNING_ALLOWED=NO dans les configs
# Release pour contourner un échec d'archive Xcode Cloud (« entitlements that
# require signing with a development certificate » — à l'époque, les App IDs
# n'avaient pas toutes leurs capabilities au portail). Conséquence découverte
# le 2026-08-11 en autopsiant le crash-loop macOS du build 1750 :
#
#   archive NON SIGNÉE
#     → le pipeline de distribution dérive les entitlements de la signature
#       EXISTANTE de l'app archivée (IDEDistributionPipeline.log :
#       entitlements='(null)')
#     → l'export signe l'app et ses extensions avec SEULEMENT les 4
#       entitlements par défaut (application-identifier, beta-reports-active,
#       team-identifier, get-task-allow)
#     → builds TestFlight sans aps-environment (push mort), sans
#       application-groups (stores App Group inaccessibles — crash-loop au
#       boot sur iOS-on-Mac), sans keychain-access-groups.
#
# Le profil de provisioning embarqué autorisait tout : il n'est PAS la source
# des entitlements signés — la signature de l'archive l'est.
#
# Xcode Cloud passe AD_HOC_CODE_SIGNING_ALLOWED=YES à l'action archive : la
# signature ad hoc PORTE les entitlements, et l'échec de mai ne se reproduit
# plus (App IDs complets au portail depuis 2026-07-28). Verrous
# anti-régression : ArchiveSignatureStripGuardTests (interdit le retour du
# patch) + le gate d'entitlements de ci_post_xcodebuild.sh (run rouge si
# l'app archivée perd ses entitlements produit).

set -eu

echo "[ci_post_clone] No signing patch — the Xcode Cloud archive signs ad hoc WITH entitlements (see header)."

# ─── XcodeGen regeneration (incident: "Cannot find type X in scope" on Xcode
# Cloud, 2026-08-13) ───────────────────────────────────────────────────────
#
# apps/ios/project.yml is the source of truth (XcodeGen); the committed
# Meeshy.xcodeproj/project.pbxproj is a generated artifact that lags behind
# it — new files under Meeshy/ are auto-globbed by `xcodegen generate` but
# are NOT retroactively added to the committed pbxproj by hand (CLAUDE.md:
# "jamais d'édition manuelle du pbxproj"). Every other CI path already
# regenerates before building (see .github/workflows/ios-tests.yml,
# ios-release.yml, ios-fastlane-release.yml: `brew install xcodegen &&
# xcodegen generate`) — this hook was the one path that built straight off
# the possibly-stale committed pbxproj, since Xcode Cloud does not run
# meeshy.sh (which also skips xcodegen on purpose, for local dev speed).
# Symptom: newly added sources (e.g. MediaSaveBranding.swift) compile fine
# locally and in GitHub Actions, but Xcode Cloud fails with "Cannot find
# type 'MediaSaveBranding' in scope" because the file was never a member of
# any PBXSourcesBuildPhase in the committed project.
cd "$CI_PRIMARY_REPOSITORY_PATH/apps/ios"

# ─── Le numéro de build VIENT d'Xcode Cloud (directive porteur 2026-09-09) ───
#
# Xcode Cloud EXPOSE `CI_BUILD_NUMBER` à ses scripts ; il ne l'injecte dans
# AUCUN réglage de build. Sans ces lignes, l'archive porte le
# `CURRENT_PROJECT_VERSION` committé — la MÊME valeur pour tous les runs, quel
# que soit leur numéro. Deux binaires différents sortaient donc avec le même
# numéro de build, et App Store Connect refusait le second (« The bundle
# version must be higher ») sans que rien dans le dépôt n'explique pourquoi :
# `project.yml` jurait au contraire que le compteur venait d'ici.
#
# Écrit AVANT `xcodegen generate` : c'est lui qui rend le pbxproj depuis
# `project.yml`. Après, le numéro atterrirait dans un fichier que plus personne
# ne lit.
if [ -n "${CI_BUILD_NUMBER:-}" ]; then
    sed -i '' "s/^  CURRENT_PROJECT_VERSION: .*/  CURRENT_PROJECT_VERSION: \"$CI_BUILD_NUMBER\"/" project.yml

    # RELIRE ce qu'on vient d'écrire. `sed` qui ne trouve pas sa ligne REND 0 :
    # il ne modifie rien, le build sort avec l'ancien numéro, et le défaut est
    # revenu sans que rien ne rougisse. Une injection qui ne peut pas échouer
    # n'est pas une injection, c'est un espoir.
    if ! grep -q "^  CURRENT_PROJECT_VERSION: \"$CI_BUILD_NUMBER\"$" project.yml; then
        echo "[ci_post_clone] FATAL: CI_BUILD_NUMBER=$CI_BUILD_NUMBER non écrit dans project.yml." >&2
        grep -n "CURRENT_PROJECT_VERSION" project.yml >&2 || true
        exit 1
    fi
    echo "[ci_post_clone] Build number = $CI_BUILD_NUMBER (Xcode Cloud)."
else
    # Hors Xcode Cloud (exécution manuelle du hook, test local) : on ne touche
    # à rien plutôt que d'écrire un numéro faux.
    echo "[ci_post_clone] CI_BUILD_NUMBER absent — le numéro committé est conservé."
fi

command -v xcodegen >/dev/null 2>&1 || brew install xcodegen
xcodegen generate
echo "[ci_post_clone] XcodeGen regenerated project.pbxproj from project.yml."

exit 0
