# Rapport de réconciliation — branches `claude/*` et `worktree-agent*`

Date : 2026-08-12
Session : claude/worktrees-branches-cleanup-ddo2ll
Point de restauration global : branche locale `main-backup-f38581848` (+ un backup `backup/<branche>-before-merge` par branche touchée — 49 refs, à NE PAS supprimer avant revue finale).

## Résumé exécutif

916 branches distantes correspondaient aux motifs `origin/claude/*` (903) et `origin/worktree-agent*` (13). Le triage exhaustif (ancêtre git → patch-id → sujets de commit avec suffixe squash `(#NNNN)` retiré → delta réel hors docs via `git merge-tree`) donne :

| Classe | Nb | Signification | Action |
|---|---|---|---|
| ANCESTOR_MERGED | 157 | Ancêtre direct de main (dont les 13 `worktree-agent*`) | Rien à récupérer — candidates à purge |
| CONTENT_MERGED_PATCHID | 404 | Tous les patchs déjà dans main (squash/rebase) | Rien à récupérer — candidates à purge |
| SUBJECT_LANDED_SQUASH | 80 | Commits substantiels atterris via PR squash re-titrée | Rien à récupérer — candidates à purge |
| LANDED_DOCS_ONLY | 6 | Delta restant = journaux `tasks/*.md` uniquement | Faible valeur — purge après relecture |
| CLEAN_REAL_DELTA | 6 | Travail réel, merge propre avec main | **Réconciliées + poussées** (2 avec tests verts, 4 via lot) |
| CONFLICT_DOCS_ONLY | 36 | Travail réel, conflits uniquement dans les docs | **Réconciliées + poussées par lot** (union anti-perte) |
| CONFLICT_CODE | 227 | Travail réel, vrais conflits de code avec main | Backlog qualifié (voir fichier) + branches d'août traitées une à une |

Fichiers de données : `tasks/worktree-triage-2026-08-12.tsv` (classification des 916) et `tasks/worktree-backlog-code-conflicts-2026-08-12.tsv` (backlog détaillé : date, avance, nb fichiers en conflit, zones).

Leçon centrale du triage : la plupart des branches « en avance » sur main étaient en réalité **déjà atterries** via des PRs squash-mergées au titre réécrit — le patch-id et le sujet de commit ne suffisent pas, il faut croiser avec l'état des PRs (`head:` sur l'API GitHub) et le contenu effectif (`git merge-tree` + diff d'arbre hors docs).

## Branches actives réconciliées individuellement (août 2026)

Politique appliquée partout : backup avant merge, audit `:2/:3` de chaque conflit, jamais d'« ours/theirs » aveugle, préservation des deux comportements (ou preuve ligne à ligne que main couvre déjà la branche), tests ciblés bun avant push, jamais de `--force`.

| Branche | Verdict | Merge poussé | Tests |
|---|---|---|---|
| `claude/admin-users-avatar-error-dulhn4` | Travail unique (fix avatar CORP + crash `_count.anonymousParticipants`) — **PR #2888 ouverte**, mise à jour par notre push | `f3ef08bbb` | 3 suites gateway + 1 web : 432 tests verts |
| `claude/keen-hamilton-wqdzsm` | Travail unique — **PR #2889 ouverte** (débloque la CI gateway de main figée par une branche de tests de juin) | `e4c0048bf` | 8 suites gateway vertes (dont PostService 58/58 après régénération Prisma) ; CI PR relancée |
| `claude/upbeat-dirac-h5nrb8` | Déjà atterrie (PR #2859 mergée 11/08, titre squash re-libellé) ; conflit test iOS résolu sur mesure réelle (fenêtre 500→700) | `8a7fc6afc` | 12 suites gateway, 639 tests verts |
| `claude/upbeat-dirac-3kjztn` | Déjà atterrie (PR #2815) — arbre mergé identique à main | `11a497e92` | 50 suites web, 473 tests verts |
| `claude/upbeat-dirac-9xg0k7` | Doublon : son fix a atterri via PR #2706, sa PR #2701 fermée en renvoi | `8e3c313f6` | 34 suites web, 364 tests verts |
| `claude/modest-cori-hsuvvd` | Supplantée : main porte le même fix en plus complet (« CALL-RESILIENCE Vague 44 », + force-cleanup + garde stillHasSockets) — 4/4 conflits tranchés côté main avec preuve | `35e67be56` | 7 suites gateway, 705 tests verts |
| `claude/keen-hamilton-7w76mw` | Atterrie via PR #2873 ; seul résidu = commentaire d'analyse dans `ios-tests.yml`, supplanté par main qui implémente sa recommandation (gate compile-only) | `743673af5` | Delta code vs main = vide (aucun test requis) |
| `claude/modest-ritchie-f02amu` | Doc d'audit uniquement | `803b25e87` | n/a |
| `claude/keen-hamilton-5rkm85` | **Supplantée, non fusionnée volontairement** : main a la version aboutie du même chantier (`lastMessagePreviewPrism`, scoping du fan-out, SDK/web câblés). La merger réintroduirait une implémentation concurrente (`lastMessagePrisme.ts`). Backup conservé ; recommandation : fermeture après revue humaine | — | — |
| `claude/modest-cori-bosv4t` | Fix réel (fin d'appel après grace-expiry taguée `connectionLost`) réconcilié avec le design CALL-RESILIENCE actuel de main | `9d0648acc` | Suites CallEventsHandler/CallService gateway |
| `claude/keen-hamilton-{21usfa,a8ecsw,nba465}` | Fixes principaux atterris (PR #2842 e.a.) ; résidus SDK/tests réconciliés et poussés via le lot gateway | `Reconcile…` poussés | Lot gateway |

## Lots (40 branches à travail réel, conflits docs-only ou merge propre)

Trois lots traités en parallèle (un worktree par lot, réutilisé séquentiellement) :
- **Lot iOS** (23 branches `laughing-thompson-*`, `quirky-curie-xo6wvt`, `upbeat-euler-s5qysh`) : campagne a11y/design-system iOS de juillet, jamais soumise en PR. Merge de main, conflits docs en union anti-perte, push. Pas de build local (Linux) — validation via CI macOS (voir CI).
- **Lot gateway/shared** (9 branches `brave-archimedes-*`, `coverage/fix-profile-extended-mock`, `loving-thompson-52pzya` + 3 résidus keen-hamilton) : merge + tests ciblés bun + push.
- **Lot web** (5 branches `coverage/p2-admin-web*`, `focused-brown-uxa19f`, `practical-fermat-*`) : merge + tests ciblés ; tests de couverture obsolètes réalignés sur le comportement actuel de main (le code de prod fait foi).

Résultats : **41/41 branches des lots réconciliées et poussées** (23 iOS + 12 gateway + 5 web + `modest-cori-bosv4t`), zéro skip, zéro `--force`. Vérification finale sur les 50 branches poussées de la session : le main de référence (`f96478ffd`) est ancêtre de chaque tip et aucun marqueur de conflit ne subsiste dans les arbres. Constat notable du lot web : le delta code des 5 branches web vs main était **vide** (contenu déjà atterri) — seuls les journaux docs divergeaient (résolus par union). Idem pour 5 branches iOS (docs-only ou absorbées par main sous forme évoluée) ; le seul conflit code inter-branches (jj2z84 vs vs4jzr sur `CommunityLinksView.swift`) portait deux fois le MÊME changement (remplacement par `EmptyStateView`), dédupliqué.

## CI (builds iOS sur runner macOS)

- `ios-tests.yml` : full suite auto sur `dev` uniquement ; depuis le 2026-08-12 main a restauré un **gate compile-only sur les PR** touchant `apps/ios/**` (runner macos-15). Pas de `workflow_dispatch` piloté par branche pour la full suite → le chemin CI pour une branche est une PR vers main.
- PRs ouvertes porteuses de CI : #2888 (admin avatar) et #2889 (déblocage suites gateway) — nos pushes y ont déclenché des runs `CI` (run 31597341002 in progress sur `e4c0048bf` au moment de la rédaction ; tip précédent vert).
- Pour les branches iOS des lots : la PR d'intégration **#2891** déclenche le gate compile-only macOS (une PR par branche aurait saturé la file de runners macos-15 — cause documentée du retrait du trigger PR en juillet).
- `ci.yml` accepte `workflow_dispatch` (input `package_manager`) pour valider une branche non-iOS à la demande.

## CI et PRs

- **PR #2891 MERGÉE** (`0a71cf400`) : `claude/ios-a11y-reintegration-2026-08-12` → main. Intégration des 23 branches iOS des lots (57 fichiers, +2610/−28, iOS uniquement). Le **gate compile-only macos-15 était VERT** (run 31598392045) — les 23 branches compilent sur macOS. Le job `Test gateway` rouge au premier run était préexistant sur main. **Les 23 branches sources sont désormais purgeables.**
- **PR #2889 MERGÉE** (`1e4df803f`) : entre-temps main avait réalisé son propre réalignement des 8 suites (`0a3ee653b`, CI verte, leçon 141) — arbitrage : la version atterrie fait foi ; reliquat mergé = journal android-routine.
- **PR #2888 MERGÉE** (`05b95898f`) : fix admin avatar/CORP + `_count.anonymousParticipants` (432 tests ciblés verts en local). Un réalignement collatéral des mêmes 8 suites embarqué par la branche a été arbitré au profit de la version de main.
- **PR #2897** : cette branche de rapport (`claude/worktrees-branches-cleanup-ddo2ll`).
- PRs #2890, #2892–#2896 : mergées par d'autres sessions pendant celle-ci (rythme de main : ~20 commits durant la session).

## Backlog restant (227 branches CONFLICT_CODE)

Le croisement avec l'état des 2889 PRs du repo (fichier `tasks/worktree-triage-2026-08-12.tsv`, colonne 3) réduit le vrai backlog :

| Sous-classe | Nb | Lecture |
|---|---|---|
| PR mergée | 88 | Le travail a atterri ; le conflit résiduel = reliquats écartés à la revue (modèle `keen-hamilton-7w76mw`). Spot-check puis purge |
| PR fermée sans merge | 53 | Rejetées ou supplantées (modèle `#2454`/Vague 44, `5rkm85`). Revue humaine puis clôture |
| **Sans PR (orphelines)** | **86** | **Vrai travail jamais soumis** : 42 `laughing-thompson` + 28 `brave-archimedes` (campagnes juil.) + 16 divers. C'est la file de reprise réelle |

Répartition par zone (fichiers hors docs, sur les 227) : 112 iOS, 71 gateway, 58 web, 19 shared, 16 MeeshySDK, 7 android, 4 translator. Familles dominantes :

| Famille | Nb | Nature | Stratégie recommandée |
|---|---|---|---|
| `laughing-thompson-*` | 65 | Campagne iOS a11y/HIG (juil.), 1-2 commits/branche | Reprise par vagues de ~10 : merge main, résolution Swift, validation par le gate compile-only PR ; regrouper en branches d'intégration par écran |
| `brave-archimedes-*` | 32 | Campagne gateway/web (juil.) | Idem, tests bun locaux possibles |
| `tender-tesla-*` + `coverage/*` | ~50 | Campagnes de couverture de tests (juin), 10-40k lignes/branche, visent du code qui a beaucoup bougé | Coût de réalignement élevé ; trier par valeur (fichiers encore à 0 % de couverture d'abord), sinon clore. `tender-tesla-b4oj50`/`06ix7j` (fixes produit) à trier en priorité |
| `practical-fermat-*`, `quirky-curie-*`, `loving-*`, etc. | ~60 | Petits fixes/features divers juin-juil. | Reprise ciblée en s'appuyant sur `tasks/worktree-backlog-code-conflicts-2026-08-12.tsv` |
| Anciennes (mars-mai) | 6 | `fix-ios-profile-display-YQFM3`, `video-editor-sota-precision`, … | Probablement périmées ; revue humaine puis clôture |

## Hygiène (non exécuté — décision humaine requise)

647 branches (classes ANCESTOR_MERGED + CONTENT_MERGED_PATCHID + SUBJECT_LANDED_SQUASH + LANDED_DOCS_ONLY) ne portent plus aucun travail non atterri : purge possible via les scripts existants `tasks/branch-purge-2026-08-03*.sh` (mode dry-run par défaut) ou à partir de `tasks/worktree-triage-2026-08-12.tsv`. Aucune suppression n'a été faite dans cette session.

## Règles anti-perte respectées

- `main` local n'a jamais été réécrit (il était simplement en retard : clone shallow → `git fetch --unshallow`, puis fast-forward).
- Un backup `backup/<branche>-before-merge` existe pour chaque branche modifiée ; `main-backup-f38581848` marque l'état initial.
- Aucun `git push --force`, aucune suppression de branche ou de stash.
- Chaque résolution de conflit préserve les deux comportements ou documente la preuve que main couvre déjà la branche.
