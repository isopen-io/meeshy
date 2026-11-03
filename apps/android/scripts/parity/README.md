# Orchestration des pistes de parité Android ↔ iOS

Outillage du programme décrit dans `apps/android/docs/parite-ios/README.md` (directive #11570).

- `setup_run.sh <run-dir>` : prépare un répertoire d'exécution. Il y copie les scripts, les conventions et le plan, en scindant F0 en F0a et F0b, et crée le registre `ledger.git`.
- `ready.py <piste>` : rend les lots prêts d'une piste. Options (#15463) :
  - `--scope k1,k2` vise ces lots et la fermeture de leurs dépendances non fusionnées, toutes pistes confondues, au lieu d'une piste ;
  - `--rescue k1,k2` reprend ces branches poussées sans PR, sans `rescue-enabled`, qui les reprendrait toutes, y compris celle qu'une autre session vient de pousser ;
  - `--inflight k1,k2` tient ces lots pour en vol avant même que leur branche soit poussée, ce qui réserve leurs fichiers.

  `satisfied.txt` liste les lots tenus sans fusion de leur branche, preuve dans leur issue. Le registre est récupéré sans arbres. Un lot est prêt quand ses dépendances sont fusionnées dans `dev` (le registre est le `git log --merges` de `dev`, branche `claude/android-<clé>`), que sa branche n'est pas poussée (une branche poussée réserve son lot) et que ses fichiers sont disjoints des lots en vol.
- `lot.py <piste> <clé>` : la spécification d'un lot. `issue_body.py` et `pr_body.py` : le titre et le corps de son issue et de sa PR.
- `track-workflow.js` : le workflow Claude Code d'une piste. Il prend les lots prêts (`ready.py --gen 2`, au plus 8 lots en vol par piste), crée l'issue (sous-issue de l'épopée), implémente en TDD sur la branche du lot (ou REPREND une branche poussée sans PR, laissée par un run interrompu), fait une revue pré-CI, ouvre la PR, puis passe au lot suivant sans attendre la CI.
- `merger-workflow.js` : le fusionneur, UN seul pour toutes les pistes. Il surveille les PR `claude/android-*` ouvertes, fusionne les vertes (merge commit au titre par défaut, ce qui alimente le registre), et corrige les rouges et les conflits (quatre essais par PR, puis il abandonne avec un commentaire sur la PR et le lot passe dans `blocked.txt`). Découpler la CI de l'implémentation est nécessaire : `ci.yml` lance toutes ses suites sur chaque PR, et la file des runners impose des heures d'attente.

Verdict d'une PR depuis une session distante, où GraphQL est refusé : lire la PR par MCP (`pull_request_read` get, get_check_runs, get_status), écrire la charge `{ state, head_sha, total_count, check_runs, statuses }`, puis `node scripts/ci/pr-verte.mjs --rest <charge.json>`. Pendant le gel de la CI des PR (`PR_CI_GEL`), les jobs d'`android.yml` d'une PR sont sautés : la preuve d'un lot est un `workflow_dispatch` d'`android.yml` sur sa branche.

Les lois de `:core:model` se prouvent en local sans crypto ni e2ee, car `libsignal` est refusé par le proxy des conteneurs : `./apps/android/meeshy.sh jvm-check -PjvmCheckModelOnly --no-daemon -q -Dorg.gradle.jvmargs=-Xmx6g -Pkotlin.compiler.execution.strategy=in-process`.

Le chantier audio (#15462) a son propre workflow, qui ordonnance par `--scope` : `.claude/workflows/meeshy-android-audio-iso-ios.js`.

Reprendre une piste depuis une autre session :

```bash
apps/android/scripts/parity/setup_run.sh "$SCRATCH/run"
touch "$SCRATCH/run/rescue-enabled"   # autorise la reprise des branches sans PR
# lancer UN fusionneur : scriptPath = apps/android/scripts/parity/merger-workflow.js, args = {"run":"$SCRATCH/run","lotsDir":"$SCRATCH/run/lots"}
# puis une piste : scriptPath = apps/android/scripts/parity/track-workflow.js
# et args = {"track":"A","epic":11591,"run":"$SCRATCH/run","lotsDir":"$SCRATCH/run/lots","batch":4,"maxInflight":8}
```

Épopées : F0a et F0b → #11590, A → #11591, B → #11592, C → #11593, D → #11594, E → #11595. Un lot bloqué figure dans `<run>/blocked.txt`, et sa branche reste poussée pour qu'on puisse la reprendre.
