# Orchestration des pistes de parité Android ↔ iOS

Outillage du programme décrit dans `apps/android/docs/parite-ios/README.md` (directive #11570).

- `setup_run.sh <run-dir>` : prépare un répertoire d'exécution. Il y copie les scripts, les conventions et le plan, en scindant F0 en F0a et F0b, et crée le registre `ledger.git`.
- `ready.py <piste>` : rend les lots prêts d'une piste. Un lot est prêt quand ses dépendances sont fusionnées dans `dev` (le registre est le `git log --merges` de `dev`, branche `claude/android-<clé>`), que sa branche n'est pas poussée (une branche poussée réserve son lot) et que ses fichiers sont disjoints des lots en vol.
- `lot.py <piste> <clé>` : la spécification d'un lot. `issue_body.py` et `pr_body.py` : le titre et le corps de son issue et de sa PR.
- `track-workflow.js` : le workflow Claude Code d'une piste. Il prend les lots prêts, crée l'issue (sous-issue de l'épopée), implémente sur la branche du lot en TDD, fait une revue pré-CI, ouvre la PR, surveille `android.yml`, corrige ce qui est rouge et fusionne ce qui est vert. Il s'arrête quand la piste est finie ou n'avance plus.

Reprendre une piste depuis une autre session :

```bash
apps/android/scripts/parity/setup_run.sh "$SCRATCH/run"
# puis lancer le workflow avec scriptPath = apps/android/scripts/parity/track-workflow.js
# et args = {"track":"A","epic":11591,"run":"$SCRATCH/run","lotsDir":"$SCRATCH/run/lots","batch":4}
```

Épopées : F0a et F0b → #11590, A → #11591, B → #11592, C → #11593, D → #11594, E → #11595. Un lot bloqué figure dans `<run>/blocked.txt`, et sa branche reste poussée pour qu'on puisse la reprendre.
