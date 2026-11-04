# Reprise du chantier de parité Android ↔ iOS

Arrêté le 2026-11-04 vers 07 h 30 UTC, à la demande du porteur. Directive #11570 : `apps/android` vise l'iso de `apps/ios` + `packages/MeeshySDK`. L'état des tâches vit dans les issues et dans les épopées de piste (A #11591, B #11592, C #11593, D #11594, E #11595). Ce fichier décrit la mécanique de reprise, pas l'avancement.

## Ce que contient ce dossier

| fichier | rôle |
|---|---|
| `plan/{A..E,F0a,F0b}.json` | les lots de chaque piste : clé, dépendances, fichiers touchés, références iOS, critères, tests |
| `ready_core.py` | dit quels lots d'une piste sont prêts. Il exige trois conditions : dépendances fusionnées dans dev, branche non poussée, fichiers disjoints des lots en vol |
| `track-v2.js` | workflow d'une piste. Pour chaque lot prêt : issue, branche en TDD, relecture, puis PR vers dev |
| `merge-backlog.js` | workflow de fusion des PR de pistes. Il fusionne dev dans la branche, résout les conflits selon `CONVENTIONS.md`, puis fusionne la PR |
| `dev-green.js` | workflow de correction des tests rouges de dev, une PR par groupe |
| `setup.sh` | amorce le dossier de travail d'une session neuve |
| `cleanup.py` | libère les clones de lots inutilisés (sous 5 Go de disque libre) |
| `blocked.txt` | lots à ne pas planifier tant qu'une décision ou un bloquant n'est pas levé |
| `../android-parity-reprise.js` | workflow de reprise. Il solde le lot SQLCipher, trie les rouges de dev et classe les PR ouvertes |

## Ce qui reste à faire, par priorité

1. **Lot SQLCipher** (#15880, branche `claude/android-persist-sqlcipher-base-chiffree`, PR #15908 fermée).
   - Le premier audit était BLOQUANT. Les corrections sont poussées en tête 7b6fcdc064. Le contre-audit a été interrompu à l'arrêt, et la CI de la branche n'a pas été lue.
   - Le workflow de reprise rejoue le contre-audit. Si le verdict n'est pas bloquant et que la CI de la branche le permet, il ouvre une PR neuve et la fusionne.
2. **Rendre dev vert.** `android.yml` est rouge sur dev. Au dernier run complet (n° 3702), 32 tests échouaient dans `:feature:chat`, `:sdk-core`, `:feature:conversations` et `:feature:feed`. L'autre session du porteur en corrigeait une grande partie sous #15867. Le workflow de reprise relève ce qui reste, puis `dev-green.js` le corrige.
3. **Fusionner les PR de pistes ouvertes** avec `merge-backlog.js`. Un lot sensible (auth, crypto, migration, consentement, accès, contenu protégé) se ferme d'abord, passe à l'agent `auditeur-adversarial`, puis revient par une PR neuve.
4. **Relancer les pistes** qui ont des lots prêts, avec `track-v2.js`. Jamais deux runs de la même piste en même temps.
5. **Suivis de vue unique** déjà ouverts en issues : #15935, #15936, #15915, #15916, #15938, ainsi que #15840 (branchement de la détection de capture).
6. **Décision du porteur en attente** : #15406 (E2EE : libsignal partout, ou une seconde pile de chiffrement).
7. **À la fin**, une revue par un expert Kotlin et Android natif.

## Règles qui ont coûté cher

- Le compte du porteur fusionne par vagues **toutes** les PR ouvertes, brouillons compris. Une PR qui attend un audit se FERME.
- La CI des PR est gelée (`PR_CI_GEL`) : la preuve d'une branche vient d'un `workflow_dispatch` d'`android.yml` sur cette branche.
- Le journal d'un job se lit par `mcp__github__get_job_logs`, car le téléchargement direct du blob est refusé par le proxy.
- Les fusions en rafale annulent presque tous les runs de dev. Il faut lire le dernier run **arrivé au bout**.
- Une autre session corrige dev en direct. Lire `git log origin/dev` avant de corriger, pour ne pas doubler son travail.
- Les agents travaillent dans un clone privé, jamais dans `/home/user/meeshy`.

## Commandes de reprise

Dans la nouvelle session, avec `$RUN` = un dossier du scratchpad, par exemple `<scratchpad>/run` :

```bash
bash /home/user/meeshy/.claude/workflows/android-parity/setup.sh "$RUN" "<url de la nouvelle session>"
```

Puis lancer les workflows :

```
Workflow({ name: 'android-parity-reprise', args: { run: '$RUN' } })
Workflow({ scriptPath: '$RUN/dev-green.js', args: { run: '$RUN', runId, jobId, sha, groups } })
Workflow({ scriptPath: '$RUN/merge-backlog.js', args: { run: '$RUN', lanes } })
Workflow({ scriptPath: '$RUN/track-v2.js', args: { track: 'B', epic: 11592, run: '$RUN', lotsDir: '$RUN/lots', batch: 4, maxInflight: 8, maxIdle: 3 } })
```

Ces commandes se lancent dans cet ordre :
1. le workflow de reprise ;
2. `dev-green.js` avec les groupes qu'il rend ;
3. `merge-backlog.js` avec les files qu'il rend ;
4. une piste par lettre dont `ready_core.py T --gen 2 --max-inflight 8 --batch 4` donne des lots prêts. Les épopées sont A=11591, B=11592, C=11593, D=11594, E=11595.

Les identifiants des runs de piste en cours s'inscrivent dans `$RUN/active.txt`, un par ligne, pour `cleanup.py`.
