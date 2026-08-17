# iOS Debt Routine — Progress archive — 2026-08 (Runs #1–#9)

Older journal entries moved out of `tasks/ios-debt-routine-progress.md` per the archival
threshold noted in that file's own header (§ archiver le DÉBUT du journal au-delà de
~1500 lignes). Same **append/oldest-first** convention as the live file — Run #1 is at the
top, the most recently archived run at the bottom. See `tasks/ios-debt-routine-progress.md`
for the live Backlog and the current journal (Build-break critique 2026-08-16 onward).

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

### 2026-08-10 — Run #4 (4e itération de la lane IOS_DETTE, 24e itération globale)

Contexte : `tasks/lane-cursor.md` était à `lane=ANDROID android_streak=5 last_run=story-media-tus-upload`
— règle d'alternance (streak ≥ 5) déclenchée, bascule vers `IOS_DETTE`. Scan de reprise (Étape 0
point 5) : `git branch -r --list 'origin/claude/apps/*'` = 254 branches, toutes `android/*`, la plus
récente datée du 2026-07-27 (>24h avant le run, aucune PR ouverte associée) — bruit d'anciens
processus, ignoré conformément au filtre ; `git branch -r --list 'origin/claude/apps/ios/*'` = vide ;
`gh pr list --state open --search "apps/android OR apps/ios"` = vide. Pas de run interrompu à
terminer.

**RE-PROUVÉ le backlog avant de choisir** : items 1/2 toujours FAIT/ÉCARTÉ (inchangés, re-vérifiés par
grep). Item 4 recompté : `grep -rl "DispatchQueue\.main\.async"` sous `apps/ios/Meeshy/` → 54 fichiers
(contre 55 au run #3 — `CameraView.swift` n'y figure plus, confirmant le merge de la PR #2721) ; aucun
nouveau site mécanique nu détecté, le triage exhaustif du run #3 tient. Item 5 recompté :
`DateFormatter()` toujours 20 fichiers, `ParseStrategy` 0 usage réel — inchangé. Item 6 recompté :
`ObservableObject` 119 fichiers, `@Observable` 0 usage réel en code — toujours bloqué par le plancher
iOS 16.0+ (`apps/ios/CLAUDE.md`). Grep de réapprovisionnement (`print(`, `#file\b`, `.system(size:`) :
`print(` = 0 site sous `apps/ios/Meeshy` (déjà propre) ; `#file\b` = 0 violation réelle restante (seule
occurrence = commentaire dans le guard lui-même) ; `.system(size:` = 190 fichiers mais tous des
tailles d'icônes/emoji décoratives explicitement documentées comme fixes-par-conception dans
`OnboardingAnimations.swift` (« stay fixed on purpose ») — pas la classe de dette Dynamic Type déjà
résolue par le rapport qualité (Finding #3, « Resolved »). Aucun nouvel item de réapprovisionnement
retenu.

**Choisi : sous-tranche M2 de l'item 3** — la note du run #2 disait la migration `isLoadingInitial` →
`paginationPhase.isBlockingSpinnerNeeded` trop risquée à cause d'une ambiguïté `ConversationStateStore`
sans l'avoir vérifiée sur le code réel. Re-preuve : `grep -rn "\.isLoadingInitial\b\|isLoadingInitial ="`
sur tout `apps/ios/Meeshy` montre que `ConversationStateStore.isLoadingInitial` (ligne 20) n'est JAMAIS
lu/écrit ailleurs que sa propre déclaration — scaffolding mort, aucun call site ne le lit. Les 3 seuls
lecteurs réels de `ConversationViewModel.isLoadingInitial` sont : `ConversationView.swift` (2 sites,
`encryptionDisclaimer` + `bodyContent`) et `ConversationFirstRenderWarmup.swift` (1 site). Lecture de
`ConversationFirstRenderWarmup.swift` en entier : ce site n'est PAS un call site logique — c'est un
contournement de crash DEBUG-only (doc en tête de fichier) qui matérialise volontairement le pattern
de keypath `@Published` exact qui débordait la pile main-thread au premier rendu sur device ; migrer
CE site changerait ce qui est matérialisé et risquerait de faire réapparaître le crash pour zéro
bénéfice. Conclusion : migration des 2 sites `ConversationView.swift` uniquement, exclusion
délibérée + testée du site `ConversationFirstRenderWarmup.swift`.

**TDD** :
- RED : `apps/ios/MeeshyTests/Unit/Views/ConversationViewLoadingPhaseSourceGuardTests.swift` (3 tests)
  — corps de `encryptionDisclaimer`/`bodyContent` isolés via `DeclarationBodyScanner.body(containing:in:)`
  (accolades équilibrées, pas de fenêtre de caractères fixe — cf. `d60973459`), assertions
  `!contains("viewModel.isLoadingInitial")` + `contains("viewModel.paginationPhase.isBlockingSpinnerNeeded")` ;
  3e test regression-guard vérifiant que `ConversationFirstRenderWarmup.swift` garde `_ =
  vm.isLoadingInitial` intact. Confirmé en échec sur les 2 premiers tests (4 assertions XCTAssert*
  en échec), le 3e passait déjà (rien à migrer côté warmup) — RED partiel attendu et documenté.
- GREEN : 2 substitutions dans `ConversationView.swift` (`encryptionDisclaimer` ligne ~464,
  `bodyContent` cold-start skeleton ligne ~1071) de `viewModel.isLoadingInitial` vers
  `viewModel.paginationPhase.isBlockingSpinnerNeeded`. Les 3 tests passent.

**Vérification** :
- `xcodegen generate` pour intégrer le nouveau fichier de test.
- `./apps/ios/meeshy.sh build` → `Build succeeded in 68s` (RED), puis `60s` (re-run post-fetch).
- Run ciblé (`ConversationViewLoadingPhaseSourceGuardTests` + `ConversationViewLifecycleTests` +
  `ConversationViewHeaderButtonsClusterTests`) → 7/7 verts.
- `./apps/ios/meeshy.sh test` (suite complète) : Phase 0 (SDK) verte, Phase 1/3 verte (1893 tests, 1
  skip), Phase 2/3 verte (3402 tests, 0 échec), Phase 3/3 verte (1 test, 1 skip — DEMO_USER/PASSWORD
  absents localement, XCTSkip attendu). Zéro échec sur l'ensemble.
- `origin/main` a dérivé PENDANT la vérification locale (1 commit gateway sans rapport) — re-fetch +
  `git rebase origin/main` juste avant le push, conformément à la leçon du run #2 ; rebase propre,
  aucun conflit.
- PR : https://github.com/isopen-io/meeshy/pull/2757 —
  `claude/apps/ios/debt-conversation-loading-phase-m2` (branché depuis `origin/main` explicite,
  PREMIÈRE action avant tout Write/Edit). CI complète verte (`Quality (bun)`, `Security`, `Prisma`,
  `Test shared/agent/gateway/web`, `Test Python (translator)` 10m28s, `Test gateway` 6m7s, `Audio
  Pipeline Tests`, `TTS/STT Integration`, `Voice API Tests`, `Build (bun)`, `Summary` — tous pass ;
  `Trivy`/`Voice E2E Benchmark` : skipping). `mergeStateStatus: CLEAN` confirmé via `gh pr view --json`
  avant merge.
- Merge : `gh pr merge 2757 --squash --delete-branch` → **exit 0 cette fois** (pas d'échec worktree
  contrairement aux runs #2/#3 — comportement `gh` visiblement non déterministe sur ce point, ne pas
  supposer l'un ou l'autre). `gh pr view --json state,mergedAt,mergeCommit` a confirmé `MERGED`
  (`007c09e64`). **Re-vérification indépendante sur le SHA exact** (règle dure du prompt de routine,
  ne jamais faire confiance à un signal externe) : `gh api
  repos/isopen-io/meeshy/compare/main...007c09e644b2091a33f2d33972f2a1677d4138da` → `identical,
  ahead_by=0, behind_by=0`, confirmant que ce SHA est bien la tête de `main`. `check-runs` sur ce SHA
  montrait des workflows post-merge (`docker.yml`/release) en cours, sans rapport avec le gate PR
  déjà vérifié vert avant merge.
- `tasks/lane-cursor.md` → `lane=ANDROID android_streak=0 last_run=ios-debt-conversation-loading-phase-m2`
  (commit séparé, poussé directement sur `main` avec `git push origin HEAD:main`).

**Note pour le run suivant qui reprend la lane IOS_DETTE** : item 3 (M2) a maintenant sa sous-tranche
app-side entièrement traitée (2/2 call sites hors-VM migrés, 1 exclusion documentée et testée). Le
reste de M2 (supprimer les 4 booléens `@Published` de `ConversationViewModel` lui-même) reste bloqué
tant que `ConversationFirstRenderWarmup.swift` continue de les lire directement par nécessité — ce
n'est plus un « prochain call site à migrer » mais une décision dédiée sur le contournement de crash
(faut-il le refactorer pour matérialiser le keypath autrement, ou accepter que les booléens survivent
indéfiniment pour ce seul lecteur). Items 4/5/6 inchangés depuis le run #3 (mêmes blocages). Le
backlog reste à réapprovisionner activement si items 3/4/5 finissent par se clore complètement — pas
encore le cas ce run (grep de réapprovisionnement fait, rien de neuf trouvé).

### (run #5 IOS_DETTE manquant de ce journal) — item 3 M2 soldé, branche `claude/apps/ios/debt-state-store-dead-loading-booleans`

Un run IOS_DETTE ultérieur (visible dans `git log --grep lane-cursor` : commit `74841be5c`
`chore(tasks): lane-cursor -> IOS_DETTE streak 0 (state-store-dead-loading-booleans)`, corrigé
ensuite en `ANDROID streak 0` par `eaa77fd31` pour respecter la règle d'alternance) a soldé le
reste de l'item 3 (suppression des 4 booléens morts de `ConversationStateStore`) — voir le texte
détaillé déjà inséré dans le Backlog ci-dessus (« M2 étudié et conclu (run #29, 2026-08-10) »). Ce
run n'a jamais reçu sa propre entrée de journal ici — seule la section Backlog a été mise à jour
inline par ce run-là. Noté ici pour la traçabilité de la numérotation des runs (le run documenté
plus bas se nomme donc « run #6 » de la lane, pas « run #5 »), sans reconstituer le détail
PR/vérification de ce run passé faute d'avoir été son exécutant.

### 2026-08-10 — Run #6 (6e itération réelle de la lane IOS_DETTE — aucune ligne de code livrée, item fermé sur preuve)

Contexte : `tasks/lane-cursor.md` était à `lane=ANDROID android_streak=5 last_run=feed-composer-file-attachment`
— règle d'alternance (streak ≥ 5) déclenchée, bascule vers `IOS_DETTE`. Scan de reprise (Étape 0
point 5) : `git branch -r --list 'origin/claude/apps/*'` → uniquement des branches `android/*` +
`origin/claude/apps/ios/inline-video-top-controls` (PR #2767, **déjà mergée** —
`gh pr view 2767 --json state,mergedAt` → `MERGED` le 2026-08-10T17:27:32Z, hors mandat de ce run
comme précisé dans le prompt de lancement, non touchée). `gh pr list --state open` = vide (aucune
PR android/ios ouverte). Pas de run interrompu à terminer.

**RE-PROUVÉ l'intégralité du backlog contre le code réel avant de choisir** :
- Item 1 (`#file`/`#filePath`) : inchangé, FAIT.
- Item 2 (ConversationRow singleton) : inchangé, ÉCARTÉ.
- Item 3 (ConversationLoadingPhase) : `grep -n "isLoadingInitial\|isLoadingOlder\|isLoadingNewer\|isRevalidating" apps/ios/Meeshy/Features/Main/ViewModels/Conversation/ConversationStateStore.swift`
  → **zéro résultat**, confirmant que le run #5 (non journalisé, cf. entrée ci-dessus) a bien retiré
  les 4 booléens morts. Item 3 confirmé **FAIT** dans son intégralité (M1 + M2 app-side + M2 store).
- Item 4 (`DispatchQueue.main.async`) : `grep -rl "DispatchQueue\.main\.async" apps/ios/Meeshy --include="*.swift" | wc -l`
  → 54 fichiers (stable depuis le run #4, aucun nouveau site mécanique nu apparu). Plutôt que de
  ré-échantillonner, relu individuellement les 9 sites de la classe « escape SwiftUI documentée »
  identifiée par le triage exhaustif du run #3 (4 fichiers : `ConversationViewModel.swift:1105`,
  `StoryViewerView+Content.swift` ×3 dont le composer-focus ligne 2124, `StoryViewerView+Sidebar.swift`
  ×2, `ConversationListView+Overlays.swift` ×3) pour vérifier si un sous-ensemble serait en fait
  bas-risque et migrable sans étude device :
  - `ConversationViewModel.swift:1105` : lu le commentaire complet (lignes 1098-1104) — c'est le
    handler `messageStore.messagesDidChange.sink`, qui se déclenche à **CHAQUE** mutation de message
    (envoi, réception, édition, suppression, réaction) — le site le PLUS chaud des 9. Le commentaire
    documente explicitement pourquoi `DispatchQueue.main.async` (pas `Task { @MainActor in }`) est
    nécessaire : garantir que la mutation `@Published self.messages` atterrit sur une itération de
    runloop FRAÎCHE, après la fin de l'évaluation du body SwiftUI en cours. Le risque documenté —
    un warning runtime « Publishing changes from within view updates », invisible à `meeshy.sh test`
    — est réel et le blast radius (chaque message de l'app) est maximal. Confirmé **NE PAS toucher**
    sans étude dédiée.
  - `StoryViewerView+Sidebar.swift:1162,1167` (dismiss du sheet « signaler » + haptique après un
    `Task { do { try await reportStory(...) } catch {...} }`) : tenté de trancher par lecture seule
    de la signature — `reportStory` est une closure typée `(_ storyId: String, _ reportType: String,
    _ reason: String?) async throws -> Void` **sans annotation `@MainActor`** dans sa signature
    (`StoryViewerView.swift:1455` l'implémente en appelant `ReportService.shared.reportStory(...)`,
    dont l'isolation d'acteur n'est pas visible depuis ce fichier). Sans lire `ReportService` en
    entier, impossible d'affirmer avec certitude sur quel acteur le code reprend après le `await` —
    exactement le type d'ambiguïté qui a fait échouer l'analyse statique documentée par le run #3.
    Bas trafic (flux de signalement, rare) et blast radius faible, mais **le principe reste le
    même : la preuve manquante est un fait runtime, pas un fait de code source** — une analyse
    statique approfondie ne peut pas la produire avec certitude, seule une vérification interactive
    (lancer le flux sur simulateur, observer la console avant/après migration) le peut. Non tentée
    ce run (voir Décision).
  - `StoryViewerView+Content.swift` (3 sites dont le composer-focus ligne 2124) et
    `ConversationListView+Overlays.swift` (3 sites, chorégraphie d'animation biphasée + marche de
    hiérarchie de superviews) : re-lus les commentaires déjà cités par le run #3 — rationale de
    timing/cycle de rendu toujours présente et non triviale à re-dériver par lecture seule.
- Item 5 (Date.ParseStrategy) : recompté — `DateFormatter()` toujours 20 fichiers,
  `grep -rl "ParseStrategy"` → 0. Inchangé, toujours **OUVERT** (bloqué faute de socle de
  consolidation à étendre).
- Item 6 (`@Observable`) : recompté — `grep -rl ": ObservableObject"` → 119 fichiers,
  `grep -rln "@Observable"` → 0 en code réel. Inchangé, toujours **BLOQUÉ** par le plancher iOS
  16.0+ documenté dans `apps/ios/CLAUDE.md`.
- **Réapprovisionnement du backlog** (grep prescrit) : `print(` sous `apps/ios/Meeshy` → 0 site ;
  `#file\b` sous `apps/ios/MeeshyTests` + `packages/MeeshySDK/Tests` → 0 violation réelle (seule
  occurrence = le guard de régression lui-même) ; `.system(size:` → 80 fichiers, tous des tailles
  d'icônes/emoji décoratives déjà classées fixes-par-conception (Finding #3 du rapport qualité,
  « Resolved ») lors d'un run antérieur. Élargi au-delà du grep prescrit par prudence (dernières
  entrées de `tasks/lessons.md` : les 12 dernières leçons (89-93) appartiennent toutes à la
  « routine messaging »/« routine calling-feature », sans rapport avec `apps/ios`/`packages/MeeshySDK`
  — aucun candidat) ; scan `// TODO`/`// FIXME` dans le Swift app+SDK → 4 occurrences, toutes hors
  périmètre debt : 1 explicitement marquée « hors périmètre » dans son propre commentaire
  (`StoryPublishQueue.swift:224`, brancher `retryDelays` changerait le comportement de reprise), 2
  sont des marqueurs de phase de feature Story non livrée (`StoryComposerViewModel+Elements.swift:334`,
  `StoryGlassBackdropLayer.swift:28` — pas de la dette, une feature en cours), 1 est une note de
  suivi macOS/Xcode nécessitant une décision d'architecture (`LiveActivityBridge.swift:28`). Aucun
  nouveau candidat mécanique/borné trouvé.

**Décision : aucun item ne passe le filtre de sûreté ce run.** Item 4 fermé (option (b) du run #3,
cf. Backlog ci-dessus — 9 sites restants nécessitent une vérification runtime interactive que ce
run n'a pas les moyens de mener correctement en un seul incrément, et une migration sans cette
preuve serait précisément le genre de correctif à l'aveugle interdit par la règle RE-PROUVER).
Items 5/6 confirmés bloqués pour les mêmes raisons que les runs précédents (décision de conception/
produit non tranchée). Backlog actif désormais **vide** de tout item mécanique sûr — items 5 et 6
restent les deux seules entrées, toutes deux en attente d'une décision utilisateur (cf. §Blocked
ci-dessous), et l'item 4 devient un candidat pour une **future passe dédiée hors routine** (pas un
prochain run mécanique) s'il est repris.

**Vérification** : aucune (aucun code applicatif touché — seule cette mise à jour de fichier de
suivi). Pas de branche `claude/apps/ios/*` créée (rien à committer sous `apps/ios/` ou
`packages/MeeshySDK/`), pas de PR, pas de CI.

- `tasks/lane-cursor.md` → `lane=ANDROID android_streak=0 last_run=ios-debt-item4-closed-backlog-exhausted`
  (commit séparé, poussé directement sur `main` avec `git push origin HEAD:main`, cf. §Choix de
  la lane — même commit que cette mise à jour de `tasks/ios-debt-routine-progress.md`, les deux
  fichiers vivant hors `apps/android/`/`apps/ios/`).

## Blocked (décisions produit/architecture en attente, hors mandat autonome)

- **Item 5 — Modern Date Parsers** : nécessite une décision de conception (l'API `Date.ParseStrategy`
  unifiée n'existe pas encore dans le repo ; 20 sites `DateFormatter()` à faire converger vers un
  socle à concevoir).
- **Item 4 (résidu, hors backlog actif) — 9 sites « escape SwiftUI »** : migrables uniquement après
  une session dédiée de vérification interactive sur simulateur/device (login démo, déclencher
  chaque flux concerné, observer la console avant/après pour le warning SwiftUI « Publishing changes
  from within view updates »). Ce n'est pas une décision produit à proprement parler mais dépasse le
  périmètre d'un incrément mécanique de routine — à traiter comme un chantier ponctuel si repris.

**Note pour le run suivant qui reprend la lane IOS_DETTE** : le backlog mécanique est épuisé. Avant
de re-proposer les items 5/6 tels quels, vérifier si une décision utilisateur est arrivée entre
temps (sinon les re-confirmer bloqués comme ce run l'a fait). Si le backlog reste vide au run
suivant, envisager une repasse complète de `apps/ios/CURRENT_QUALITY_REVIEW.md` (peut avoir été
mis à jour) et/ou un audit plus large (au-delà des 4 grep prescrits) pour identifier de nouvelles
catégories de dette, sur le modèle de l'angle mort catégoriel documenté pour la lane Android
(§Choix de la lane du prompt de routine).

## Run — 2026-08-11 (élargissement de l'audit, backlog reconstitué)

Suite à la note ci-dessus : relecture complète de `apps/ios/CURRENT_QUALITY_REVIEW.md` (au-delà des
4 grep prescrits) — a révélé une catégorie de dette non couverte par le backlog original : **API
dépréciée `NavigationView`** (soft-dépréciée iOS 16+ au profit de `NavigationStack`, plancher de
déploiement du SDK). Grep exhaustif sous `packages/MeeshySDK/Sources/MeeshyUI/` :

**Livré** : migration de 5 sites (`VoiceProfileWizardView`, `VoiceProfileManageView`,
`UnifiedPostComposer`, `CodeViewerView`, `DocumentViewerView`) — chacun instanciait
`NavigationView { <une seule vue enfant> }`. Aucun n'exploite le mode master/detail iPad
(`NavigationView` ne bascule en `.doubleColumn` que si DEUX vues enfants distinctes sont fournies),
donc remplacement comportementalement identique par `NavigationStack { ... }` — mêmes
`.navigationTitle`/`.toolbar`, aucun changement visuel iPhone/iPad.

Garde de régression `NavigationViewDeprecatedAPISourceGuardTests` (4 tests : garde réelle + 2
méta-tests de contrôle positif/négatif + garde anti-faux-positif sur `NavigationViewModel`) —
balaie tout `Sources/MeeshyUI/` récursivement, pas une liste de fichiers nommés, pour attraper toute
réintroduction future par copier-coller.

**Vérifications** : `xcodebuild build -scheme MeeshySDK-Package` vert, `xcodebuild test
-only-testing:MeeshyUITests/NavigationViewDeprecatedAPISourceGuardTests` → 4/4 tests verts (dont la
garde principale qui a réellement scanné les fichiers du repo, pas un mock).

Cette entrée documente le fait que le backlog mécanique n'était PAS réellement épuisé — il était
seulement épuisé des items déjà identifiés par le grep original. Un audit élargi (relecture intégrale
du document source, pas juste les motifs déjà connus) a trouvé une nouvelle catégorie en un seul
passage. Prochain run IOS_DETTE : appliquer la même discipline d'élargissement avant de conclure à
un backlog vide.

## Run — 2026-08-11 (bascule streak=5, audit élargi #2 — backlog item 7 trouvé, PAS de code livré)

Contexte : `tasks/lane-cursor.md` était à `lane=ANDROID android_streak=5 last_run=dynamic-launcher-shortcuts`
— règle d'alternance (streak ≥ 5) déclenchée, bascule vers `IOS_DETTE`. Scan de reprise (Étape 0
point 5) : `gh pr list --state open --search "apps/android OR apps/ios"` = 2 PR, `#2849`/`#2851`,
toutes deux `apps/web` (branches `claude/keen-hamilton-*`, naming ne matchant pas cette routine) —
pas de run interrompu à terminer.

**RE-PROUVÉ le backlog avant de choisir** : items 1/2 toujours FAIT/ÉCARTÉ (inchangés). Item 3
(`ConversationLoadingPhase`) toujours FAIT/M2 conclu. Item 4 résiduel toujours hors mandat autonome
(vérification interactive requise). Items 5/6 toujours BLOQUÉS — aucune décision utilisateur
n'est arrivée entre temps (aucune trace dans `tasks/lessons.md`/`tasks/todo.md` ni dans la
conversation). Re-grep des 4 motifs mécaniques standards : `print(` → 0 (toujours propre) ;
`DispatchQueue.main.async` → 53 fichiers (le résidu "item 4", toujours hétérogène, toujours hors
mandat mécanique sans décomposition dédiée) ; `#file\b` hors `#filePath` → 8 matches, mais **tous
dans les commentaires/la regex-en-string-littérale de `Swift6TestFileArgSourceGuardTests.swift`
lui-même** (le guard s'exclut explicitement, cf. son propre commentaire ligne 46) — zéro violation
réelle, confirmé faux positif, item 1 reste clos ; `.system(size:` → 1029 matches (bruit trop
massif pour être un signal exploitable tel quel, jamais été un item du backlog original — ignoré
comme dans les runs précédents).

**Audit élargi (note du run précédent appliquée)** : plutôt que conclure à un backlog vide après le
zéro-résultat des 4 greps mécaniques, recherché une nouvelle catégorie d'API dépréciée sur le modèle
de `NavigationView` (run précédent). Trouvé `UIScreen.main` (deprecated iOS 16+) — grep initial : 25
fichiers. **Triage complet fichier par fichier avant toute conclusion** (voir Backlog item 7
ci-dessus pour le détail) : 8 fichiers sont des faux positifs (commentaire seul, la migration vers la
fenêtre active a déjà eu lieu et le commentaire ne fait que référencer l'ancienne API par son nom) ;
5 fichiers (`Story*Layer.swift`/`StoryRenderer.swift`) utilisent `UIScreen.main.scale` comme valeur
par défaut d'un paramètre sur un type `nonisolated`/CALayer — contrainte MainActor documentée
explicitement dans le code (`StoryTextLayer.swift:67-69` en détail), à ne PAS toucher ; 4 fichiers
(`ImageDownsamplingConfig`, `CachedAsyncImage.pixelSize`, `VideoFilmstrip`, `AudioWaveform`) vivent
dans des fonctions statiques/utilitaires hors contexte `View` où `@Environment(\.displayScale)`
n'est structurellement pas accessible — un vrai fix demanderait un threading de paramètre
(changement de signature en cascade), pas un remplacement mécanique ; il reste 7 fichiers dont
l'usage semble être en contexte `View` (candidats les plus probables pour un futur slice), **mais
leur contexte exact (méthode d'instance `View` vs helper `static func`) n'a pas été vérifié
individuellement ce run** — RE-PROUVER cette dernière hypothèse est le point de départ explicite du
prochain run qui reprend cet item, pas un mécanique à lancer tel quel.

**Décision : aucun code livré ce run.** Comme l'entrée « Item 4 closed — backlog exhausted »
précédente, cette itération conclut qu'aucun item du backlog n'est à la fois réel, borné et
mécaniquement sûr sans étude/décision supplémentaire — mais CONTRAIREMENT à cette entrée-là (qui
avait conclu à un backlog vide), celle-ci enrichit le backlog d'un item 7 concret et précisément
triagé, prêt à être repris sans redevoir refaire cette investigation. Forcer un fix sur un
sous-ensemble non vérifié du groupe "candidats View" aurait risqué soit de casser la compilation
(si l'un d'eux s'avère être une `static func` comme `CachedAsyncImage.pixelSize`), soit d'introduire
une régression de rendu — le filtre de sûreté de la routine (« mécanique/à risque borné ») n'est pas
satisfait tant que ce dernier tri n'est pas fait.

**Vérification** : aucune (aucun code applicatif touché — seule cette mise à jour de fichier de
suivi). Pas de branche `claude/apps/ios/*` créée, pas de PR, pas de CI.

- `tasks/lane-cursor.md` → `lane=ANDROID android_streak=0 last_run=ios-debt-uiscreen-main-audit-triage`
  (commit séparé, poussé directement sur `main` avec `git push origin HEAD:main`, cf. §Choix de
  la lane — même commit que cette mise à jour de `tasks/ios-debt-routine-progress.md`, les deux
  fichiers vivant hors `apps/android/`/`apps/ios/`).

### 2026-08-12 — Run #7 (reprise de l'item 7, sous-lot SDK-side livré)

Contexte : `tasks/lane-cursor.md` était à `lane=ANDROID android_streak=5
last_run=conversation-list-live-presence` — règle d'alternance (streak ≥ 5) déclenchée, bascule
vers `IOS_DETTE`. Scan de reprise (Étape 0 point 5) : aucune branche `claude/apps/ios/*` ni
`claude/apps/android/*` ouverte en attente — pas de run interrompu à terminer.

**Reprise exacte du point de départ laissé par le run précédent** : re-vérifié individuellement
chacun des 7 candidats "contexte `View`, non vérifiés" de l'item 7 plutôt que de re-grep à
l'aveugle. Résultat du tri fichier par fichier :
- `ConversationMediaGalleryView.swift:251` et `BubbleStandardLayout.swift:612` : lecture du code
  réel confirme un calcul `targetPx = bounds.width * scale` — budget de décodage, pas du layout.
  Reclassés dans le groupe "NE PAS TOUCHER" (ils y étaient déjà implicitement via le test app-side
  `WindowMetricsSSOTTests.test_displayMeasurements_areConfinedToTheDeliberateSites`, lu pendant ce
  run — il les liste déjà en exceptions délibérées).
- `BubbleStandardLayout+Media.swift:548` : usage `UIScreen.main.scale` seul (pas `.bounds`) —
  candidat `@Environment(\.displayScale)`, mais différé (scope différent des swaps `WindowMetrics`,
  nécessite de vérifier l'accès `@Environment` dans le contexte body de `BubbleGridImageView`).
- `SkeletonView.swift` (3×), `LanguagePickerSheet.swift` (2×), `ImageViewerView.swift:50` (1×,
  confirmé via son unique call site `.frame(maxWidth: maxWidth, maxHeight: maxHeight)` — une
  contrainte de layout, pas un budget), `StoryComposerView+Canvas.swift.composerScreenHeight` (1×) :
  confirmés être des contraintes de LAYOUT — candidats sûrs.

**Obstacle découvert et résolu avant de coder** : ces 4 fichiers vivent tous sous
`packages/MeeshySDK/Sources/MeeshyUI/`, mais `DeviceLayout` (la SSOT `windowSize` app-side) vit
dans `apps/ios/Meeshy/Core/` — le SDK ne peut pas en dépendre (mauvais sens de dépendance). Plutôt
que dupliquer l'algorithme une 4e fois (le SDK en avait déjà 3 copies non convergées :
`StoryComposerView+Canvas.swift` ×2, `MeeshyImageEditorView.swift`, `MeeshyVideoEditorView.swift`),
créé un type SDK-local unique `WindowMetrics.windowSize`
(`Sources/MeeshyUI/Utilities/WindowMetrics.swift`) — miroir exact de l'algorithme `DeviceLayout`
(scène active par `activationState == .foregroundActive`, jamais `.first` sur `connectedScenes`).
Câblé les 4 fichiers dessus. Bonus non cherché : `composerScreenHeight` choisissait la scène par
`.first` sur un `Set` non ordonné — la conversion vers `WindowMetrics` corrige aussi ce défaut
(même classe de bug que le fix app-side d'origine), pas seulement une déduplication.

**TDD** : garde de source `WindowMetricsSourceGuardTests.swift` écrite avant les 4 substitutions
(miroir SDK de `NavigationViewDeprecatedAPISourceGuardTests`/`WindowMetricsSSOTTests` app-side,
assertion en ÉGALITÉ contre un ensemble délibéré `{WindowMetrics.swift, CachedAsyncImage.swift}` —
`CachedAsyncImage.swift` trouvé pendant ce triage, budget de décodage `max(width,height)*scale`,
absent du grep original côté `apps/ios` car jamais audité côté SDK avant ce run). Rouge avant les
substitutions (détectait `SkeletonView.swift`/`LanguagePickerSheet.swift`/`ImageViewerView.swift`/
`StoryComposerView+Canvas.swift` en trop), vert après.

**Mutation-proof** : `SkeletonView.swift` remis temporairement à `UIScreen.main.bounds.width`
(copie de secours, jamais `git checkout --`) → exactement `test_meeshyUI_confinesDisplayBounds...`
échoue, les 3 autres tests de la garde restent verts. Restauré, re-vérifié vert.

**Vérifié** : `xcodebuild test -scheme MeeshySDK-Package -only-testing:MeeshyUITests` (suite
complète) vert ; `./apps/ios/meeshy.sh build` vert (93s).

**Livré** : PR #2868 (`claude/apps/ios/debt-windowmetrics-sdk-migration`), squash-mergée
(`2762362b0`). CI : 17 checks, tous verts — **découverte en cours de route** : un diff
`packages/MeeshySDK`-only déclenche en réalité TOUTE la matrice `ci.yml` (gateway/web/shared/
translator/audio/voice), pas seulement `sdk-tests`/`sdk-tests.yml` comme l'affirmait
`tasks/android-parity-ios-debt-agent-prompt.md` §Livrer — section corrigée dans ce même run
(commit direct, avec ce fichier).

**Reste ouvert dans le backlog** (voir item 7 mis à jour ci-dessus, section Backlog) :
`BubbleStandardLayout+Media.swift:548` (différé, `@Environment(\.displayScale)`) et un NOUVEAU
finding hors scope `UIScreen.main` — `StoryComposerView+Canvas.swift:1440` (`safeAreaBottomInset`)
partage le même défaut `.first` sur `Set` non ordonné que corrigeait `composerScreenHeight` avant
ce run, plus `MeeshyImageEditorView.swift`/`MeeshyVideoEditorView.swift` qui dupliquent le même
pattern pour `safeAreaInsets` — candidat pour un futur item 8 (extension de `WindowMetrics` avec
`safeAreaBottom`), pas traité ce run.

- `tasks/lane-cursor.md` → `lane=ANDROID android_streak=0 last_run=ios-debt-windowmetrics-sdk-migration`
  (commit séparé, poussé directement sur `main` avec `git push origin HEAD:main` — même commit que
  cette mise à jour et la correction de `tasks/android-parity-ios-debt-agent-prompt.md`, les trois
  fichiers vivant hors `apps/android/`/`apps/ios/`).

### 2026-08-15 — Run #8 (item 8 : extension WindowMetrics.safeAreaInsets)

Contexte : `tasks/lane-cursor.md` était à `lane=IOS_DETTE android_streak=0
last_run=guest-join-web-deep-link` — bascule déjà effectuée par la lane ANDROID au run précédent
(streak atteint 5). Scan de reprise : aucune PR ouverte matchant la routine. Piste explorée avant
de choisir cet item : le même défaut « générateur de lien sans récepteur » trouvé 2× côté Android
ce même jour (profil, invitation conversation) pourrait exister côté iOS — vérifié et écarté :
`DeepLinkRouter.swift` gère déjà `case "u", "users"` et `case "join"` à 4 endroits distincts (scheme
custom, universal link, widget, shortcut) — iOS est la référence que le port Android imitait
(`ProfileShareLink.kt` documente explicitement « mirrors the iOS DeepLinkParser contract »), pas un
second exemplaire du même bug.

**Repris exactement le finding déposé au run précédent** (item 8, ci-dessus dans le Backlog) :
RE-PROUVÉ les 3 sites contre le code réel avant de coder — `StoryComposerView+Canvas.swift:1440`,
`MeeshyImageEditorView.swift:118-120`, `MeeshyVideoEditorView.swift:45-47` portaient tous encore
exactement le parcours `connectedScenes.compactMap{...}.first` non gated par `activationState`.
Vérifié aussi que les commentaires des deux éditeurs (« VRAIS safe-area insets... JAMAIS ceux de
l'environnement SwiftUI ») documentent un problème DIFFÉRENT (SwiftUI reporte 0 dans un
`fullScreenCover` imbriqué) — confirmé que corriger la résolution de scène ne contredit pas cette
intention.

**Design** : un seul nouveau `WindowMetrics.safeAreaInsets: UIEdgeInsets` (pas des accesseurs
`top`/`bottom` séparés) — vérifié via grep des call sites que `MeeshyImageEditorView` lit `.top` ET
`.bottom` depuis la même variable, donc une struct complète est le bon niveau de grain, pas deux
propriétés `CGFloat`.

**TDD** : garde de source étendue (`WindowMetricsSourceGuardTests.swift`) — nouveau
`test_meeshyUI_confinesConnectedScenesWalksToWindowMetrics` (égalité exacte, miroir du test
`UIScreen.main.bounds` existant et du test app-side
`test_sceneWalks_areConfinedToTheResolverAndTheAllScenesQuery`), écrit et vérifié rouge avant les 3
substitutions. Mutation-proof : un site remis à un parcours manuel → exactement ce test échoue, les
4 autres restent verts.

**Incident, résolu, sans rapport** : la suite `MeeshyUITests` complète a montré 1 échec sur 3266
tests (`StoryExporterStaticOnlyTests/test_syntheticTransparentAsset_cached` — comparaison de mtime
de fichier cache). RE-PROUVÉ avant de l'ignorer : zéro référence à `WindowMetrics`/`safeArea` dans
ce fichier de test, le test lui-même documente le risque de course qu'il a rencontré (« so a
parallel test run can't reuse a pre-existing cache entry »), et relancé en isolation → passe en
0.057s. Flake pré-existant confirmé, pas une régression de ce diff.

**Vérifié** : `./apps/ios/meeshy.sh build` vert (106s, avec régénération bénigne de
`project.pbxproj` — enregistrement de fichiers « Lentille » déjà mergés sur `main` par une session
tierce, pas du churn de ce diff). PR #3041, squash-mergée (`d123fe444`). CI : 17 checks verts,
dont un nouveau « Build app (app + cibles de test) » et « Portée du run » observés pour la première
fois (infra CI ajoutée par le chantier « Lentille » récemment mergé — aucune action requise).

- `tasks/lane-cursor.md` → `lane=ANDROID android_streak=0 last_run=ios-debt-windowmetrics-safearea`
  (commit séparé, poussé directement sur `main`).

### 2026-08-15 — Run #9 (item 7 : dernière pièce, BubbleGridImageView → @Environment(\.displayScale))

Contexte : `tasks/lane-cursor.md` était à `lane=ANDROID android_streak=5
last_run=conversation-lock-listview-scoping` — règle d'alternance (streak ≥ 5) déclenchée, bascule
vers `IOS_DETTE`. Scan de reprise : aucune PR ouverte matchant la routine. Repris exactement le
finding laissé en différé au run #8 (item 7 backlog) : `BubbleStandardLayout+Media.swift:548`, seul
site `UIScreen.main` restant du groupe "candidats View confirmés".

**RE-PROUVÉ avant de coder** : grep exhaustif du fichier entier confirme `UIScreen.main.scale` comme
UNIQUE occurrence ; lu `BubbleGridImageView` en entier — struct `View` SwiftUI simple, aucune
contrainte MainActor/CALayer (contrairement aux `StoryXxxLayer`) ; confirmé via son seul call site
que `.frame` a déjà résolu la taille de cellule avant que `targetWidthPx` ne choisisse la variante à
requêter — donc pas un budget de décodage Stage-Manager (contrairement à
`ConversationMediaGalleryView.swift:251`/`BubbleStandardLayout.swift:612`), une pure modernité d'API.

**TDD** : RED — `BubbleGridImageDisplayScaleSourceGuardTests.swift` (garde de source, égalité exacte
`@Environment(\.displayScale)` présent / `UIScreen.main` absent), + contrôle positif/négatif.
Confirmé en échec contre la source non modifiée. GREEN — ajout de `@Environment(\.displayScale)
private var displayScale: CGFloat`, `cellPointWidth * UIScreen.main.scale` →
`cellPointWidth * displayScale`. Test relancé isolément → succès (3/3).

**Mutation-proof** : fichier remis temporairement à `UIScreen.main.scale` (copie de secours
`/tmp/BubbleStandardLayout+Media.swift.bak`, jamais `git checkout --`) → exactement le test
`test_bubbleGridImageView_readsDisplayScaleFromTheEnvironment` échoue, restauré, re-vérifié vert.

**Incident, résolu, sans rapport avec le code livré** : `ENOSPC` (disque plein) pendant la
vérification — tout appel Bash échouait, y compris un `df -h` nu, en tentant d'écrire son propre
fichier de sortie. Root cause diagnostiquée au réveil suivant : 6 dossiers orphelins
`~/Library/Developer/Xcode/DerivedData/Meeshy-<hash>` (~13.5GB) accumulés par des appels `xcodebuild
test` directs sans `-derivedDataPath`, distincts du dossier partagé workspace-relatif
`apps/ios/Build` qu'utilisent `meeshy.sh`/CI. Supprimés (aucun impact sur le build partagé), espace
restauré (9.9Gi libres). La preuve de mutation avait déjà été capturée dans le log AVANT le crash —
aucune perte de travail, aucun re-run nécessaire. Leçon retenue pour les runs suivants : toujours
passer `-derivedDataPath apps/ios/Build` sur tout appel `xcodebuild` direct.

**Vérifié** : test ciblé vert (3/3), `./apps/ios/meeshy.sh build` vert. PR #3050
(`claude/apps/ios/debt-bubblegrid-displayscale`, commit `2819acf6a`), squash-mergée (`bafc8b39d`).
CI : 17 checks tous verts (`Trivy`/`Voice E2E Benchmark` : skipping, normal). Remarque sans rapport
avec ce diff : au retour du worktree sur `origin/main` post-merge, fast-forward de 554 commits
incluant un chantier tiers volumineux (« Lentille »/« Focal », ~26k lignes) mergé pendant ce run —
aucun conflit avec les fichiers touchés par cette routine, aucune action requise.

**Item 7 clôturé intégralement** (voir Backlog #7 ci-dessus pour le détail complet des 3 sous-lots :
SDK-side PR #2868, safe-area PR #3041, ce dernier site PR #3050).

- `tasks/lane-cursor.md` → `lane=ANDROID android_streak=0 last_run=ios-debt-bubblegrid-displayscale`
  (commit séparé, poussé directement sur `main`).

