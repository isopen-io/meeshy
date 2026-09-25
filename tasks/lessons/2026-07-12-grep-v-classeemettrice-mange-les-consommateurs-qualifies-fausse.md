## 2026-07-12 — `grep -v <ClasseÉmettrice>` mange les consommateurs qualifiés — fausse « brèche confirmée »

En cherchant les consommateurs de `EXTRA_CALL_ID`, le filtre `grep -v MeeshyFcmService` (censé
exclure le fichier ÉMETTEUR) a aussi exclu les lignes des CONSOMMATEURS — qui référencent la
constante par son nom qualifié `MeeshyFcmService.EXTRA_CALL_ID`. Résultat : zéro occurrence,
« trou confirmé » annoncé... alors que MainActivity → LaunchRouter → CallRoute.incoming consomme
tout proprement.

**Règles** :
- Pour exclure un FICHIER d'un grep, exclure par CHEMIN (`grep -v "/MeeshyFcmService.kt:"`) ou
  utiliser `--exclude=<fichier>` — jamais par un motif texte qui peut apparaître dans le code des
  autres fichiers (nom de classe = namespace des constantes).
- Une absence de résultat grep n'est pas une preuve d'absence : avant d'annoncer « rien ne consomme
  X », refaire la recherche sans AUCUN filtre d'exclusion.
