## 2026-07-11 — zsh n'expanse pas `$VAR` en plusieurs arguments : xcodebuild « TEST SUCCEEDED » avec 0 test

Un run `xcodebuild test` avec les filtres dans une variable (`TESTS='-only-testing:A -only-testing:B'`
puis `xcodebuild ... $TESTS`) a « réussi » en exécutant ZÉRO test : sous zsh, `$TESTS` non quoté reste
UN SEUL argument (pas de word-splitting par défaut, contrairement à bash) → filtre invalide → aucun
test ne matche → exit 0. Les baselines snapshot supprimées n'avaient PAS été ré-enregistrées.

**Règles** :
- Jamais de liste d'arguments dans une variable scalaire sous zsh — flags inline, tableau zsh
  (`tests=(-only-testing:A ...)` puis `"${tests[@]}"`), ou script bash explicite.
- Un résultat de tests se valide sur « Executed N tests » avec N ATTENDU, jamais sur l'exit code ni
  sur « TEST SUCCEEDED » seul (même famille que meeshy.sh exit 0 malgré FAILED, et que le script
  record-snapshot qui listait des PNG périmés).
- Après un record de baselines : compter les PNG frais (`-newermt`), pas les messages du log.
