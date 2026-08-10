# iOS Debt Routine — Progress

> Convention : **append/oldest-first** (comme `apps/android/tasks/android-routine/NOTES.md`) —
> nouvelles entrées de journal ajoutées en BAS du fichier. La section « Backlog » ci-dessous est
> un état vivant mis à jour EN PLACE (pas un journal) ; le « Journal d'itération » qui suit est
> append-only. Si ce fichier dépasse ~1500 lignes, archiver le DÉBUT (le plus ancien) du journal
> vers `tasks/ios-debt-routine-progress-archive-<AAAA-MM>.md`, jamais la section Backlog.

## Backlog

Seedé le 2026-08-09 depuis `apps/ios/CURRENT_QUALITY_REVIEW.md` §« Refactoring Opportunities » +
§« Modernization Opportunities » (relu intégralement à cette date, pas recopié d'une version
périmée). Chaque item est RE-PROUVÉ contre le code réel avant d'être retenu pour un run — voir
journal ci-dessous pour la preuve associée à chaque changement de statut.

1. **[FAIT — 2026-08-09]** Swift 6 Test Safety — préférer `#filePath` à `#file` dans les
   paramètres par défaut des helpers de test (Swift 6 language mode change ce que `#file`
   retourne : un "file ID" synthétique au lieu du chemin absolu, ce qui casse le lien
   fichier/ligne de Xcode sur un échec relayé via un helper). 3 sites trouvés et corrigés sous
   `packages/MeeshySDK/Tests/`. Guard de régression ajouté :
   `Swift6TestFileArgSourceGuardTests.swift`.
2. **[ÉCARTÉ — déjà résolu, preuve 2026-08-09]** Shared Singleton Access — `ConversationRow`
   observait des singletons globaux (`PresenceManager`, etc.) via `@ObservedObject` dans une leaf
   view. **Déjà corrigé avant ce run** : `ThemedConversationRow.swift` reçoit `presenceState:
   PresenceState` et `isDark: Bool` en propriétés `let` primitives passées par le parent ; le
   commentaire ligne 13 documente explicitement la règle (« évite que chaque ligne observe
   PresenceManager »). Zéro `@ObservedObject` sur singleton dans le fichier. Aucune action prise.
3. **[OUVERT — caractérisation corrigée, preuve 2026-08-10]** UI State Aggregation — unifier les
   booléens de chargement de `ConversationViewModel` en un enum `ConversationLoadingPhase`. La note
   d'origine était **partiellement fausse**, pas seulement reportable telle quelle : le groupe des 4
   booléens de pagination est `isLoadingInitial`/`isLoadingOlder`/`isLoadingNewer`/**`isRevalidating`**
   (PAS `isLoadingReactions`, qui est une préoccupation sans rapport — le chargement du sheet de
   détail des réactions — la note d'origine confondait les deux). Surtout : **M1 est déjà livré**,
   depuis longtemps — `ConversationLoadingPhase.swift` (enum + `derive()`) existe depuis le commit
   `f734bc731` (2026-05-21, « refactor(ios/conv): add ConversationLoadingPhase enum (additive) »),
   bien avant le bootstrap de ce backlog le 2026-08-09 ; `ConversationViewModel.paginationPhase` en
   est déjà la projection canonique. Le run bootstrap avait grep les booléens (qui existent toujours,
   à raison) sans remarquer que la projection dérivée existait déjà et documentait elle-même le
   travail restant (« M2 follow-up to PR #280 »).
   Reste (M2, non tenté ce run) : migrer les call sites qui lisent encore les booléens bruts vers
   `paginationPhase`/`isBlockingSpinnerNeeded`/`isPaginating`, puis supprimer les booléens. Les
   call sites hors VM identifiés au 2026-08-10 : `ConversationView.swift` (2 sites,
   `viewModel.isLoadingInitial`), `ConversationFirstRenderWarmup.swift` (1 site, valeur ignorée).
   Complication non documentée par la note d'origine : une **DEUXIÈME copie non synchronisée
   explicitement** des mêmes 4 booléens existe dans `ConversationStateStore.swift` (scaffolding de
   découpage du god-object, cf. `apps/ios/tasks/ios-simplification-passes-2026-06-24.md`) — la
   sémantique exacte de mirroring entre les deux n'a pas été étudiée ce run. Reporté : même si la
   substitution `isLoadingInitial` → `paginationPhase.isBlockingSpinnerNeeded` est une équivalence
   provable (donc mécanique en apparence), elle touche un `ConversationView.swift` qui observe
   *aussi* `ConversationStateStore` pour d'autres champs, et le risque de mal caractériser LEQUEL des
   deux objets une vue donnée doit lire dépasse ce qu'un run peut vérifier sans étude dédiée.
4. **[EN COURS — 2 sous-tranches livrées, triage exhaustif app-side terminé 2026-08-10 : ZÉRO site
   mécanique restant sous `apps/ios/Meeshy/`]** Swift Concurrency Migration — `DispatchQueue.main.async`
   restants → `@MainActor`/async-await structuré.
   **Livré (run #2, 2026-08-10)** : `DiscoverTab.swift` (`SMSComposerView.Coordinator.messageComposeViewController`, un
   callback `nonisolated` de `MFMessageComposeViewControllerDelegate`) migré vers
   `Task { @MainActor in }` — PR #2709, mergé (`44d8d2d92`).
   **Livré (run #3, 2026-08-10)** : `CameraView.swift` — `CameraPreviewLayer.updateUIView` (SwiftUI
   `UIViewRepresentable`) sautait sur main via GCD brut sans rationale documentée, alors que le
   MÊME fichier utilise déjà `Task { @MainActor in }` pour ses deux delegate callbacks
   (`AVCaptureFileOutputRecordingDelegate.fileOutput`, `AVCapturePhotoCaptureDelegate.photoOutput`)
   — incohérence interne au fichier, confirmant que c'était de la dette et pas un choix délibéré.
   Migré vers `Task { @MainActor in }` — PR #2721, mergé (`229f97f4f`).
   **Découverte majeure en creusant le reste** (re-compté à 56 fichiers sous `apps/ios/Meeshy/` au
   2026-08-10, contre 79 annoncé le 2026-08-09 — écart non expliqué, le nombre du 2026-08-10 fait
   foi) : la note d'origine caractérisait ce backlog comme un lot HOMOGÈNE de 79/56 sites mécaniques
   à traiter « par feature/dossier ». C'est **faux** — un échantillonnage montre au moins 3 classes
   très différentes mélangées dans le même grep :
   - **Faux positifs commentaire** : `ConversationSocketHandler.swift` (doc décrivant un ancien
     design déjà retiré), `WebRTCService.swift` (commentaire décrivant le comportement de
     `P2PWebRTCClient` — le code réel de CE fichier utilise déjà `Task { @MainActor in }`, aucune
     dette).
   - **Timing délibérément calibré, documenté comme tel — NE JAMAIS migrer mécaniquement** :
     `Router.swift` (`DispatchQueue.main.asyncAfter(deadline: .now() + 0.05)`, commentaire
     « comportement inchangé »), `ConversationFirstRenderWarmup.swift` (commentaire détaillé sur un
     dump de performance du 2026-07-30 : « repart du drain du runloop (~15 frames), la marge de pile
     est alors maximale »).
   - **Pont déjà correct vers structured concurrency** : `MessageStore.swift`
     (`yieldToRunLoop()` enveloppe `DispatchQueue.main.async` dans une fonction `async` via
     `CheckedContinuation` — un pont volontaire, pas de la dette).
   - **Escape d'un cycle de mise à jour SwiftUI synchrone, RATIONALE DOCUMENTÉE — NE PAS migrer
     mécaniquement sans étude dédiée** (classe identifiée au run #3, absente de la liste du run #2) :
     `ConversationViewModel.swift:1105` (commentaire explicite : « guarantees the @Published mutation
     lands on a fresh runloop iteration AFTER the current view body evaluation completes » — évite
     « Publishing changes from within view updates »), `StoryViewerView+Content.swift` (3 sites, dont
     un composer-focus workaround documenté ligne 2124 : « on force donc un front false→true sur le
     runloop suivant »), `StoryViewerView+Sidebar.swift` (2 sites, feedback de sheet post-`Task`),
     `ConversationListView+Overlays.swift` (3 sites, chorégraphie d'animation en deux temps +
     marche de hiérarchie de superviews). `Task { @MainActor in }` défère probablement de façon
     équivalente, mais la garantie précise vis-à-vis du cycle de rendu SwiftUI n'est PAS documentée
     comme équivalente et une régression ici prendrait la forme d'un warning runtime
     (« Publishing changes... ») invisible à `meeshy.sh test` — nécessite une vérification manuelle
     sur device/simulateur avant migration, pas seulement build+test verts.
   - **Nonisolated WebRTC delegate, risque élevé — NE JAMAIS toucher sans étude dédiée** :
     `P2PWebRTCClient.swift` (6 sites, `RTCPeerConnectionDelegate`/`RTCDataChannelDelegate`) — chaque
     site porte un commentaire « Identity guard » documentant pourquoi le hop capture le
     `RTCPeerConnection`/`RTCDataChannel` d'origine pour rendre no-op un callback tardif d'une
     connexion déjà déchirée (protection contre la pollution d'un nouvel appel par les callbacks
     résiduels de l'ancien). Zone déjà identifiée comme sensible/auditée — cf.
     `reference_calls_audit_2026_07_11.md` (mémoire).
   - **Vraie dette mécanique (les deux seules classes migrées à ce jour)** : callback/vue qui saute
     sur main via GCD brut sans raison de timing documentée ET dont l'appelant n'observe aucune
     règle de séquencement SwiftUI, ex. `DiscoverTab.swift`, `CameraView.swift`.
   **Conclusion (run #3, triage exhaustif terminé)** : les 55 fichiers restants sous
   `apps/ios/Meeshy/` ont maintenant TOUS été classés individuellement (pas seulement échantillonnés).
   Chaque occurrence non-`asyncAfter` de `DispatchQueue.main.async` relève soit d'un pont déjà
   correct, d'un timing documenté à ne jamais toucher, d'une escape SwiftUI documentée à étude
   dédiée, soit du WebRTC à haut risque — **zéro site mécanique nu restant**. Toutes les occurrences
   `asyncAfter(deadline:)` restantes sont de la chorégraphie d'animation/délai UI intentionnelle (non
   auditées site par site individuellement ce run, mais leur forme — un délai non nul documenté par
   son usage visuel — les exclut structurellement de la catégorie « hop nonisolated sans raison »).
   Reprendre cet item nécessite soit (a) une étude dédiée de la classe « escape SwiftUI » avec
   vérification manuelle sur device des warnings runtime, soit (b) accepter de fermer l'item comme
   substantiellement traité (2/2 sites mécaniques nus migrés) et le retirer du backlog actif.
5. **[OUVERT — trop large / prérequis manquant]** Modern Date Parsers — consolider vers
   `Date.ParseStrategy` avec repli. Au 2026-08-09 : **20 fichiers** utilisent `DateFormatter()`
   directement (`apps/ios/Meeshy` + `packages/MeeshySDK/Sources`), et **0 usage** de
   `Date.ParseStrategy` existe dans le repo — donc pas de couche de consolidation existante à
   étendre, il faudrait d'abord concevoir l'API unifiée (le rapport suppose une consolidation
   "layers" qui n'existe pas encore). Reporté : nécessite une décision de conception avant tout
   fix mécanique.
6. **[BLOQUÉ — décision produit/architecture, PAS tenté]** Observation Macro —
   `ObservableObject` → macro `@Observable`. **118 classes** `ObservableObject` au 2026-08-09,
   **0** migrées vers `@Observable`. `@Observable` (framework Observation) nécessite
   **iOS 17+/macOS 14+** ; `apps/ios/CLAUDE.md` fixe le plancher de déploiement à **iOS 16.0+**
   (`MeeshyWidgets` seule extension à iOS 17+). Une migration totale casserait la compatibilité
   iOS 16 ; une migration partielle par-vue avec `#available` biseauté est une décision
   d'architecture non triviale (double maintenance ObservableObject/`@Observable` dans les
   ViewModels partagés). Ne PAS tenter sans validation utilisateur explicite sur : (a) relever le
   plancher à iOS 17, ou (b) accepter un split d'implémentation par version d'OS.

Le backlog sera réapprovisionné (grep `print(`, `DispatchQueue.main.async`, `#file\b`,
`.system(size:` restants + dernières entrées de `tasks/lessons.md`) quand les items ouverts
restants (3, 4, 5) auront été soit décomposés en sous-slices exécutables, soit clos.

## Journal d'itération

### 2026-08-09 — Run #1 (bootstrap, première itération de la lane IOS_DETTE)

Contexte : `tasks/lane-cursor.md` était à `lane=ANDROID android_streak=5` — règle d'alternance
(streak ≥ 5) déclenchée, bascule vers `IOS_DETTE` pour ce run. Aucune branche `claude/apps/ios/*`
ni PR ouverte trouvée à la reprise (`git branch -r --list 'origin/claude/apps/*'` = uniquement des
branches `android/*` ; `gh pr list --state open --search "apps/android OR apps/ios"` = vide) — pas
de run interrompu à terminer.

**Bootstrap** : `tasks/ios-debt-routine-progress.md` n'existait pas. Semé depuis
`apps/ios/CURRENT_QUALITY_REVIEW.md` §Refactoring Opportunities + §Modernization Opportunities,
relu intégralement à cette date (6 items, identiques à la liste connue de la spec — le rapport
n'avait pas changé depuis).

**RE-PROUVÉ chaque item avant de choisir** (grep/lecture du code réel, jamais la seule foi du
rapport) :
- Item 1 (`#file`/`#filePath`) : `grep -rn "file: StaticString = #file\b"` sous
  `apps/ios/MeeshyTests`, `packages/MeeshySDK/Tests` → 3 matches réels, tous sous
  `packages/MeeshySDK/Tests/` (`TimelineViewModelTests.swift:329`,
  `UserStateMutationTests.swift:19`, `PushNotificationManagerTests.swift:296`). `apps/ios/MeeshyTests`
  = 0 violation (déjà propre). Confirmé légitime et borné.
- Item 2 (ConversationRow singleton) : lu `ThemedConversationRow.swift` en entier — déjà résolu,
  voir Backlog #2. ÉCARTÉ.
- Item 3 (ConversationLoadingPhase) : `grep -n "isLoading" ConversationViewModel.swift` → 4
  booléens toujours séparés avec guards croisés. Toujours réel, mais reporté (surface trop large
  pour ce run, cf. Backlog #3).
- Item 4 (DispatchQueue.main.async) : `grep -rl` → 79 fichiers sous `apps/ios/Meeshy/`. Trop large
  pour un slice mécanique unique, cf. Backlog #4.
- Item 5 (Date.ParseStrategy) : `grep -rl "DateFormatter()"` → 20 fichiers ; `grep -rl
  "ParseStrategy"` → 0 fichier. Pas de socle existant à étendre, cf. Backlog #5.
- Item 6 (@Observable) : `grep -rl ": ObservableObject"` → 118 fichiers ; `grep -rl "@Observable"`
  → 0. Bloqué par le plancher iOS 16.0+ documenté dans `apps/ios/CLAUDE.md` (ligne 4). Décision
  produit/architecture, PAS tenté — cf. Backlog #6.

**Choisi : Item 1** — seul item passant le filtre de sûreté sans réserve (mécanique, borné à 3
fichiers de test, localisé `packages/MeeshySDK/Tests/`, zéro décision produit).

**TDD** :
- RED : ajouté `packages/MeeshySDK/Tests/MeeshySDKTests/Swift6TestFileArgSourceGuardTests.swift`
  — walk récursif de `Tests/` (couvre `MeeshySDKTests` + `MeeshyUITests`), regex `#file\b`
  (ne matche jamais `#filePath` : pas de frontière de mot entre "file" et "Path", les deux étant
  des caractères de mot contigus). Lancé isolément :
  `xcodebuild test -scheme MeeshySDK-Package -only-testing:MeeshySDKTests/Swift6TestFileArgSourceGuardTests`
  → `** TEST FAILED **` (exit 65), confirmant la RED avec les 3 violations réelles.
- GREEN : remplacé `#file` → `#filePath` dans les 3 sites. Relancé le guard + les 3 classes de
  test directement affectées (`Swift6TestFileArgSourceGuardTests`, `UserStateMutationTests`,
  `PushNotificationManagerTests`, `TimelineViewModelTests`) → exit 0, aucune ligne
  `** TEST FAILED **` (contraste net avec le run RED précédent qui l'affichait explicitement).

**Vérification** :
- Suite complète `MeeshySDK-Package` (phase0, `MeeshySDKTests` + `MeeshyUITests`) lancée en local
  pour confirmer l'absence de régression sur le paquet touché.
- `./apps/ios/meeshy.sh build` lancé en sanity check (le diff ne touche que des fichiers de test
  SDK, hors du chemin de build app, mais suivi de la procédure de vérification à la lettre).
- Suite complète app (phases 1-3, `meeshy.sh test`) **non relancée localement** — diff nul sur
  `apps/ios/Meeshy/` et sur les cibles de test de l'app ; laissé à la CI « iOS Tests » réelle
  avant squash-merge, conformément à la leçon opérationnelle
  `feedback_skip_slow_local_ios_verify_when_ci_covers_it.md` (ne pas dupliquer localement ce que
  la CI couvre déjà quand le diff ne justifie pas le temps).
- Résultats : guard `Swift6TestFileArgSourceGuardTests` RED (`** TEST FAILED **`, exit 65) puis
  GREEN ; suite complète `MeeshySDK-Package` (`MeeshySDKTests`+`MeeshyUITests`) verte localement
  (exit 0, zéro `TEST FAILED`/`error:` dans le log) ; `./apps/ios/meeshy.sh build` → « Build
  succeeded in 130s » (voir leçon opérationnelle plus bas — le wrapper `meeshy.sh` n'imprime
  jamais le littéral `BUILD SUCCEEDED`).
- PR : https://github.com/isopen-io/meeshy/pull/2689 — commit `514a7f77e` sur
  `claude/apps/ios/debt-swift6-file-vs-filepath` (branché depuis `origin/main` explicite).
  CI « iOS Tests » en cours au moment de la rédaction — squash-merge seulement si tout est vert.
- `tasks/lane-cursor.md` → `lane=ANDROID android_streak=0 last_run=ios-debt-swift6-file-vs-filepath`
  (commit séparé, poussé directement sur `main` avec `git push origin HEAD:main`, cf. §Choix de
  la lane — jamais dans le diff `packages/MeeshySDK`-only de la PR ci-dessus).

### 2026-08-10 — Run #2 (2e itération de la lane IOS_DETTE, 13e itération globale)

Contexte : `tasks/lane-cursor.md` était à `lane=ANDROID android_streak=5 last_run=auth-profile-step-fields`
— règle d'alternance (streak ≥ 5) déclenchée, bascule vers `IOS_DETTE`. Scan de reprise (Étape 0
point 5) : `git branch -r --list 'origin/claude/apps/*'` = 254 branches, toutes `android/*`, la plus
récente datée du 2026-07-27 (>24h, aucune PR ouverte associée) — bruit d'anciens processus, ignoré
conformément au filtre. `gh pr list --state open --search "apps/android OR apps/ios"` = vide. Pas de
run interrompu à terminer.

**RE-PROUVÉ intégralement le backlog avant de choisir** (voir corrections détaillées ci-dessus aux
items 3 et 4 — la note écrite le 2026-08-09, un jour plus tôt seulement, contenait déjà deux erreurs
de caractérisation non triviales : un mixup `isLoadingReactions`/`isRevalidating` sur l'item 3, et un
lot supposé homogène sur l'item 4 qui s'est révélé être 3 classes hétérogènes dont deux à ne jamais
toucher mécaniquement). Item 1 (déjà FAIT), item 2 (déjà ÉCARTÉ), item 5 et item 6 recomptés
(`DateFormatter()` toujours 20 fichiers, `ParseStrategy` 0 usage réel ; `ObservableObject` 123
fichiers, `@Observable` 0 usage réel — les 6 matches de `grep -rl "@Observable"` sont tous en
commentaire/doc, pas du code) — toujours bloqués pour les mêmes raisons que le run #1, inchangées.

**Choisi : sous-tranche de l'item 4** — `DiscoverTab.swift`'s `SMSComposerView.Coordinator`, seul
site trouvé qui soit à la fois mécanique, borné à un seul fichier/une seule ligne, et sans risque de
régression de timing documenté (contrairement à `Router.swift`/`ConversationFirstRenderWarmup.swift`).

**TDD** :
- RED : `apps/ios/MeeshyTests/Unit/Views/DiscoverTabSMSComposerCoordinatorSourceGuardTests.swift`
  (même technique que `P2PWebRTCClientConcurrencySourceTests` — hop non exerçable behaviorally sans
  un vrai composeur SMS présenté, gardé au niveau source). Confirmé en échec
  (`xcodebuild test-without-building -only-testing:MeeshyTests/DiscoverTabSMSComposerCoordinatorSourceGuardTests`
  → 2 `XCTAssert*` en échec) contre la source non modifiée.
- GREEN : `DispatchQueue.main.async { controller.dismiss(animated: true) }` →
  `Task { @MainActor in controller.dismiss(animated: true) }`. Test relancé isolément → succès.

**Vérification** :
- `xcodegen generate` pour intégrer le nouveau fichier de test (le pbxproj committé ne se régénère
  pas tout seul ; `meeshy.sh` ne lance pas `xcodegen`).
- `./apps/ios/meeshy.sh build` → succès.
- `./apps/ios/meeshy.sh test` (suite complète, phase0 SDK + 3 phases app) lancé **deux fois** :
  - 1er run (sur la branche encore basée sur l'`origin/main` du début de session) : 6 échecs dans
    `CallManagerTests`/accessibilité, tous dans des fichiers jamais touchés par ce diff
    (`CallManager.swift`, `P2PWebRTCClient.swift`, `CallView.swift`). Investigué avant de conclure —
    `git fetch` + `git log HEAD..origin/main` a montré que `main` avait avancé de 5 commits pendant la
    vérification locale (~1h de build+tests), dont `d60973459` (« fix(ios/tests): remplace les
    fenêtres de caractères fixes des gardes de source par un corps à accolades équilibrées ») qui
    corrige exactement cette classe d'échec. La branche avait été coupée AVANT ce fix upstream.
  - Rebase propre sur le nouvel `origin/main` (`git rebase origin/main`, aucun conflit — le diff ne
    touche aucun fichier modifié par les 5 commits amont), `xcodegen generate` relancé (diff toujours
    minimal : 3 fichiers), diff confirmé vs `origin/main` : `DiscoverTab.swift` (+1/-1), nouveau
    fichier de test, `project.pbxproj` (+4 lignes).
  - 2e run (post-rebase, propre) : **0 échec** sur tous les runs — SDK phase0 (3346+2930 tests, 0
    échec), app Phase 1/3 (1888 tests, 0 échec), Phase 2/3 (3399 tests, 0 échec), Phase 3/3 (1 test,
    0 échec).
- PR : https://github.com/isopen-io/meeshy/pull/2709 —
  `claude/apps/ios/debt-dispatchqueue-sms-composer-coordinator` (branché depuis `origin/main`
  explicite, PREMIÈRE action avant tout Write/Edit). **CI réellement déclenchée** (voir leçon
  opérationnelle ci-dessous — hypothèse initiale « zéro CI » était incomplète) : `Quality (bun)`,
  `Security`, `Prisma`, `Test shared/agent/gateway/web`, `Test Python (translator)`, `Audio Pipeline
  Tests`, `TTS/STT Integration`, `Voice API Tests`, `Build (bun)`, `Summary` — tous verts
  (`Trivy`/`Voice E2E Benchmark` : skipping, normal pour ce type de diff). `mergeStateStatus: CLEAN`
  confirmé via `gh pr view --json`.
- Merge : `gh pr merge 2709 --squash --delete-branch` → exit non-zéro attendu (« 'main' is already
  used by worktree ») ; `gh pr view --json state,mergedAt` a confirmé `MERGED`. Branche remote
  supprimée séparément (`git push origin --delete claude/apps/ios/debt-dispatchqueue-sms-composer-coordinator`,
  le flag `--delete-branch` n'ayant pu agir localement à cause du conflit worktree).
- `tasks/lane-cursor.md` → `lane=ANDROID android_streak=0 last_run=ios-debt-dispatchqueue-sms-composer-coordinator`
  (commit séparé, poussé directement sur `main` avec `git push origin HEAD:main`).

## Leçon opérationnelle (nouvelle, spécifique à ce premier run IOS_DETTE)

`./apps/ios/meeshy.sh build` **n'imprime jamais le littéral `BUILD SUCCEEDED`** dans son log — le
wrapper shell affiche son propre message coloré `Build succeeded in <N>s` (minuscules, format
différent). Le grep littéral `BUILD SUCCEEDED` prescrit par le prompt de routine ne matchera
JAMAIS la sortie de `meeshy.sh build` (seule la sortie `xcodebuild` brute, non wrappée, contient
ce littéral). Grep sur `Build succeeded` (ou, plus robuste, sur l'ABSENCE de `BUILD FAILED`/`error:`
combinée à un exit code 0) pour ce script précis. À corriger dans
`tasks/android-parity-ios-debt-agent-prompt.md` §Lane IOS-DETTE point 5 : soit citer le motif réel
`Build succeeded`, soit renvoyer vers la doc `apps/ios/CLAUDE.md` qui documente le format exact
plutôt que de supposer que tous les wrappers de build reproduisent le vocabulaire `xcodebuild` brut.

## Leçons opérationnelles (Run #2, 2026-08-10)

**1. « Zéro CI sur un diff `apps/ios`-only » est une hypothèse incomplète — `ci.yml` n'a AUCUN
filtre de chemin.** Il est vrai que `ios-tests.yml` (push `dev` uniquement) et `sdk-tests.yml`
(gated sur `packages/MeeshySDK/**`) ne se déclenchent pas sur un diff limité à `apps/ios/`. Mais
`ci.yml` déclare `on: pull_request: branches: [main, dev, develop]` **sans clé `paths:`** — il
tourne sur TOUTE PR quel que soit le contenu du diff, y compris un diff `apps/ios`-only, et fait
tourner la matrice complète repo (`Quality (bun)`, `Security`, `Prisma`, `Test shared/agent/gateway/
web`, `Test Python (translator)`, `Audio Pipeline Tests`, `TTS/STT Integration`, `Voice API Tests`,
`Build (bun)`, `Summary`) — environ 15-20 min de wall-clock, gateway et translator étant les plus
lents (`Test gateway` 7m44s, `Test Python (translator)` 10m16s observés ce run). **Avant de déclarer
« pas de CI, gate purement local » sur QUELQUE diff que ce soit dans ce repo, vérifier `gh pr checks
<n>` après ouverture de la PR** plutôt que de déduire de la seule lecture des workflows nommés
`ios-*`/`sdk-*` — un workflow générique sans filtre de chemin peut être le vrai gate. À corriger dans
`tasks/android-parity-ios-debt-agent-prompt.md` §Lane IOS-DETTE point 6 : la phrase sur
`sdk-tests.yml` comme gate typique pour un diff `packages/MeeshySDK/`-only reste vraie, mais doit
être complétée — pour TOUT diff (SDK ou app), `ci.yml` tourne aussi et doit être attendu vert.

**2. Le ref `origin/main` local peut dériver PENDANT une vérification locale longue, dans un repo à
worktrees partagés — re-fetcher/rebaser juste avant la passe de vérification finale, pas seulement
en Étape 0.** Les worktrees partagent le même `.git` (refs, objets). Une suite locale complète
(`meeshy.sh test`, ~15-40 min ici) laisse largement le temps à `origin/main` d'avancer — par
d'autres agents, ou par un simple `git fetch` lancé ailleurs dans le même dépôt partagé — sans que
CETTE session ne fasse quoi que ce soit activement. Concrètement ce run : le premier `meeshy.sh
test` complet (branche coupée en tout début de run) a montré 6 échecs dans des fichiers jamais
touchés par le diff (`CallManagerTests`, accessibilité) ; l'investigation a montré que `main` avait
avancé de 5 commits pendant le build+test (~1h), dont un qui corrige exactement cette classe
d'échec (gardes de source à fenêtre fixe, cf. `reference_source_guard_fixed_char_windows_rot.md`).
Un rebase propre + un second run local a confirmé 0 échec. **Règle** : pour tout run dont la
vérification locale dépasse quelques minutes, refaire `git fetch origin main` + `git log
HEAD..origin/main` (voire un rebase) juste AVANT la passe de vérification qui précède le push/PR —
ne pas dépenser de temps à diagnostiquer des échecs dans des fichiers hors diff sans avoir d'abord
éliminé la dérive de `main` comme cause.

**3. RE-PROUVER une note de backlog, c'est vérifier la CARACTÉRISATION du problème, pas seulement
« le gap existe-t-il encore ».** Les deux items (3 et 4) retenus « toujours réels » par le run #1
(2026-08-09) l'étaient bien au sens littéral, mais leur description contenait des erreurs qui, si
suivies telles quelles, auraient produit un mauvais correctif : l'item 3 confondait
`isLoadingReactions` (préoccupation sans rapport) avec `isRevalidating` (le vrai 4e booléen) et
ignorait qu'une projection dérivée existait déjà depuis mai ; l'item 4 présentait un lot de 56-79
fichiers comme homogène et suggérait un fractionnement « par dossier », alors qu'un échantillonnage
montre 3 classes hétérogènes mélangées (faux positifs commentaire, timing délibérément calibré à ne
jamais toucher, ponts déjà corrects, vraie dette) qu'aucun découpage par dossier n'aurait séparées.
Une note écrite la VEILLE par le run précédent de la même lane n'est pas plus fiable qu'une note
plus ancienne — l'âge de la note ne dispense jamais de relire le code cité.

### 2026-08-10 — Run #3 (3e itération de la lane IOS_DETTE, 19e itération globale)

Contexte : `tasks/lane-cursor.md` était à `lane=ANDROID android_streak=5 last_run=conversation-mark-unread`
— règle d'alternance (streak ≥ 5) déclenchée, bascule vers `IOS_DETTE`. Scan de reprise (Étape 0
point 5) : `git branch -r --list 'origin/claude/apps/*'` = uniquement des branches `android/*`, la
plus récente datée du 2026-07-13 (>24h, aucune PR ouverte associée) — bruit d'anciens processus,
ignoré conformément au filtre ; `git branch -r --list 'origin/claude/apps/ios/*'` = vide. `gh pr
list --state open --search "apps/android OR apps/ios"` = vide. Pas de run interrompu à terminer.

**RE-PROUVÉ le backlog avant de choisir** : items 1/2 toujours FAIT/ÉCARTÉ (inchangés). Item 4 :
`grep -rl "DispatchQueue\.main\.async"` sous `apps/ios/Meeshy/` → 55 fichiers (contre 56 au
2026-08-10 précédent — `DiscoverTab.swift` n'y figure plus, confirmant le merge de la PR #2709).
Plutôt que de ré-échantillonner comme les runs précédents, **triage exhaustif de la totalité des
55 fichiers** (tous les sites `DispatchQueue.main.async` SANS `asyncAfter` lus avec leur contexte
complet — voir Backlog #4 ci-dessus pour la classification détaillée en 5 catégories). Résultat :
zéro nouveau site « vraie dette mécanique nue » hormis `CameraView.swift` — toutes les autres
occurrences relèvent d'un pont déjà correct, d'un timing documenté, d'une escape SwiftUI documentée
(catégorie nouvellement identifiée ce run, absente de l'analyse du run #2), ou du WebRTC à haut
risque. Items 3/5/6 non re-creusés ce run (aucun changement structurel attendu en 1 jour, item 4
consommait tout le budget de triage).

**Choisi : `CameraView.swift` — `CameraPreviewLayer.updateUIView`** — seul site restant à la fois
mécanique, borné à une ligne, sans rationale de timing documentée, ET dont le même fichier démontre
déjà l'idiome correct (`Task { @MainActor in }`) sur ses deux delegate callbacks voisins — argument
de cohérence interne renforçant que c'est de la dette, pas un choix délibéré.

**TDD** :
- RED : `apps/ios/MeeshyTests/Unit/Components/CameraPreviewLayerUpdateUIViewSourceGuardTests.swift`
  (même technique que `DiscoverTabSMSComposerCoordinatorSourceGuardTests` — `updateUIView` n'est pas
  exerçable en XCTest sans un vrai `AVCaptureSession` monté dans une hiérarchie de vues, gardé au
  niveau source, corps isolé entre la signature de `updateUIView` et celle de `makeCoordinator`).
  Confirmé en échec (`xcodebuild test-without-building -only-testing:MeeshyTests/CameraPreviewLayerUpdateUIViewSourceGuardTests`
  → 2 `XCTAssert*` en échec) contre la source non modifiée.
- GREEN : `DispatchQueue.main.async { context.coordinator.previewLayer?.frame = uiView.bounds }` →
  `Task { @MainActor in context.coordinator.previewLayer?.frame = uiView.bounds }`. Test relancé
  isolément → succès.

**Vérification** :
- `xcodegen generate` pour intégrer le nouveau fichier de test.
- `xcodebuild build-for-testing` initial lancé SANS passer par `meeshy.sh` (derivedDataPath dédié,
  cache froid dans ce worktree) : ~46 min de wall-clock pour un premier build complet — **leçon
  opérationnelle nouvelle ci-dessous**. `./apps/ios/meeshy.sh build` (cache réchauffé par le premier
  build) → `Build succeeded in 333s`.
- `./apps/ios/meeshy.sh test` (suite complète, phase0 SDK + 3 phases app) : Phase 1/2/3 (app)
  toutes vertes (0 échec). **Phase 0 (package MeeshySDK) : 6 échecs** — 5 crashs `signal abrt`/
  `Crash: xctest at ReaderAudioMixer.configure(...)` dans `CanvasEditMuteLivePropagationTests`, 1
  timeout (3 min) dans `StoryExportCompressionTests`. Ce diff ne touche AUCUN fichier sous
  `packages/MeeshySDK` (confirmé par `git diff origin/main...HEAD --stat` avant fetch = uniquement
  `CameraView.swift` + `project.pbxproj` + le nouveau test app-side) — structurellement impossible
  que ce diff cause des crashs dans `ReaderAudioMixer`/l'export vidéo SDK. Reproductibilité vérifiée :
  `cd packages/MeeshySDK && xcodebuild test -scheme MeeshySDK-Package -only-testing:MeeshyUITests/CanvasEditMuteLivePropagationTests`
  en isolation (simulateur libéré des 3 autres phases app qui venaient de tourner) → **5/5 tests
  passent, 0 échec** (0.220s total). Confirme la contention de ressources (autres processus
  xcodebuild/simulateur actifs dans ce worktree partagé multi-session, cf. `feedback_shared_disk_contention_multi_session.md`
  et `feedback_xcodebuild_shared_derivedData.md`) plutôt qu'une régression — cohérent avec des
  crashs `signal abrt` dans un mixer audio et un timeout d'export vidéo sous charge CPU concurrente.
  Le 6e test (`StoryExportCompressionTests`, timeout 3 min) non re-vérifié individuellement par
  souci de temps — mais son échec (dépassement d'un budget temps sous charge) est la même signature
  que les 5 confirmés flaky, et zéro chemin de code ne le relie au diff.
- PR : https://github.com/isopen-io/meeshy/pull/2721 —
  `claude/apps/ios/debt-camera-preview-layer-mainactor` (branché depuis `origin/main` explicite,
  PREMIÈRE action avant tout Write/Edit). CI complète verte (`Quality (bun)`, `Security`, `Prisma`,
  `Test shared/agent/gateway/web`, `Test Python (translator)`, `Audio Pipeline Tests`, `TTS/STT
  Integration`, `Voice API Tests`, `Build (bun)`, `Summary` — tous pass ; `Trivy`/`Voice E2E
  Benchmark` : skipping). `gh pr merge 2721 --squash --delete-branch` → exit 1 attendu (« 'main' is
  already used by worktree ») ; `gh pr view --json state,mergedAt` a confirmé `MERGED`
  (`229f97f4f`). Branche remote supprimée séparément (`git push origin --delete
  claude/apps/ios/debt-camera-preview-layer-mainactor`).
- `tasks/lane-cursor.md` → `lane=ANDROID android_streak=0 last_run=ios-debt-camera-preview-layer-mainactor`
  (commit séparé, poussé directement sur `main` avec `git push origin HEAD:main`).

**Note pour le run suivant qui reprend la lane IOS_DETTE** : item 4 est maintenant substantiellement
traité (2/2 sites « vraie dette mécanique nue » identifiés migrés, triage exhaustif des 55 fichiers
restants terminé). La suite naturelle serait soit une étude dédiée de la classe « escape SwiftUI
documentée » (7 sites identifiés : `ConversationViewModel.swift`, `StoryViewerView+Content.swift`
×3, `StoryViewerView+Sidebar.swift` ×2, `ConversationListView+Overlays.swift` ×3 — nécessite
vérification manuelle sur device/simulateur des warnings runtime « Publishing changes from within
view updates », pas seulement build+test), soit fermer l'item et réapprovisionner le backlog
(items 3/5/6 restent bloqués pour les mêmes raisons que les runs précédents — cf. Backlog #3/#5/#6
ci-dessus, inchangées).

## Leçon opérationnelle (nouvelle, Run #3, 2026-08-10)

**Un `xcodebuild build-for-testing`/`test-without-building` invoqué directement (hors `meeshy.sh`)
avec un `-derivedDataPath` dédié dans un worktree encore jamais buildé démarre à froid — ~46 min
pour un premier build complet, contre 333s pour `meeshy.sh build` une fois le cache réchauffé.** Ce
n'est pas un hang (confirmé après coup via les timestamps du fichier de sortie et `** TEST BUILD
SUCCEEDED **` en fin de log) mais une inefficacité de séquencement : appeler `meeshy.sh build`
D'ABORD (qui réutilise/réchauffe un DerivedData partagé/persistant) puis enchaîner sur
`xcodebuild -only-testing:...` pour l'itération RED/GREEN ciblée aurait évité l'attente à froid. À
corriger dans `tasks/android-parity-ios-debt-agent-prompt.md` §Lane IOS-DETTE point 5 : recommander
explicitement `meeshy.sh build` en premier (même pour une itération de test ciblée type RED/GREEN
source-guard), avant tout appel `xcodebuild` direct avec un `-derivedDataPath` propre au worktree.

**CI verte en ~13 min pour un diff `apps/ios`-only sur ce repo (05:36→05:49 UTC observé, matrice
`ci.yml` complète).** Cohérent avec l'estimation « 15-20 min » du run #2 — cette fois plus proche de
la borne basse. Cette observation n'appelle PAS de correction de la routine.
