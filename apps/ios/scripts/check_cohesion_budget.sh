#!/usr/bin/env bash
# Cliquet de COHÉSION — la longueur d'un fichier ne mesure rien (#10988).
#
# Pourquoi : le budget de 1 000 lignes par fichier se satisfait en coupant un
# fichier en `Type+X.swift` ; le type reste un seul, la fonction de 400 lignes
# reste une seule. Ce cliquet mesure ce qui compte : (a) chaque fonction tient
# sur un écran (<= 80 lignes) ; (b) un type se mesure en UNITÉ, déclaration +
# toutes ses extensions du module (<= 1 500 lignes). Les contrevenants ACTUELS
# sont figés dans `cohesion-budget.json` : un nouveau contrevenant, ou un
# contrevenant qui grossit, fait échouer ; un qui baisse se verrouille avec
# `bash apps/ios/scripts/check_cohesion_budget.sh --write-baseline`.
#
# Options : --report (10 pires de chaque mesure), --self-test, --write-baseline.
# Aucun compilateur Swift requis : le script lit du texte, il tourne sous Linux.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec python3 -I "$here/cohesion_budget.py" "$@"
