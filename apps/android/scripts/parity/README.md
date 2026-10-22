# Orchestration des pistes de parité Android ↔ iOS

Outillage du programme décrit dans `apps/android/docs/parite-ios/README.md` (directive #11570).

- `setup_run.sh <run-dir>` : prépare un répertoire d'exécution. Il y copie les scripts, les conventions et le plan, en scindant F0 en F0a et F0b, et crée le registre `ledger.git`.
- `ready.py <piste>` : rend les lots prêts d'une piste. Un lot est prêt quand ses dépendances sont fusionnées dans `dev` (le registre est le `git log --merges` de `dev`, branche `claude/android-<clé>`), que sa branche n'est pas poussée (une branche poussée réserve son lot) et que ses fichiers sont disjoints des lots en vol.
- `lot.py <piste> <clé>` : la spécification d'un lot. `issue_body.py` et `pr_body.py` : le titre et le corps de son issue et de sa PR.
- `track-workflow.js` : le workflow Claude Code d'une piste. Il prend les lots prêts (`ready.py --gen 2`, au plus 8 lots en vol par piste), crée l'issue (sous-issue de l'épopée), implémente en TDD sur la branche du lot (ou REPREND une branche poussée sans PR, laissée par un run interrompu), fait une revue pré-CI, ouvre la PR, puis passe au lot suivant sans attendre la CI.
- `merger-workflow.js` : le fusionneur, UN seul pour toutes les pistes. Il surveille les PR `claude/android-*` ouvertes, fusionne les vertes (merge commit au titre par défaut, ce qui alimente le registre), et corrige les rouges et les conflits (quatre essais par PR, puis il abandonne avec un commentaire sur la PR et le lot passe dans `blocked.txt`). Découpler la CI de l'implémentation est nécessaire : `ci.yml` lance toutes ses suites sur chaque PR, et la file des runners impose des heures d'attente.

Reprendre une piste depuis une autre session :

```bash
apps/android/scripts/parity/setup_run.sh "$SCRATCH/run"
touch "$SCRATCH/run/rescue-enabled"   # autorise la reprise des branches sans PR
# lancer UN fusionneur : scriptPath = apps/android/scripts/parity/merger-workflow.js, args = {"run":"$SCRATCH/run","lotsDir":"$SCRATCH/run/lots"}
# puis une piste : scriptPath = apps/android/scripts/parity/track-workflow.js
# et args = {"track":"A","epic":11591,"run":"$SCRATCH/run","lotsDir":"$SCRATCH/run/lots","batch":4,"maxInflight":8}
```

Épopées : F0a et F0b → #11590, A → #11591, B → #11592, C → #11593, D → #11594, E → #11595. Un lot bloqué figure dans `<run>/blocked.txt`, et sa branche reste poussée pour qu'on puisse la reprendre.
