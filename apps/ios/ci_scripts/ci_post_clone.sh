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
exit 0
