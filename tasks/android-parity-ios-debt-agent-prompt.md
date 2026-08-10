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
   (la boucle complète y est déjà spécifiée), puis `apps/android/tasks/android-routine/PROGRESS.md`
   (fichier >1 Mo — ne JAMAIS le charger en entier). **Attention : PROGRESS.md est en
   prepend/newest-first** — l'entrée la plus récente est en TÊTE de fichier, pas en queue. Lis les
   **~200 PREMIÈRES lignes** (`head -200`), pas la fin. Vérifie ce fait toi-même (compare la date de
   la 1ère et de la dernière entrée) avant de t'y fier aveuglément — convention observée le
   2026-08-08, elle peut changer. Puis `REVIEWER.md`, `TDD-COVERAGE.md`, `NOTES.md` (**convention
   inverse : append/oldest-first** — lis ses ~200 DERNIÈRES lignes, `tail -200`), puis
   `apps/android/tasks/feature-parity.md` pour la phase en cours.
4. **Lane iOS-dette** — lis `apps/ios/CLAUDE.md`, `packages/MeeshySDK/CLAUDE.md`,
   `apps/ios/CURRENT_QUALITY_REVIEW.md` (revue vivante, mise à jour périodiquement), et
   `tasks/ios-debt-routine-progress.md` s'il existe (sinon tu le crées au premier run — bootstrap,
   cf. §Lane IOS-DETTE point 1). Si ce fichier dépasse ~1500 lignes, lis seulement ses ~300
   dernières lignes + le résumé en tête de fichier (cf. §Hygiène des fichiers d'état).
5. **Reprise après interruption** — avant de choisir un nouveau slice/item, cherche un run
   précédent resté inachevé : `git branch -r --list 'origin/claude/apps/*'` +
   `gh pr list --state open --search "apps/android OR apps/ios"`. **Filtre le bruit** : ce repo
   accumule des dizaines de branches `claude/apps/*` orphelines d'anciens processus sans rapport
   avec cette routine (observé : 254 branches mono-commit, aucune de moins de 24h, aucune avec PR
   ouverte) — ignore toute branche sans commit récent (< 24h) ET sans PR ouverte associée, ce n'est
   pas un run de CETTE routine coupé en plein milieu. Ne t'intéresse qu'aux branches/PR qui matchent
   les deux : commit récent OU PR ouverte. Si tu en trouves une qui ressemble à un run coupé en
   plein milieu (commits présents mais pas de PR, ou PR ouverte alors que CI est verte et les gates
   locaux passent depuis un moment) : **termine-la ou classe-la explicitement en bloqué** avant de
   démarrer un nouveau slice/item. Ne l'abandonne jamais en silence — chaque run doit se conclure
   par : mergé, fermé avec raison notée, ou marqué ⚠ bloqué dans le fichier de suivi de sa lane.

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
de suivi, pas du code de production. **Pousse avec `git push origin HEAD:main` explicitement** —
jamais `git push origin <nom-de-ta-branche-locale>` : si ta branche locale courante porte par
coïncidence un nom qui existe déjà côté remote (ex. le nom de la branche du worktree de routine
lui-même), Git crée silencieusement une branche remote homonyme au lieu de mettre à jour `main`,
sans la moindre erreur (piège vécu à l'itération 4).

## Lane ANDROID — un run = un slice

**Piège vécu à l'itération 8 : crée la branche AVANT d'éditer le moindre fichier, pas après.**
Un agent a commencé à écrire test + code directement sur la branche du worktree de routine
(`ops/android-ios-parity-routine`) parce que le choix du slice et l'ouverture d'un éditeur sont
venus avant le `git checkout -b`. Récupéré via un `git stash` scopé, mais du temps perdu pour rien.
Dès que le slice est choisi, la **toute première commande** — avant le premier `Write`/`Edit` — est
le `git checkout -b` ci-dessous, jamais après.

Suis **exactement** `apps/android/tasks/android-routine/ROUTINE.md` : choisir un slice → brancher
`git checkout -b claude/apps/android/<slice-id> origin/main` (**`origin/main` explicitement, jamais
le ref local `main`** — dans ce repo multi-worktree, `main` local peut être périmé de dizaines de
commits même après un `git fetch`/`merge --ff-only` réussi sur ta propre branche courante, qui ne
met à jour que celle-ci, pas le ref `main`) → TDD rouge → vert → `./apps/android/meeshy.sh check` →
gate `REVIEWER.md` → mettre à jour `feature-parity.md` / `PROGRESS.md` / `NOTES.md` → PR + CI +
squash-merge uniquement si diff `apps/android`-only + CI verte + reviewer PASS + rebase propre →
avancer d'exactement une phase. Ne redéfinis rien ici — `ROUTINE.md` est la source de vérité,
ne pas la dupliquer ni la contredire. Après le merge, pousse le commit séparé de mise à jour de
`tasks/lane-cursor.md` (cf. §Choix de la lane) — jamais dans le diff `apps/android`-only.

**Dernière action avant de conclure le run : reviens sur la branche du worktree de routine,
jamais sur ta branche de slice.** `git checkout ops/android-ios-parity-routine &&
git fetch origin main --quiet && git merge --ff-only origin/main`. Sans ça, le worktree reste
checkouté sur `claude/apps/android/<slice-id>` — déjà squash-mergée, donc ses commits sont
orphelins/périmés — et le prochain run échoue sur `git merge --ff-only` avec une erreur de
branches divergentes (vécu à l'itération 21 : aucune perte de données, juste un checkout à
corriger, mais ça bloque le run suivant pour rien).

**RE-PROUVER avant de choisir un slice — une note « Next slice » est une hypothèse, pas un
fait.** L'itération 2 a découvert qu'une recommandation « à faire » répétée pendant plusieurs runs
(catégorie expand/collapse) était en réalité déjà livrée — personne n'avait rouvert le composant
avant de recopier la note. Avant de retenir le slice suggéré par `PROGRESS.md`/`feature-parity.md`,
va lire le code réel visé (pas seulement la note) et confirme que le gap existe encore. Si un slice
est resté non pris pendant plusieurs runs, ne présume pas automatiquement qu'il faut le re-scoper en
plus petit (ça a marché pour `category-picker-create`, un composant réutilisable déjà prêt à
brancher) — vérifie la surface réellement restante avant de conclure ; parfois c'est juste
légitimement trop gros pour un slice (ex. `OnboardingFlowView`, 8 étapes d'UI distinctes à créer),
et la bonne action est de documenter une décomposition concrète en sous-slices plutôt que de le
re-proposer tel quel.

**Angle mort catégoriel (trouvé à l'itération 19, par l'utilisateur) : le choix de slice re-lit
`feature-parity.md` mais ne se demande jamais quelles CATÉGORIES ENTIÈRES en sont absentes.**
L'audit source (`tasks/audit/part-01..23.md`) n'a lu que les fichiers `.swift` — les asset
catalogs iOS (`.xcassets`) ont échappé à l'audit, donc l'icône de l'app (aucun `mipmap-*`, aucun
`android:icon` dans `AndroidManifest.xml`, l'app tourne avec l'icône générique Android) n'a jamais
été une ligne de checklist nulle part. Résultat : 18 runs consécutifs sur des écrans applicatifs
(auth/conversations), zéro sur les intégrations plateforme natives — pas parce qu'elles sont
faites, mais parce qu'aucun mécanisme ne les fait remonter en RE-PROUVANT une note existante sur
un item qui n'a jamais eu de note. **Périodiquement (tous les ~5 runs Android, ou dès que le
pointeur « Next slice » se répète sans conviction), vérifie explicitement l'existence — pas juste
l'état — de ces catégories** : icône de l'app / icône adaptative, splash screen, widgets
écran d'accueil (`AppWidgetProvider`/`GlanceAppWidget` — grep, zéro résultat = zéro
implémentation), Picture-in-Picture, taxonomie des canaux de notification (`NotificationChannel`,
~80 types de notifications à couvrir par `ARCHITECTURE.md §18`). Si une catégorie entière manque
de ligne dans `feature-parity.md`, AJOUTE-la explicitement (c'est corriger un trou d'audit, pas une
nouvelle exigence produit) avant de décider de la traiter ou de la différer.

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
5. **Vérifier** — `./apps/ios/meeshy.sh build` (le wrapper imprime son propre message
   **`Build succeeded in <N>s`** — pas le `BUILD SUCCEEDED` brut de `xcodebuild`, qui n'apparaît
   que si tu appelles `xcodebuild` directement sans passer par le wrapper ; grep le format qui
   correspond à la commande que tu as réellement lancée, jamais l'exit code seul) puis
   `./apps/ios/meeshy.sh test` (suite ciblée si le run est long ; suite complète avant de merger un
   lot). SDK : scheme `MeeshySDK-Package`.
6. **Livrer** — `git checkout -b claude/apps/ios/debt-<slice-id> origin/main` (`origin/main`
   explicitement, jamais le ref local `main`, potentiellement périmé dans ce repo multi-worktree —
   cf. §Lane ANDROID). **`origin/main` peut aussi dériver PENDANT une vérification locale
   longue** (repo multi-worktree, d'autres agents mergent en parallèle) — re-`git fetch`/rebase
   juste avant la passe de vérification finale, pas seulement à l'Étape 0 (un run a vu 6 échecs de
   test purement dus à un `origin/main` périmé pendant le test, pas au diff lui-même). Puis commit
   factuel `fix(ios/...)` ou `refactor(ios/...)`, push, PR. **N'assume pas que le workflow
   « iOS Tests » (`ios-tests.yml`) est le bon gate** — il ne se déclenche que sur push vers `dev`,
   jamais sur une PR. **N'assume pas non plus qu'un diff `apps/ios`-only échappe au monorepo** :
   `ci.yml` n'a pas de filtre de chemin et tourne sa matrice complète (gateway/web/shared/
   translator/audio/voice, ~15-20 min) sur TOUTE PR quel que soit le diff — seul `packages/
   MeeshySDK`-only en est dispensé (remplacé par `sdk-tests`/`sdk-tests.yml`). Ne devine jamais la
   liste des checks : `gh pr checks <n>` te montre ceux réellement attachés à la PR. Laisse tourner
   ces checks-là, squash-merge seulement si tout est vert + gates locaux verts + rebase propre sur
   `main`. Jamais `--amend`, jamais de secret committé.
7. **Mettre à jour `tasks/ios-debt-routine-progress.md`** — coche l'item (hash de commit + preuve
   courte), journal d'itération, tout nouveau finding découvert en route (le backlog doit rester
   réapprovisionné). **Commit séparé** de la PR de production (cf. §Choix de la lane) — jamais
   bundlé avec le diff `apps/ios`/`packages/MeeshySDK`, et met à jour `tasks/lane-cursor.md` dans
   le même commit dédié.

## Hygiène des fichiers d'état (vérifier à chaque run)

Ces fichiers grossissent sans borne si rien ne les archive — `PROGRESS.md` fait déjà 1,3 Mo /
14 228 lignes après 7 semaines de routine. Avant d'ajouter une nouvelle entrée à un fichier de
suivi, vérifie sa taille (`wc -l`) :

- **`PROGRESS.md`** (prepend/newest-first, cf. §Étape 0) : si le fichier dépasse **~1500 lignes**,
  garde les **~300 PREMIÈRES lignes** (les plus récentes) et déplace le RESTE — la queue, la plus
  ancienne — vers `apps/android/tasks/android-routine/PROGRESS-archive-<AAAA-MM>.md` (créé ou
  complété), en laissant un lien en tête du fichier vivant vers l'archive.
- **`NOTES.md`** (append/oldest-first) et **`tasks/ios-debt-routine-progress.md`** (même convention
  par défaut — vérifie au premier archivage, ne suppose pas) : si le fichier dépasse ~1500 lignes,
  garde les **~300 DERNIÈRES lignes** (les plus récentes) et déplace le DÉBUT — le plus ancien —
  vers `<même-dossier>/<nom>-archive-<AAAA-MM>.md`, en laissant un lien en tête vers l'archive.
- Dans les deux cas, l'archivage est un **incrément séparé et dédié**
  (`chore(tasks): archive <fichier>`), jamais mélangé à un commit de slice/item. `PROGRESS.md` et
  `NOTES.md` vivent sous `apps/android/` : leur archivage passe par le flux normal PR + CI +
  squash-merge de la lane Android (diff `apps/android`-only), **pas** un push direct — contrairement
  à `tasks/lane-cursor.md`/`tasks/ios-debt-routine-progress.md` qui, eux, sont hors `apps/android/`
  et `apps/ios/` et se poussent directement (cf. §Choix de la lane). Après un run d'archivage pur
  (ni slice ni item), `tasks/lane-cursor.md` ne bouge pas — pas de commit vide pour un `lane`/
  `android_streak`/`last_run` inchangé.
- **Le scan de reprise après interruption (§Étape 0 point 5) reste obligatoire même quand tu
  penses partir sur un run d'archivage pur** — fais-le AVANT de choisir l'archivage, pas après
  coup. C'est le seul check bon marché qui pourrait révéler un vrai blocage passant devant la
  hygiène (l'itération 10 l'a fait après coup et est tombée juste, mais l'ordre correct est avant).
- Ne touche jamais `apps/android/tasks/feature-parity.md` de cette façon — c'est un checklist
  d'état, pas un journal ; il ne grossit que par ajout de nouvelles capacités découvertes, à un
  rythme lent.
- `tasks/lane-cursor.md` reste toujours une seule ligne — rien à archiver.

## Règles dures (les deux lanes)

- TDD rouge → vert non négociable (`CLAUDE.md` racine). Comportement, jamais l'implémentation ;
  aucune tautologie.
- Jamais de merge sur CI rouge, jamais de baisse d'un seuil de couverture existant, jamais de
  secrets/`local.properties` committés.
- **`gh pr merge --squash --delete-branch` échoue en code de sortie non-zéro dans ce setup
  multi-worktree** (`fatal: 'main' is already used by worktree ...`) dès que `main` est déjà
  checkouté ailleurs — le merge réussit pourtant côté serveur, seul le nettoyage local de la
  branche échoue. Ne pas interpréter ce code de sortie comme un échec de merge : vérifie toujours
  via `gh pr view --json state,mergedAt`, et si besoin supprime la branche remote séparément
  (`git push origin --delete <branche>`) plutôt que de compter sur `--delete-branch`.
- SDK purity partout — `packages/MeeshySDK/CLAUDE.md` côté iOS, dépendances `:sdk-core`/`:sdk-ui`
  (`apps/android/ARCHITECTURE.md §2`, `decisions.md` ADR-003) côté Android.
- Un incrément par run. Preuve avant fix. Aucune question à l'utilisateur si la réponse est dans
  le code ou les fichiers d'état ; ne remonte QUE les décisions produit bloquantes (section
  « Blocked » de chaque lane), puis continue sur l'item suivant en attendant.
- `git status`/`git log` avant toute action destructrice — le worktree est potentiellement
  partagé avec d'autres agents en parallèle.

Commence maintenant : Étape 0, puis choix de lane, puis premier run.
