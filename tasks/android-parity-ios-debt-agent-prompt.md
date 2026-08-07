# PROMPT — Agent : routine Android → parité iOS + dette iOS

> Copier-coller le bloc ci-dessous comme prompt d'une nouvelle session Claude Code (ou en
> argument de `/loop`, ou câblé dans un script cron sur le modèle de
> `tasks/test-coverage-routine/run-routine.sh`). Il est autoporteur : tout l'état vit dans les
> fichiers référencés (y compris `tasks/lane-cursor.md`), jamais dans la conversation. Voir
> §Mode d'invocation avant de le câbler en cron/launchd — un `flock` est obligatoire dans ce cas.

---

Tu es un agent d'itération autonome sur le monorepo Meeshy (`/Users/smpceo/Documents/v2_meeshy`).
Mission double, sur **deux lanes strictement séparées** :

- **A) Lane ANDROID (objectif principal)** — faire progresser `apps/android` jusqu'à parité
  complète — fonctionnelle, performance ET qualité — avec `apps/ios`.
- **B) Lane IOS-DETTE (opportuniste)** — en parallèle, corriger sur `apps/ios` +
  `packages/MeeshySDK` les points de dette de développement identifiés et sûrs à corriger
  maintenant, sans jamais retarder la lane A.

## Mode d'invocation & garde anti-chevauchement

- **Mode recommandé : `/loop` en pacing dynamique** (l'agent appelle lui-même `ScheduleWakeup`
  après chaque run terminé). C'est intrinsèquement sûr contre le chevauchement — le run suivant
  ne démarre jamais avant que le précédent soit fini, quelle que soit sa durée réelle.
- **Si câblé en cron/launchd à intervalle fixe** (sur le modèle de
  `tasks/test-coverage-routine/run-routine.sh`) : le script appelant DOIT prendre un `flock`
  non-bloquant sur un lock dédié (ex. `/tmp/meeshy-android-ios-routine.lock`) et sortir
  immédiatement en no-op s'il ne peut pas l'acquérir — jamais attendre, jamais empiler deux runs.
  Intervalle recommandé : **toutes les 4 h** (couvre le p90 mesuré d'un slice Android, ~4h ;
  la lane iOS-dette n'a pas encore de mesure empirique — traiter cette valeur comme un plafond de
  sécurité, pas une garantie, et resserrer si les premiers runs iOS-dette se montrent plus longs).
- **Dans les deux cas**, avant de choisir un slice/item : si tu détectes un run précédent encore
  actif (verrou déjà pris, ou une branche `claude/apps/*` modifiée dans les 30 dernières minutes
  sans commit final ni PR ouverte), **ne démarre pas** — log et sors proprement.

## Étape 0 — OBLIGATOIRE avant toute action, à chaque run

1. `git status` + `git log --oneline -15` — repère les commits récents / travaux parallèles
   (d'autres agents ou worktrees peuvent tourner en même temps).
2. Lis `CLAUDE.md` racine (TDD non négociable, Instant App Principles, SDK purity, Prisme
   Linguistique).
3. **Lane Android** — lis dans l'ordre : `apps/android/tasks/android-routine/ROUTINE.md`
   (la boucle complète y est déjà spécifiée), les **~200 dernières lignes** de
   `apps/android/tasks/android-routine/PROGRESS.md` (fichier >1 Mo — ne JAMAIS le charger en
   entier), `REVIEWER.md`, `TDD-COVERAGE.md`, `NOTES.md`, puis `apps/android/tasks/feature-parity.md`
   pour la phase en cours.
4. **Lane iOS-dette** — lis `apps/ios/CLAUDE.md`, `packages/MeeshySDK/CLAUDE.md`,
   `apps/ios/CURRENT_QUALITY_REVIEW.md` (revue vivante, mise à jour périodiquement), et
   `tasks/ios-debt-routine-progress.md` s'il existe (sinon tu le crées au premier run — bootstrap,
   cf. §Lane IOS-DETTE point 1). Si ce fichier dépasse ~1500 lignes, lis seulement ses ~300
   dernières lignes + le résumé en tête de fichier (cf. §Hygiène des fichiers d'état).
5. **Reprise après interruption** — avant de choisir un nouveau slice/item, cherche un run
   précédent resté inachevé : `git branch -r --list 'origin/claude/apps/*'` +
   `gh pr list --state open --search "apps/android OR apps/ios"`. Si tu trouves une branche/PR qui
   ressemble à un run coupé en plein milieu (commits présents mais pas de PR, ou PR ouverte alors
   que CI est verte et les gates locaux passent depuis un moment) : **termine-la ou classe-la
   explicitement en bloqué** avant de démarrer un nouveau slice/item. Ne l'abandonne jamais en
   silence — chaque run doit se conclure par : mergé, fermé avec raison notée, ou marqué ⚠ bloqué
   dans le fichier de suivi de sa lane.

## Choix de la lane (règle d'alternance, à évaluer à chaque run)

Source de vérité : **`tasks/lane-cursor.md`** — un fichier d'une ligne, machine-lisible, jamais un
comptage rétroactif d'entrées en texte libre. Format exact :

```
lane=<ANDROID|IOS_DETTE> android_streak=<N> last_run=<slice-id ou item-id>
```

S'il n'existe pas, crée-le au premier run avec `lane=ANDROID android_streak=0 last_run=none`
(commit dédié, cf. note de fin ci-dessous).

1. Lis la valeur actuelle de `lane` et `android_streak`.
2. **Bascule vers `IOS_DETTE`** si (a) la lane Android est bloquée — PR ouverte en attente de
   CI/merge, ou décision produit nécessitant l'utilisateur (section « Blocked » de
   `PROGRESS.md`) —, OU (b) `android_streak >= 5`. Ceci empêche la dette iOS de rester
   indéfiniment reportée.
3. Sinon, reste/repasse sur **`ANDROID`**.
4. **À la fin du run**, réécris `tasks/lane-cursor.md` :
   - run ANDROID effectué → `lane=ANDROID`, `android_streak` += 1, `last_run=<slice-id>`.
   - run IOS_DETTE effectué → `lane=ANDROID` (retour par défaut au run suivant),
     `android_streak=0`, `last_run=<item-id>`.

**Ne jamais mélanger les deux lanes dans un même commit/PR.** Diff strictement `apps/android`
seul, ou `apps/ios` + `packages/MeeshySDK` seul.

**`tasks/lane-cursor.md` et `tasks/ios-debt-routine-progress.md` vivent hors de `apps/android/` et
`apps/ios/`** — donc leur mise à jour ne peut jamais être bundlée dans le diff `apps/android`-only
ni `apps/ios`-only de la PR de slice/item (ça violerait la pureté de diff des deux lanes). Ils se
mettent à jour via **un commit séparé et dédié**, poussé directement sur `main` juste après le
merge de la PR de production (`chore(tasks): lane-cursor → ...` ou
`chore(tasks): ios-debt-routine-progress → ...`) — pas de PR/CI nécessaire, ce sont des fichiers
de suivi, pas du code de production.

## Lane ANDROID — un run = un slice

Suis **exactement** `apps/android/tasks/android-routine/ROUTINE.md` : choisir un slice → brancher
`claude/apps/android/<slice-id>` → TDD rouge → vert → `./apps/android/meeshy.sh check` →
gate `REVIEWER.md` → mettre à jour `feature-parity.md` / `PROGRESS.md` / `NOTES.md` → PR + CI +
squash-merge uniquement si diff `apps/android`-only + CI verte + reviewer PASS + rebase propre →
avancer d'exactement une phase. Ne redéfinis rien ici — `ROUTINE.md` est la source de vérité,
ne pas la dupliquer ni la contredire. Après le merge, pousse le commit séparé de mise à jour de
`tasks/lane-cursor.md` (cf. §Choix de la lane) — jamais dans le diff `apps/android`-only.

**Condition de complétion (« 100 % parité perf/qualité »)** : toutes les cases de
`feature-parity.md` cochées **et vérifiées**, **et** les gates de `ARCHITECTURE.md §17` actifs et
verts — Roborazzi (charte graphique), `:macrobenchmark` (cold-start ≤ 1 s + scroll jank),
couverture selon `TDD-COVERAGE.md`, CI/CD `ADR-023`. Tant qu'une case ou un gate manque, il reste
du travail : ne jamais déclarer 100 % sans preuve reproductible.

## Lane IOS-DETTE — un run = un item de dette corrigé

1. **Backlog** — `tasks/ios-debt-routine-progress.md`. S'il n'existe pas, crée-le au premier run
   en semant depuis `apps/ios/CURRENT_QUALITY_REVIEW.md` §« Refactoring Opportunities » +
   §« Modernization Opportunities » (état 2026-08-05, 6 items : `#filePath` vs `#file` dans les
   tests pour Swift 6 ; accès direct aux singletons observés dans les leaf views type
   `ConversationRow` ; unifier les booléens de chargement de gros ViewModels en un enum
   `ConversationLoadingPhase` ; migrer les `DispatchQueue.main.async` restants vers
   `@MainActor`/async-await structuré ; consolider le parsing de dates vers `Date.ParseStrategy`
   unifié avec repli ; évaluer `ObservableObject` → macro `@Observable`). Complète le backlog en
   épluchant les dernières entrées de `tasks/lessons.md` et un `grep -rn` ciblé
   (`print(`, `DispatchQueue.main.async`, `#file\b`, `.system(size:` restants) quand il se vide.
2. **RE-PROUVER avant de corriger** — chaque item peut déjà être résolu ou obsolète (le rapport
   date, le code bouge). Grep/lis le code réel. Si déjà résolu → coche « ÉCARTÉ + preuve », passe
   au suivant. Jamais de fix à l'aveugle sur la seule foi du rapport.
3. **Filtre de sûreté** — ne corrige que si l'item est : localisé à `apps/ios/` ou
   `packages/MeeshySDK/` (jamais gateway/web/shared sans item dédié) ; mécanique/à risque borné
   (refactor interne, migration API, style) et PAS une décision produit (UX, feature flag,
   sécurité E2EE) sans validation utilisateur ; vérifiable localement. Sinon note « décision
   produit en attente » et passe au suivant.
4. **TDD** — test rouge qui caractérise le comportement actuel/le manque, fix minimal, vert.
   Respecte `apps/ios/CLAUDE.md` (protocoles `*Providing`, mocks `Mock{Service}`, `@MainActor`
   sur les tests, factory functions).
5. **Vérifier** — `./apps/ios/meeshy.sh build` (grep « BUILD SUCCEEDED » dans le log, jamais
   l'exit code seul) puis `./apps/ios/meeshy.sh test` (suite ciblée si le run est long ; suite
   complète avant de merger un lot). SDK : scheme `MeeshySDK-Package`.
6. **Livrer** — branche `claude/apps/ios/debt-<slice-id>`, commit factuel `fix(ios/...)` ou
   `refactor(ios/...)`, push, PR, laisser tourner la CI « iOS Tests » réelle, squash-merge
   seulement si CI verte + gates locaux verts + rebase propre sur `main`. Jamais `--amend`,
   jamais de secret committé.
7. **Mettre à jour `tasks/ios-debt-routine-progress.md`** — coche l'item (hash de commit + preuve
   courte), journal d'itération, tout nouveau finding découvert en route (le backlog doit rester
   réapprovisionné). **Commit séparé** de la PR de production (cf. §Choix de la lane) — jamais
   bundlé avec le diff `apps/ios`/`packages/MeeshySDK`, et met à jour `tasks/lane-cursor.md` dans
   le même commit dédié.

## Hygiène des fichiers d'état (vérifier à chaque run)

Ces fichiers grossissent sans borne si rien ne les archive — `PROGRESS.md` fait déjà 1,3 Mo /
14 228 lignes après 7 semaines de routine. Avant d'ajouter une nouvelle entrée à un fichier de
suivi, vérifie sa taille (`wc -l`) :

- `apps/android/tasks/android-routine/PROGRESS.md`, `NOTES.md`, et
  `tasks/ios-debt-routine-progress.md` : si le fichier dépasse **~1500 lignes**, déplace tout sauf
  les ~300 dernières lignes vers `<même-dossier>/<nom>-archive-<AAAA-MM>.md` (créé ou complété),
  en laissant un lien en tête du fichier vivant vers l'archive la plus récente. L'archivage est un
  **commit séparé et dédié** (`chore(tasks): archive <fichier>`), jamais mélangé à un commit de
  slice/item.
- Ne touche jamais `apps/android/tasks/feature-parity.md` de cette façon — c'est un checklist
  d'état, pas un journal ; il ne grossit que par ajout de nouvelles capacités découvertes, à un
  rythme lent.
- `tasks/lane-cursor.md` reste toujours une seule ligne — rien à archiver.

## Règles dures (les deux lanes)

- TDD rouge → vert non négociable (`CLAUDE.md` racine). Comportement, jamais l'implémentation ;
  aucune tautologie.
- Jamais de merge sur CI rouge, jamais de baisse d'un seuil de couverture existant, jamais de
  secrets/`local.properties` committés.
- SDK purity partout — `packages/MeeshySDK/CLAUDE.md` côté iOS, dépendances `:sdk-core`/`:sdk-ui`
  (`apps/android/ARCHITECTURE.md §2`, `decisions.md` ADR-003) côté Android.
- Un incrément par run. Preuve avant fix. Aucune question à l'utilisateur si la réponse est dans
  le code ou les fichiers d'état ; ne remonte QUE les décisions produit bloquantes (section
  « Blocked » de chaque lane), puis continue sur l'item suivant en attendant.
- `git status`/`git log` avant toute action destructrice — le worktree est potentiellement
  partagé avec d'autres agents en parallèle.

Commence maintenant : Étape 0, puis choix de lane, puis premier run.
