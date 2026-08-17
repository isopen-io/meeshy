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
3. **[FAIT — M2 conclu 2026-08-10 (run #29 de la routine dual-lane)]**
   UI State Aggregation — unifier les booléens de chargement de `ConversationViewModel` en un enum
   `ConversationLoadingPhase`. La note d'origine était **partiellement fausse**, pas seulement
   reportable telle quelle : le groupe des 4 booléens de pagination est
   `isLoadingInitial`/`isLoadingOlder`/`isLoadingNewer`/**`isRevalidating`** (PAS `isLoadingReactions`,
   qui est une préoccupation sans rapport — le chargement du sheet de détail des réactions — la note
   d'origine confondait les deux). Surtout : **M1 est déjà livré**, depuis longtemps —
   `ConversationLoadingPhase.swift` (enum + `derive()`) existe depuis le commit `f734bc731`
   (2026-05-21, « refactor(ios/conv): add ConversationLoadingPhase enum (additive) »), bien avant le
   bootstrap de ce backlog le 2026-08-09 ; `ConversationViewModel.paginationPhase` en est déjà la
   projection canonique. Le run bootstrap avait grep les booléens (qui existent toujours, à raison)
   sans remarquer que la projection dérivée existait déjà et documentait elle-même le travail restant
   (« M2 follow-up to PR #280 »).
   **Livré (run #4, 2026-08-10)** : les 2 call sites hors-VM identifiés au 2026-08-10 dans
   `ConversationView.swift` (`encryptionDisclaimer`, `bodyContent` cold-start skeleton) migrés de
   `viewModel.isLoadingInitial` vers `viewModel.paginationPhase.isBlockingSpinnerNeeded` — équivalence
   provable, `paginationPhase` et `isLoadingInitial` vivent sur la MÊME instance `ConversationViewModel`
   pour ces deux sites précis (aucune ambiguïté `ConversationStateStore`, vérifié par grep exhaustif de
   `\.isLoadingInitial\b` avant de choisir ce slice — les seuls autres lecteurs sont le VM lui-même et
   `ConversationFirstRenderWarmup.swift`). PR #2757, mergé (`007c09e64`).
   **Exclusion délibérée, NE PAS toucher sans étude dédiée** : `ConversationFirstRenderWarmup.swift`'s
   `_ = vm.isLoadingInitial` n'est PAS un call site logique — c'est un contournement de crash DEBUG-only
   qui matérialise le pattern de keypath `@Published` exact qui débordait la pile main-thread (voir
   doc du fichier). Le migrer vers `paginationPhase` changerait l'émission matérialisée et risquerait
   de faire réapparaître ce crash pour zéro bénéfice utilisateur. Un test de garde
   (`test_conversationFirstRenderWarmup_keepsReadingRawBoolean_untouchedByThisMigration`) documente
   cette exclusion pour qu'une future passe « complète la migration » ne l'emporte pas mécaniquement.
   Reste (M2, non tenté) : la **DEUXIÈME copie non synchronisée explicitement** des mêmes 4 booléens
   dans `ConversationStateStore.swift` (scaffolding de découpage du god-object, cf.
   `apps/ios/tasks/ios-simplification-passes-2026-06-24.md`) — la sémantique exacte de mirroring entre
   les deux n'a toujours pas été étudiée. Supprimer les 4 booléens de `ConversationViewModel` reste
   bloqué tant que `ConversationFirstRenderWarmup.swift` continue de les lire directement (choix
   délibéré ci-dessus) — donc M2 ne peut jamais atteindre un état « 0 lecteur brut restant » sans une
   décision dédiée sur le contournement de crash lui-même.
   **M2 étudié et conclu (run #29, 2026-08-10)** : la sémantique de mirroring de la copie
   `ConversationStateStore` s'avère triviale — **ce n'est PAS un mirroring, c'est du scaffolding
   mort**. Grep exhaustif de `\bisLoadingInitial\b`/`\bisLoadingOlder\b`/`\bisLoadingNewer\b`/
   `\bisRevalidating\b` sous `apps/ios` + `packages/MeeshySDK` (hors le test lui-même) : les 4
   propriétés déclarées sur `ConversationStateStore` (lignes 20-23 avant suppression) n'étaient
   lues/écrites NULLE PART via une valeur typée `ConversationStateStore` — le store n'est jamais
   référencé que comme `state`/`stateStore`, tous deux grep-propres. Les seules occurrences vivantes
   restent les copies `@Published` de `ConversationViewModel` (lignes 142-149), intactes. Supprimées :
   4 lignes mortes + garde de régression `ConversationStateStoreDeadLoadingBooleansSourceGuardTests`
   (empêche leur réintroduction ET protège `ConversationViewModel`/`isLoadingReactions` contre un
   balayage trop large). Le blocage documenté ci-dessus (`ConversationFirstRenderWarmup.swift`) ne
   concernait que la copie VIVANTE sur `ConversationViewModel`, jamais cette copie morte sur le store —
   les deux M2 sont donc indépendants, pas séquentiels comme la note précédente le laissait supposer.
   Branche `claude/apps/ios/debt-state-store-dead-loading-booleans`.
4. **[FERMÉ — substantiellement traité, run #6 IOS_DETTE 2026-08-10 (cf. journal ci-dessous) — retiré
   du backlog actif]** Swift Concurrency Migration — `DispatchQueue.main.async` restants →
   `@MainActor`/async-await structuré.
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
   **Décision (run #6, 2026-08-10)** : option (b) retenue — voir journal ci-dessous pour l'analyse
   complète des 9 sites restants (4 fichiers) qui a confirmé, site par site (pas par bloc), qu'aucun
   n'est vérifiable par le seul triplet build+test local ; option (a) nécessiterait une session de
   navigation interactive simulateur dédiée (login démo, ouvrir une conversation ET déclencher le
   flux « signaler une story » ET le focus composer story ET l'animation de la liste de
   conversations), hors périmètre d'un incrément de routine unique. Item retiré du backlog actif ;
   les 9 sites restent en l'état, candidats à une future passe dédiée (hors routine), pas à un
   prochain run mécanique.
5. **[OUVERT — trop large / prérequis manquant]** Modern Date Parsers — consolider vers
   `Date.ParseStrategy` avec repli. Au 2026-08-09 : **20 fichiers** utilisent `DateFormatter()`
   directement (`apps/ios/Meeshy` + `packages/MeeshySDK/Sources`), et **0 usage** de
   `Date.ParseStrategy` existe dans le repo — donc pas de couche de consolidation existante à
   étendre, il faudrait d'abord concevoir l'API unifiée (le rapport suppose une consolidation
   "layers" qui n'existe pas encore). Reporté : nécessite une décision de conception avant tout
   fix mécanique.
6. **[FERMÉ — décision utilisateur 2026-08-11 : « on reste à iOS 16 »]** Observation Macro —
   `ObservableObject` → macro `@Observable`. **118 classes** `ObservableObject` au 2026-08-09,
   **0** migrées vers `@Observable`. `@Observable` (framework Observation) nécessite
   **iOS 17+/macOS 14+** ; `apps/ios/CLAUDE.md` fixe le plancher de déploiement à **iOS 16.0+**
   (`MeeshyWidgets` seule extension à iOS 17+). Les deux options qui bloquaient l'item étaient
   (a) relever le plancher à iOS 17, ou (b) accepter un split d'implémentation
   `ObservableObject`/`@Observable` par version d'OS (double maintenance dans les ViewModels
   partagés). **Tranché explicitement** : le plancher reste iOS 16.0+ (option a écartée) ; le
   split par-OS-version (option b) n'a pas été demandé et ajouterait de la complexité de
   maintenance sans bénéfice utilisateur clair — en cohérence avec le principe « Simplicity
   First » de `CLAUDE.md` racine, cet item est donc **fermé, pas seulement reporté** : aucune
   migration `@Observable` ne sera tentée tant que le plancher de déploiement n'est pas
   explicitement relevé à iOS 17+ dans une décision future et séparée. Retiré du backlog actif —
   ne plus re-proposer sans qu'une nouvelle décision utilisateur relève le plancher.

7. **[FAIT — clos 2026-08-15, dernière pièce PR #3050, `bafc8b39d`]**
   `UIScreen.main` deprecated (iOS 16+, remplaçant : `@Environment(\.displayScale)` pour
   `.scale` en contexte View, la fenêtre active pour `.bounds`). **25 fichiers matchent le grep,
   mais l'écrasante majorité N'EST PAS un vrai gap** — triage complet effectué avant de conclure
   quoi que ce soit (ne PAS re-grep sans lire ce triage) :
   - **Faux positifs (commentaires seuls, zéro usage réel)** : `StatusBubbleOverlay.swift`,
     `RecentMediaStrip.swift`, `StoryViewerView.swift`, `StoryViewerView+Content.swift`,
     `ConversationListView.swift`, `CallManager.swift`, `StoryBackdropCapture.swift`,
     `StoryAVCompositor.swift` — ces fichiers ONT DÉJÀ migré vers la fenêtre active et laissent un
     commentaire expliquant pourquoi ils évitent `UIScreen.main` ; le nom de l'API apparaît dans
     le commentaire, jamais dans du code exécuté.
   - **Contrainte MainActor/CALayer délibérée et documentée — NE PAS TOUCHER** :
     `StoryMediaLayer.swift`, `StoryRenderer.swift`, `StoryLocationLayer.swift`,
     `StoryTextLayer.swift`, `StoryStickerLayer.swift` — toutes utilisent `UIScreen.main.scale`
     comme **valeur par défaut d'un paramètre** sur un type `nonisolated`/CALayer, précisément
     parce qu'un défaut de paramètre ne peut ni être `async` ni lire un `@Environment` (accessible
     seulement depuis une `View`/`ViewModifier`). `StoryTextLayer.swift:67-69` documente la
     contrainte exacte en détail. Aller contre cette conception casserait la compilation ou
     réintroduirait le bug de concurrence que le design évite — cf. `NOTES.md`/mémoire projet sur
     la fragilité connue du canvas story (grappe `index_swiftui_ui.md`).
   - **Usage réel en contexte NON-View (fonction statique / utilitaire hors body)** — nécessite un
     **threading de paramètre** (changement de signature, pas un remplacement mécanique) :
     `ImageDownsamplingConfig.maxPixelSize(for:)` (`enum` public, appelé potentiellement hors
     contexte `View` par le pipeline `DiskCacheStore`), `CachedAsyncImage.pixelSize(for:)`
     (`@MainActor private static func` — `@MainActor` ne donne PAS accès à `@Environment`, qui
     exige une `View`/`ViewModifier` réelle), `VideoFilmstrip.swift` (utilitaire
     `AVAssetImageGenerator`, hors `View`), `AudioWaveform.swift` (traitement de waveform hors
     `View`).
   - **Vérifiés ce run et confirmés budget de décodage — NE PAS TOUCHER (même famille que la
     contrainte MainActor/CALayer ci-dessus, raisonnement différent)** :
     `ConversationMediaGalleryView.swift:251` et `Bubble/BubbleStandardLayout.swift:612`
     (`targetPx = bounds.width * scale`, budget max de pixels à décoder — sur-décoder est invisible,
     sous-décoder ne l'est pas, et la fenêtre peut grandir jusqu'à l'écran sous Stage Manager après
     le choix de la variante ; commentaire explicite ligne 612 de `BubbleStandardLayout.swift`) ;
     `packages/MeeshySDK/Sources/MeeshyUI/Primitives/CachedAsyncImage.swift:377`
     (`max(width, height) * scale`, même raisonnement, trouvé pendant le triage SDK de ce run —
     n'était pas dans le grep original côté `apps/ios`).
   - **[LIVRÉ 2026-08-12, PR #2868]** Sous-ensemble SDK-side confirmé être des contraintes de
     LAYOUT (pas des budgets de décodage — `.frame(maxWidth:/maxHeight:)` ou largeur de skeleton,
     jamais un calcul de pixels cible) : `packages/MeeshySDK/Sources/MeeshyUI/Primitives/
     SkeletonView.swift` (3 occurrences), `LanguagePickerSheet.swift` (2 occurrences),
     `Media/ImageViewerView.swift:50` (confirmé via son seul call site,
     `.frame(maxWidth: maxWidth, maxHeight: maxHeight)` — pas un budget), `Story/
     StoryComposerView+Canvas.swift.composerScreenHeight` (déjà un repli `?? UIScreen.main.bounds
     .height`, converti en simple délégation à la SSOT). Le SDK ne pouvant pas dépendre de
     `DeviceLayout` (target app), nouveau type SDK-local `WindowMetrics.windowSize`
     (`Sources/MeeshyUI/Utilities/WindowMetrics.swift`) — même algorithme (scène active par
     `activationState`, jamais `.first` sur le `Set` non ordonné `connectedScenes`). Bonus :
     `composerScreenHeight` choisissait la scène par `.first` — la conversion corrige aussi ce
     défaut (même classe de bug que le fix app-side `DeviceLayout`), pas seulement un DRY. Garde de
     source dédiée `WindowMetricsSourceGuardTests.swift` (miroir SDK de `WindowMetricsSSOTTests`
     app-side), mutation-prouvée localement (un site remis à `UIScreen.main.bounds` → exactement ce
     test échoue). Vérifié : suite `MeeshyUITests` complète verte, `./apps/ios/meeshy.sh build`
     vert, CI PR #2868 verte (17 checks — cf. correction de doc au §Livrer de ce fichier prompt :
     un diff `packages/MeeshySDK`-only déclenche en réalité TOUTE la matrice `ci.yml`, pas
     seulement `sdk-tests`).
   - **[LIVRÉ 2026-08-15, PR #3050, `bafc8b39d`]** `Bubble/BubbleStandardLayout+Media.swift:548`
     (`BubbleGridImageView`, `targetWidthPx = Int((cellPointWidth * UIScreen.main.scale).rounded())`)
     — seul usage `UIScreen.main` restant dans le fichier (confirmé par grep exhaustif avant coder),
     `.scale` seul (pas `.bounds`), en contexte `View` réel (`BubbleGridImageView: View`, struct
     SwiftUI simple, pas de contrainte MainActor/CALayer comme les sites StoryXxxLayer). Différent
     du budget de décodage `ConversationMediaGalleryView.swift:251`/`BubbleStandardLayout.swift:612`
     (NE PAS TOUCHER, ci-dessus) : ici `.frame` a déjà résolu la taille de cellule au moment où
     `targetWidthPx` choisit seulement quelle variante pré-encodée demander — aucun compromis
     Stage-Manager sur/sous-décodage à préserver, c'est une pure modernité d'API. Remplacé par
     `@Environment(\.displayScale) private var displayScale: CGFloat` + `cellPointWidth *
     displayScale`. Garde de source dédiée
     `BubbleGridImageDisplayScaleSourceGuardTests.swift` (égalité exacte
     `@Environment(\.displayScale)` présent / `UIScreen.main` absent du fichier), avec contrôle
     positif (détecte le pattern banni) et contrôle négatif (accepte la forme corrigée, ignore les
     commentaires). Mutation-proof : fichier remis temporairement à `UIScreen.main.scale` (copie de
     secours `/tmp`, jamais `git checkout --`) → exactement ce test échoue, restauré, re-vérifié
     vert. Vérifié : test ciblé vert (3/3), `./apps/ios/meeshy.sh build` vert, CI PR #3050 — 17
     checks tous verts (`Trivy`/`Voice E2E Benchmark` : skipping, normal). Ce dernier candidat
     clôturait le groupe "candidats View confirmés" identifié aux runs précédents — **l'item 7 est
     maintenant intégralement FAIT** (SDK-side PR #2868 + safe-area PR #3041 + ce dernier site) :
     zéro usage `UIScreen.main` restant dans le repo qui ne soit pas un faux positif commentaire, une
     contrainte MainActor/CALayer délibérée, un budget de décodage vérifié, ou un usage hors-contexte
     `View` nécessitant un threading de paramètre (catégories toutes documentées ci-dessus,
     inchangées).
   **Incident opérationnel ce run, sans rapport avec le code livré** : disque plein (`ENOSPC`) en
   cours de vérification — root cause : 6 dossiers `~/Library/Developer/Xcode/DerivedData/
   Meeshy-<hash>` (~13.5GB) accumulés par des appels `xcodebuild test` directs sans
   `-derivedDataPath`, distincts du dossier partagé workspace-relatif `apps/ios/Build` utilisé par
   `meeshy.sh`/CI. Résolu par suppression des dossiers orphelins (libère l'espace, aucun impact sur
   le build partagé). Leçon retenue : toujours passer `-derivedDataPath apps/ios/Build` (ou
   équivalent) sur tout appel `xcodebuild` direct pour éviter la récidive — la preuve de mutation
   avait déjà été capturée dans le log AVANT l'incident, donc aucune perte de travail ni re-run
   nécessaire une fois l'espace disque restauré.

8. **[FAIT — 2026-08-15, PR #3041, `d123fe444`]** `StoryComposerView+Canvas.swift:1440`
   (`safeAreaBottomInset`), `MeeshyImageEditorView.swift:118-120` et
   `MeeshyVideoEditorView.swift:45-47` (`deviceSafeAreaInsets`) parcouraient chacun
   `UIApplication.shared.connectedScenes` à la main (`.compactMap { $0 as? UIWindowScene }.first`,
   PAS `activationState == .foregroundActive`) — même classe de bug que `windowSize` avant PR
   #2868, appliquée à `safeAreaInsets` au lieu de `bounds.size`. Nouveau
   `WindowMetrics.safeAreaInsets: UIEdgeInsets` (une seule propriété struct complète, pas des
   accesseurs `top`/`bottom` séparés — `MeeshyImageEditorView`/`MeeshyVideoEditorView` lisent les
   deux) remplace les 3 parcours. Les commentaires des deux éditeurs (« VRAIS safe-area insets de
   la fenêtre, JAMAIS ceux de l'environnement SwiftUI ») décrivent un problème différent, toujours
   valide, non touché par ce fix — seule la résolution de LA SCÈNE change. Garde de source dédiée
   (`test_meeshyUI_confinesConnectedScenesWalksToWindowMetrics`, égalité exacte), mutation-prouvée.
   Vérifié : suite `MeeshyUITests` 3252/3266 (1 flake pré-existant sans rapport,
   `StoryExporterStaticOnlyTests/test_syntheticTransparentAsset_cached`, reconfirmé vert en
   isolation), `./apps/ios/meeshy.sh build` vert, CI 17 checks verts (dont un nouveau
   « Build app (app + cibles de test) » observé pour la première fois, issu de l'infra Lentille
   récemment mergée — aucune action requise, juste un check supplémentaire).

Le backlog sera réapprovisionné (grep `print(`, `DispatchQueue.main.async`, `#file\b`,
`.system(size:` restants + dernières entrées de `tasks/lessons.md`) quand les items ouverts
restants (3, 4, 5, 7 — `BubbleStandardLayout+Media.swift:548` différé) auront été soit décomposés
en sous-slices exécutables, soit clos.

## Journal d'itération

> Runs #1–#9 (2026-08-09 → 2026-08-15) archived to
> `tasks/ios-debt-routine-progress-archive-2026-08.md` on 2026-08-17 (this file had grown
> past the ~1500-line threshold noted above). Journal continues below from the 2026-08-16
> build-break onward.

## 2026-08-16 — Build-break critique iOS (hors backlog numéroté) : `main` ne compilait plus

**Découverte, pas planifiée** : au démarrage de ce run (streak Android=5 → bascule IOS_DETTE), la
CI GitHub Actions « iOS » était rouge sur `main` (`bafc8b39d`, mon propre merge précédent) —
`error: cannot find type 'PresenceState' in scope` dans `LivingSummaryModels.swift`. Confirmé local
(`meeshy.sh build`) ET distant (log CI récupéré) avant d'investir l'effort — pas une supposition.
Root cause : le chantier tiers « Lentille/Focal » (~26k lignes, fast-forward mentionné dans
l'entrée précédente, « aucune action requise » à l'époque — le pbxproj n'avait simplement jamais
été régénéré après cet ajout de fichiers, donc jamais compilé nulle part avant cette CI).

**Priorisé au-dessus du slice initialement prévu** (migration onChange `MessageLanguageDetailView`,
mise de côté via `git stash -u`, candidat pour un futur run) — directive CLAUDE.md « Autonomous Bug
Fixing » : un build cassé bloque TOUTE la CI iOS, priorité absolue sur une dette cosmétique.

**Root cause dominante** : `SWIFT_DEFAULT_ACTOR_ISOLATION = MainActor` (réglage Swift 6 du target
app) isole implicitement tout type non explicitement `nonisolated` — le chantier Lentille/Focal
n'avait pas suivi ce patron déjà documenté (`ReadingModePreferenceStore.swift:40-47`). Marqué
`nonisolated` : `MessageDayLabel`, `BubbleContent`, `LentilleReadingModePreferenceCenter`,
`LentilleFocusCandidateRegistry`, `NullAgentAssistProvider` (+ `@unchecked Sendable`, requis pour
l'appel cross-actor dans `NullAssistProviderTests`). Plus ~6 bugs isolés sans rapport (ordre
d'argument, `await` manquant, `Self` en argument par défaut, qualification de membre statique,
`if` mutant dans un `@ViewBuilder`, signature de closure legacy) — voir commit `6190d5f80` pour le
détail exhaustif.

**Doublon partiel découvert en cours de route** : un autre agent avait déjà poussé sur `main`
(PR #3062, « drive-by iOS CI unblock ») le MÊME fix d'un seul fichier (`import MeeshySDK` dans
`LivingSummaryModels.swift`), en documentant explicitement les fichiers restants comme hors
périmètre de son propre run. Merge d'`origin/main` dans la branche de fix : zéro conflit (fix
identique, git l'a absorbé silencieusement). Leçon : même un « drive-by one-liner » mérite d'être
recherché sur `main` avant de dupliquer l'investigation complète — voir
`feedback_routine_prs_duplicate_same_fix.md`.

**3 bugs de test réels supplémentaires trouvés et corrigés**, jamais exécutés avant faute de build
vert :
1. `A11yLabelComposerTests.test_compose_receivedMessage_omitsDeliveryStatusSegment` — texte
   d'exemple `"Salut"` contient la sous-chaîne `"lu"`, faux-positif sur l'assertion `.contains("lu")`
   indépendamment du statut de livraison réel. Texte changé pour `"Bonjour"`.
2. `LentillePeekView.swift` — fallback redondant sur `conversation.lastMessagePreview` BRUT alors
   que `resolvedLastMessagePreview` y retombe déjà en interne ; faisait rougir
   `ConversationPreviewPrismSourceGuardTests` (garde mécanique sur tout lecteur brut non listé).
   Fallback supprimé (dead code), pas d'ajout à l'allowlist — le vrai fix, pas une exception.
3. `ConversationViewLoadingPhaseSourceGuardTests.test_bodyContent_coldStartSkeleton…` — le scan
   pleine-fonction (`DeclarationBodyScanner.body(containing: "private var bodyContent")`) attrapait
   un usage LÉGITIME et sans rapport de `viewModel.isLoadingInitial`, ajouté par WS-7
   (`hasReachedOldest`, détection de frontière de pagination) dans la MÊME `@ViewBuilder`. Assertion
   négative re-scopée au bloc `if` du skeleton lui-même (second appel à `DeclarationBodyScanner`
   avec un marqueur plus spécifique) — la garde teste maintenant exactement ce qu'elle prétend
   tester, sans dépendre de la position relative d'un code sans rapport dans le même fichier.

**Piège locale re-confirmé en conditions réelles** (déjà documenté,
`reference_simulator_locale_change_breaks_snapshot_baselines.md`) : le simulateur partagé
`30BFD3A6-…` tournait en anglais (défaut, aucun override `AppleLanguages`/`AppleLocale`). Basculé en
français pour faire disparaître ~16-20 échecs `MeeshyTests` asserant des littéraux français —
casse alors 70 `MeeshyUITests` (snapshots baselinés en anglais). Reverti à l'anglais (état
vérifié : 0 échec `MeeshyUITests`) ; les ~16-20 échecs français restent, pré-existants,
JAMAIS vus par CI avant (compile cassé), hors périmètre de ce fix — documentés ci-dessous comme
nouvel item de backlog plutôt que silencieusement ignorés.

**Nouveau backlog découvert** (pré-existant, jamais vu par CI avant ce run, PAS causé par ce fix) :
- `OfflineQueueTests.test_recoverLastUnsentPost_returnsMostRecentMatchingType` — flaky sur le
  singleton `OfflineQueue.shared` en suite complète (0 échec en isolation x1) ; root cause non
  élucidée (hypothèse : pollution d'état entre classes de test malgré `parallelizable = "NO"`,
  investigation à approfondir).
- ~16 `MeeshyTests` assertent des littéraux français contre `Bundle.main`/locale simulateur (ex.
  `LentilleSectionIdentityTests`, `test_riviere_reason_isComposedFromLiveThresholds…`) — nécessitent
  la migration vers le patron bundle-injectable déjà établi
  (`feedback_localized_string_assertions_depend_on_simulator_locale.md`, déjà appliqué à
  `SyncPillLabelsTests`/`PostStatAccessibilityTests` le 2026-07-26) pour devenir locale-agnostiques.
- `test_joinFlowErrorKeys_resolveInAll5Locales` — `joinFlow.error.linkNotFound` et
  `joinFlow.error.unknown` absentes de `Localizable.xcstrings` dans les 5 locales (échec
  locale-INDÉPENDANT, pas lié au réglage simulateur ci-dessus) — clés à ajouter au catalogue.

**Vérification** : `meeshy.sh build` vert, `xcodebuild build-for-testing` vert (2 runs, avant et
après merge d'`origin/main`), `meeshy.sh test` phase 2 (contenu) passée de 3 échecs → 0 échec après
les 3 fixes de test. Phases 0/1 : uniquement les échecs pré-existants documentés ci-dessus,
confirmés sans rapport (fichiers jamais touchés par ce fix, ou reproductibles indépendamment de la
locale).

**Poussé DIRECTEMENT sur `main`** (`2789200a8`), sans PR — instruction explicite de l'utilisateur
en cours de run : « commit au fur et à mesure exceptionnellement puis push sur main » pour que les
autres sessions actives bénéficient immédiatement du build réparé plutôt que de redécouvrir/re-
corriger le même problème en parallèle. CI GitHub Actions armée en observation post-push.

**CI post-push (job « Build app + tests unitaires », le job authentique — cf.
`reference_ios_release_andp_workflow_broken_local_fallback.md` sur Xcode Cloud qui ment) : 6564
tests, 6550 verts, 11 rouges.** 10 correspondent exactement aux items déjà documentés ci-dessus
(locale française × 7, RTL chevron, tri `topSenders`, `test_r15…` — voir juste en dessous). Le
11e était un **4e bug de test réel**, raté par mon propre scan local (mon script de surveillance
filtrait `XCTAssert.*failed` et cette suite échoue via `XCTFail` nu, sans préfixe `XCTAssert` —
angle mort de ma propre vérification, pas du hasard) :

- `FocalHostSourceGuardTests.test_r15_newComputationSections_carryNoLawLiteral` — cherchait ses
  deux bornes de section (`// MARK: - §4.5…` / `// MARK: - §4.7…`) DANS la source déjà passée par
  `AppSourceGuard.stripComments` — qui efface justement les commentaires de ligne, dont ces bornes
  font partie. Contradiction interne, échec garanti à 100 %, jamais vu vert. Reproduit en
  isolation locale (0.187s, déterministe, PAS un flake). Corrigé : bornes cherchées dans la source
  BRUTE, `stripComments` appliqué seulement à la tranche extraite entre les deux bornes — la garde
  vérifie enfin ce qu'elle prétend vérifier (aucun littéral de loi en dur dans les deux sections
  ajoutées par F-085). Commit séparé `c0c402117`, poussé directement sur `main` selon la même
  procédure exceptionnelle.

**CI reconfirmée après le fix R15** (`c0c402117`, run 31932578610) : 6564 tests, 6551 verts,
**10 rouges — exactement les 10 items pré-existants documentés ci-dessus, aucune surprise**.
`FocalHostSourceGuardTests` a disparu de la liste des échecs. Le job global reste marqué `failure`
sur GitHub (10 tests rouges empêchent le vert total), mais ces 10 sont tracés individuellement,
confirmés sans rapport avec ce fix, et documentés comme nouveau backlog ci-dessus — décision
consciente de clore CE slice ici plutôt que d'engloutir dans le même run la migration
bundle-injectable de ~7 tests + le symbole RTL + le bug de tri + les clés i18n manquantes, qui
constituent un chantier séparé, correctement scopé pour un futur slice IOS_DETTE dédié.

- `tasks/lane-cursor.md` → `lane=ANDROID android_streak=0 last_run=ios-build-break-focal-lentille`
  (ce commit, poussé directement sur `main`).

### 2026-08-16 — Run #10 (ré-vérification du backlog laissé par le fix de build-break — aucun code livré)

Contexte : `tasks/lane-cursor.md` était à `lane=ANDROID android_streak=5
last_run=conversation-favorite-reaction` — règle d'alternance déclenchée, bascule vers `IOS_DETTE`.
Scan de reprise (Étape 0 point 5) : `gh pr list --state open --search "apps/android OR apps/ios"`
→ une seule PR ouverte (#3083, `claude/keen-hamilton-si27ne`, member-list Android) — nom de branche
ne matchant PAS la convention `claude/apps/*/ <slice-id>` de cette routine (générée par une session
tierce), écartée conformément au filtre de bruit. Aucune branche `claude/apps/ios/*` récente.

**WIP orpheline trouvée hors du scan branches/PR** : `git stash list` montrait `stash@{1}` — « WIP
on claude/apps/ios/debt-message-language-detail-adaptive-onchange » (le slice mis de côté au run
build-break du même jour, cf. entrée précédente). Inspecté avant de reprendre ou d'abandonner :
`git stash show --stat` = **1 seul fichier, `project.pbxproj`, +564/-0** — un pur artefact de
régénération XcodeGen, ZÉRO changement de code source réel (le diff hors-pbxproj est vide). En plus
d'être un artefact généré (jamais committer ce churn, `apps/ios/CLAUDE.md`), ce snapshot est
doublement périmé : `main` a avancé de ~700 commits depuis (dont le merge Lentille/Focal ET le fix
de build-break qui a lui-même régénéré le pbxproj). **`git stash drop`** — aucune perte, la
migration réelle n'avait jamais été commencée, juste le projet régénéré en préparation.

**RE-PROUVÉ les 3 items laissés en backlog par l'entrée précédente avant de coder quoi que ce
soit** — les trois se sont révélés soit déjà résolus, soit non actionnables cette itération :

1. **`joinFlow.error.linkNotFound`/`joinFlow.error.unknown` « manquantes des 5 locales »** — FAUX
   dès la vérification : les deux clés existent dans
   `packages/MeeshySDK/Sources/MeeshyUI/Resources/Localizable.xcstrings` avec une couverture
   COMPLÈTE sur les **7** locales du catalogue (ar/de/en/es/fr/it/pt-BR — pas 5), confirmé par un
   script Python parsant le JSON du catalogue plutôt qu'un grep textuel fragile. Le test nommé
   `test_joinFlowErrorKeys_resolveInAll5Locales` n'existe nulle part dans le repo (`grep -rn`
   exhaustif, zéro occurrence) — la note elle-même était probablement erronée dès l'origine (nom de
   test inventé, ou confondu avec une autre feature), pas seulement obsolète. **ÉCARTÉ, preuve
   ci-dessus.**
2. **« ~16 `MeeshyTests` assertent des littéraux français », ex. `LentilleSectionIdentityTests`/
   `test_riviere_reason_isComposedFromLiveThresholds…`** — les DEUX tests nommés en exemple, lus
   intégralement dans `ModeMenuModelTests.swift` (le nom de fichier réel — `LentilleSectionIdentityTests`
   ne correspond à aucun fichier existant), sont déjà **locale-agnostiques** : ils composent la
   valeur attendue via le MÊME `String(localized:defaultValue:bundle:.main)` que la production
   (patron déjà établi `A11yLabelComposerTests`), avec un commentaire explicite documentant cette
   résolution comme déjà corrigée (« Résolution locale-agnostique »). Vraisemblablement corrigés par
   une session tierce concurrente le même jour (forte activité concurrente confirmée : PR #3083,
   plusieurs commits gateway). **Les 2 exemples nommés sont ÉCARTÉS, preuve ci-dessus** — mais la
   revendication plus large « ~16 tests » ne peut pas être re-vérifiée sans un run CI/local réel
   (tenté : `gh run view --log` sur le run CI le plus récent, extraction du résumé de tests
   infructueuse — log tronqué/mal structuré côté `gh`, pas de résumé de tests exploitable sans lancer
   un `xcodebuild test` complet, coûteux). **Marqué « À RE-VÉRIFIER » (pas re-fermé, pas re-attaqué à
   l'aveugle)** — un futur run devra soit lancer la suite complète localement, soit lire le résumé CI
   directement dans l'UI GitHub, avant de conclure sur le reste des ~14 tests restants.
3. **`OfflineQueueTests.test_recoverLastUnsentPost_returnsMostRecentMatchingType` flaky** — toujours
   ouvert, cause racine toujours non élucidée (hypothèse de pollution d'état inter-classes non
   creusée) — ne satisfait pas le filtre de sûreté « mécanique/à risque borné » tant qu'un
   diagnostic n'a pas réduit le problème à un fix précis. Laissé tel quel, pas d'action ce run.

**Balayage de réapprovisionnement du backlog** (patron suggéré par le prompt orchestrateur —
`print(`, `DispatchQueue.main.async`, `#file\b`, `.system(size:` restants) :
- `#file\b` (hors `#filePath`) dans les tests : **1 seule occurrence**, et c'est la garde
  `Swift6TestFileArgSourceGuardTests.swift` elle-même (son propre commentaire de doc mentionnant
  `#file` en prose) — le défaut original (item 1 du seed initial) est déjà entièrement corrigé ET
  gardé mécaniquement. Rien à faire.
- `print(` en code de production (`apps/ios/Meeshy` + `packages/MeeshySDK/Sources`, hors tests) :
  **zéro occurrence réelle** — le premier grep naïf remontait des faux positifs
  (`mediaKeysFingerprint`/`structureFingerprint`, qui CONTIENNENT la sous-chaîne `print(` sans être
  un appel `print()`), corrigé avec une frontière de mot. Déjà propre.
- `DispatchQueue.main.async` restants : **76 occurrences** — réel, mais bien trop large pour un
  seul run borné (contrairement à l'item 7 `WindowMetrics`, chaque site nécessite un jugement
  contextuel — s'agit-il d'un callback non-async où le hop de queue est nécessaire, ou d'un contexte
  déjà `@MainActor` où c'est une pure verrue historique ? — pas une substitution mécanique 1:1
  uniforme). Candidat pour un FUTUR item correctement scopé (probablement décomposé en plusieurs
  sous-lots comme l'a été l'item 7), pas attaqué ce run faute d'un premier tri fichier-par-fichier.
- `.system(size:` restants : **190 occurrences** — encore plus large, item non scopé du tout (pas
  dans le seed original), simple signal de style à trier avant de devenir un item actionnable.

**Décision : aucun code livré ce run** — les 3 items hérités se sont révélés soit déjà résolus
(2/3, preuve ci-dessus), soit non bornés/non mécaniques (le 3e, flaky non élucidé), et le
balayage de réapprovisionnement n'a produit aucun candidat à la fois réel, petit et sûr sans un tri
supplémentaire (les deux plus gros candidats, `DispatchQueue.main.async`/`.system(size:`,
nécessitent d'abord une passe de tri fichier-par-fichier avant de devenir un item exécutable en un
seul run — même précédent que les runs « Item 4 closed » et « Item 7 sous-lot » de ce même fichier).
Contrairement à un run qui forcerait un fix sur un item non re-prouvé, celui-ci referme
proprement 2 items périmés avec preuve et documente honnêtement l'état réel du 3e.

**Vérification** : aucune (aucun code applicatif touché — `git stash drop` + mise à jour de ce
fichier de suivi uniquement). Pas de branche `claude/apps/ios/*` créée, pas de PR, pas de CI.

- `tasks/lane-cursor.md` → `lane=ANDROID android_streak=0 last_run=ios-debt-backlog-reverification-2026-08-16`
  (commit séparé, poussé directement sur `main` avec `git push origin HEAD:main`).

### 2026-08-16 — Run #11 (`MessageLanguageDetailView` → `adaptiveOnChange`, PR #3097 mergée `0bb9c853a`)

Contexte : `tasks/lane-cursor.md` à `lane=ANDROID android_streak=6 last_run=feed-thumbhash-placeholder` —
règle d'alternance (streak ≥ 5) déclenchée, bascule vers `IOS_DETTE`. `gh pr list --state open --search
"apps/android OR apps/ios"` → vide (aucune PR concurrente à ce moment).

**RE-PROUVÉ tout le backlog avant de choisir, aucun candidat de `CURRENT_QUALITY_REVIEW.md` ni de ce
fichier n'a survécu à la vérification** :
- Les 3 « Refactoring/Modernization Opportunities » de `CURRENT_QUALITY_REVIEW.md` sont TOUTES déjà
  closes : Swift 6 `#filePath`/`#file` (item 1, clos ancienne itération) ; « Shared Singleton Access » —
  les 3 leaf views nommées par `apps/ios/CLAUDE.md` (`ThemedMessageBubble`, `MeeshyAvatar`,
  `ThemedConversationRow`/`LentilleConversationRow`) : zéro `@ObservedObject`/`@StateObject` sur un
  singleton global, vérifié par grep direct — la règle citée est déjà respectée partout où le rapport
  la nomme ; « UI State Aggregation / `ConversationLoadingPhase` » — le type EXISTE déjà
  (`Features/Main/Models/ConversationLoadingPhase.swift`), consommé par `ConversationViewModel
  .paginationPhase`. `CURRENT_QUALITY_REVIEW.md` est donc entièrement périmé comme source de backlog.
- Item 4 (`DispatchQueue.main.async`) : re-grep bare (hors `asyncAfter`, `\b` en fin de motif) →
  28 occurrences / 11 fichiers sous `apps/ios/Meeshy`. Mais relecture de l'historique complet de CE
  fichier (runs #2/#3/#6) montre que l'item a déjà été **fermé explicitement au run #6** après triage
  exhaustif des 55 fichiers de l'époque : 2/2 sites mécaniques nus migrés (`DiscoverTab.swift`,
  `CameraView.swift`), le reste classé en 5 catégories (faux positifs commentaire, timing documenté,
  pont structuré déjà correct, escape SwiftUI documentée nécessitant vérification device dédiée,
  WebRTC delegate à haut risque) — reprendre nécessite une session interactive simulateur dédiée
  (login, ouvrir conversation, déclencher signalement story + focus composer + animation liste), hors
  périmètre d'un incrément de routine. Le run #10 (même jour, plus tôt) avait re-proposé cet item sans
  retrouver cette fermeture — corrigé ici : **toujours fermé, pas repris**.
- Item 6 (Observable macro) : fermé par décision utilisateur explicite 2026-08-11 (« on reste iOS 16 »)
  — ne plus re-proposer sans relèvement du plancher de déploiement.
- Item 5 (Date.ParseStrategy) : toujours ouvert mais nécessite une conception d'API avant tout fix
  mécanique — non actionnable en un run.
- Item 3 (`OfflineQueueTests` flaky) : toujours sans cause racine — ne satisfait pas le filtre de
  sûreté.
- Item 2 (~16 tests littéraux français) et item 1 (`joinFlow` i18n) : laissés « À RE-VÉRIFIER »/écartés
  par le run #10 — **re-vérifiés ici indirectement** : CI GitHub Actions confirmée VERTE sur le tip
  courant de `main` avant ce run (run 31957691661, job « Build app + tests unitaires » = success),
  donc les 10 échecs pré-existants documentés par le run #10 sont déjà résolus par de l'activité tierce
  concurrente (confirmée : commit `a59c326e9`, « run #99 », auteur/session distincts, recalibrage de 3
  gardes source sans rapport). Rien à rouvrir.
- **Sweep négatif supplémentaire, nouvelle catégorie non listée dans ce fichier** : `try!`/`as!` en code
  de production (`apps/ios/Meeshy` + `packages/MeeshySDK/Sources`) → 10 + 3 = 13 sites, TOUS des
  assertions programmeur légitimes après lecture individuelle : `try! NSRegularExpression(pattern:
  <littéral compile-time>)` (8 sites, `ComposerDropResolver.swift`/`MessageTextRenderer.swift`) ;
  `try! DatabaseQueue()` (`AppDatabase.swift:137`, fallback in-memory déjà annoté `// swiftlint:disable
  :next force_try` avec commentaire explicite sur le choix) ; `layer as! AVPlayerLayer` ×3
  (`ReelsPlayerView.swift`/`StoryVideoPlayerView.swift`/`VideoEditorStage.swift`, patron Apple standard
  pairé avec `override static var layerClass`). Zéro dette réelle — catégorie fermée, pas de suivi.

**Choisi : `MessageLanguageDetailView.swift` — migration `.onChange(of:)` brut (textTranslations,
translatedAudios) vers `adaptiveOnChange`.** Item déjà NOMMÉ par le run build-break du même jour (stash
`debt-message-language-detail-adaptive-onchange`, mis de côté faute de temps, jamais implémenté — le
stash ne contenait que du churn pbxproj, `git stash drop` sans perte au run #10). Re-prouvé contre le
code réel : exactement 2 sites dans exactement 1 fichier app-side (`grep` exhaustif de tout
`apps/ios/Meeshy` pour `.onChange(of:` — les 2 seules autres occurrences sont des commentaires de
prose dans `StoryViewerView(+Sidebar).swift`, pas du code). La garde SDK existante
(`AdaptiveOnChangeSweepTests.swift`) ne couvre que des fichiers sous `packages/MeeshySDK/Sources/
MeeshyUI/` — ce fichier app-side n'était couvert par AUCUNE garde.

**TDD** :
- RED : nouveau `MessageLanguageDetailViewAdaptiveOnChangeSourceGuardTests.swift` (même patron que
  `CameraPreviewLayerUpdateUIViewSourceGuardTests` — isole le corps de `body` via `AppSourceGuard
  .stripComments` + bornage par marqueurs de code réels, JAMAIS un commentaire `// MARK:` — piège
  évité en cours de route : un premier marqueur de fin choisi sur un commentaire disparaissait après
  strip, corrigé en bornant sur `private var content: some View {`, code réel). Confirmé en échec (4
  assertions rouges) contre la source non modifiée.
- GREEN : `.onChange(of: textTranslations) { _ in syncTranslationsFromProps() }` →
  `.adaptiveOnChange(of: textTranslations) { _, _ in syncTranslationsFromProps() }` (idem
  `translatedAudios`). `MessageTranslation`/`MessageTranslatedAudio` déjà `Equatable` (requis par
  `adaptiveOnChange<V: Equatable>`) — aucun changement de type nécessaire. Test relancé isolément →
  vert ; `MessageDetailLanguageNameSSOTTests` voisin toujours vert.

**Vérification** :
- `./apps/ios/meeshy.sh build` vert (95s).
- `./apps/ios/meeshy.sh test` (suite complète) : Phase 0 (SDK) verte, Phase 1 verte (2873 tests, 1
  skip), Phase 2 verte (3813 tests), Phase 3 verte (1 skip, pas de credentials démo locaux) — **zéro
  échec sur l'ensemble**, confirmant à la fois le fix et l'absence de régression.
- Branche `claude/apps/ios/debt-message-language-detail-adaptive-onchange` créée EN PREMIER, avant
  toute édition (le piège de l'itération précédente — édition avant branche — ne s'est PAS reproduit).
  Une branche locale homonyme préexistante (vide, pointant sur un ancien commit sans rapport) a été
  supprimée puis recréée proprement depuis `origin/main` frais.
- PR #3097 : CI complète déclenchée (matrice `ci.yml` entière, pas seulement iOS — confirme une fois
  de plus qu'un diff `apps/ios`-only ne limite pas le scope CI). **Un seul job rouge, `Test shared`** —
  diagnostiqué en profondeur avant tout merge (jamais bypassé sans preuve) : le test `packages/shared/
  __tests__/ci/lentille-tokens-consumption-gate.test.ts` (garde « déclaré ⇒ consommé » des tokens
  Lentille) attendait `thread.hiddenChrome` dans `EXCLUDED_DEAD_FAMILIES` (mort des deux côtés) mais a
  trouvé un consommateur Swift RÉEL — `FocalMetrics.HiddenChrome.easeOut` dans `ConversationView
  .swift:1842`. Vérifié via `git show origin/main:...` : ce symbole vient de 3 commits « focal-ios »
  atterris sur `main` APRÈS le point de branchement de cette PR (`85cf1ec48`/`20c7b7385`/`38781d0e4`,
  session tierce concurrente), donc confirmé À 100 % sans rapport avec ce diff (qui ne touche ni
  `ConversationView.swift` ni `packages/shared`). Le job `Summary` (probablement le vrai gate agrégé)
  était déjà vert malgré ce rouge. Tous les autres jobs verts, dont `Build app (app + cibles de test)`
  (le job iOS pertinent pour ce diff). **Nouveau backlog découvert, hors périmètre de ce run** (item
  `packages/shared`, jamais `apps/ios`/`MeeshySDK` sans item dédié — donc pas traité ici) : l'entrée
  `EXCLUDED_DEAD_FAMILIES['thread.hiddenChrome']` doit être retirée par un futur run/session (probable
  candidat : la session « focal-ios » elle-même, ou un futur item `packages/shared` dédié) — sinon CE
  MÊME échec réapparaîtra sur toute future PR jusqu'à correction.
- Merge : squash via l'API GitHub directe (`gh pr merge` local échouait — conflit avec le worktree
  principal qui a `main` checked out ; contourné avec `gh api -X PUT .../pulls/3097/merge`) →
  `0bb9c853a`. Branche distante supprimée, worktree `ops/android-ios-parity-routine` resynchronisé en
  fast-forward sur `origin/main`.

- `tasks/lane-cursor.md` → `lane=ANDROID android_streak=0 last_run=message-language-detail-adaptive-onchange`
  (commit séparé, poussé directement sur `main`). Note : au moment du merge, `tasks/lane-cursor.md`
  avait déjà avancé à `android_streak=7 last_run=reels-realtime-room` via une session Android
  concurrente pendant que cette PR attendait sa CI — lu FRAIS au merge (pas à la sélection du slice),
  conformément au principe établi ; ce run écrase avec la valeur de reset standard post-IOS_DETTE.

### 2026-08-17 — Run #12 (`CameraView.swift` — 9 sites `try?` → `do/catch` + `Logger.media`, PR #3109 mergée `6d81a727b`)

Contexte : `tasks/lane-cursor.md` à `lane=ANDROID android_streak=5
last_run=android-backlog-reverification-2026-08-16` — règle d'alternance déclenchée (le run Android
précédent n'avait livré aucun code, mais avait délibérément porté le streak au seuil pour forcer la
bascule — voir `apps/android/tasks/android-routine/PROGRESS.md`). `gh pr list --state open --search
"apps/android OR apps/ios"` → 3 PR concurrentes (#3096, #3106, #3108), aucune touchant un fichier de
ce diff.

**RE-PROUVÉ tout le backlog avant de choisir — les items 1-6 restent dans l'état documenté par le
Run #11** (item 4 `DispatchQueue.main.async` toujours fermé run #6, item 6 Observable macro
toujours fermé décision utilisateur, item 5 nécessite conception, item 3 flaky sans cause racine,
items 1/2 déjà écartés/à-revérifier sans nouvelle information). **Nouvelle piste explorée** :
`try?` avalant silencieusement des erreurs (distinct de `try!`/`as!`, déjà clos au Run #11) — la
mémoire projet documente une « passe de fond 2026-07-26 » de 293 sites déjà convertis, mais un
re-comptage avec la regex correcte (`[^a-zA-Z0-9_]try\?`, évite les faux positifs `StatusEntry?`)
trouve encore **815 occurrences**, fortement concentrées dans quelques ViewModels géants
(`ConversationViewModel.swift` 68, `FeedView+Attachments.swift` 27, `StoryViewModel.swift` 25) —
bien trop pour un run mécanique unique sans un tri exhaustif préalable (même leçon que
`DispatchQueue.main.async` : beaucoup de `try?` sont légitimement corrects — décodeurs polymorphes,
parsing en cascade — et la mémoire elle-même liste ce qu'il ne FAUT PAS convertir). Plutôt que
d'attaquer le gros du gisement à l'aveugle, choisi un **sous-ensemble petit et déjà pré-qualifié** :
`CameraView.swift`, 9 sites, déjà familier (le fix `DispatchQueue.main.async` du run #3 y avait
atterri), et déjà couvert par des tests source-guard existants — une garantie que le comportement
de repli attendu est documenté et vérifiable avant tout changement.

**Chaque site re-lu individuellement avant conversion** (pas une substitution mécanique 1:1) :
`enableAudioCaptureIfNeeded`/`addVideoInput` (création `AVCaptureDeviceInput` — un échec matériel
réel, jamais journalisé) ; deux nettoyages `FileManager.default.removeItem` dans des boucles de
segments (converti vers l'aide déjà existante `FileManager.removeItemLogging`, exactement le
patron prescrit par la mémoire plutôt qu'un `do/catch` réécrit à la main) ; et les 5 sites de
`mergeSegments` (chargement de durée + insertion pistes vidéo/audio) — vérifié avec soin que la
distinction « piste absente » (`.first == nil`, cas nominal d'un enregistrement sans micro,
NE DOIT PAS journaliser — un test dédié le protège explicitement) vs « l'appel a réellement levé »
(un vrai échec, doit journaliser) reste intacte après conversion : `if let x = try await
...loadTracks(...).first` laisse toujours passer un tableau vide sans lever, seul un throw réel
entre dans le nouveau `catch`.

**TDD** :
- Baseline confirmée verte AVANT toute modification : `CameraModelSwitchDuringRecordingTests` +
  `CameraModelSegmentMergeTests`, 11 tests, 0 échec.
- 2 des tests existants référençaient le texte LITTÉRAL des sites `try?`
  (`test_mergeSegments_skipsUnreadableSegmentsInsteadOfFailingEntirely`,
  `test_mergeSegments_toleratesSegmentsWithoutAudioTrack`) — mis à jour pour matcher la nouvelle
  forme `try` (plus `try?`) et enrichis : une nouvelle sous-assertion isole le bloc `catch` du
  chargement de durée et vérifie qu'il contient toujours `continue` (mutation-prouvée — retirer ce
  `continue` du code source ferait échouer exactement cette assertion), et une assertion globale
  `XCTAssertFalse(fn.contains("try?"))` verrouille mécaniquement contre toute régression future.
- GREEN : les 9 conversions appliquées (`Logger.media` déjà disponible via l'extension centrale
  `packages/MeeshySDK/Sources/MeeshySDK/Core/Logging.swift`, `import os` ajouté au fichier — zéro
  nouvelle déclaration de logger nécessaire). 11/11 tests verts après modification.

**Vérification** :
- `./apps/ios/meeshy.sh build` vert (80s).
- `./apps/ios/meeshy.sh test` (suite complète) : **premier lancement en arrière-plan TUÉ sans sortie
  de diagnostic** (statut « killed », fichier de sortie vide — cause non élucidée, pas un ENOSPC
  direct : disque à 5,6 Gi à ce moment, pas 0). Worktree/branche confirmés intacts après l'incident.
  **Relancé une 2e fois, complet cette fois** : Phase 0 (SDK) verte, Phase 3 verte, **Phases 1/2 :
  19 échecs, ZÉRO ne touchant `CameraView`/`CameraModel`** (tous dans `Focal*`/liste de
  messages/accessibilité — code jamais touché par ce diff) — confirmé par lecture individuelle de
  chaque échec, pas une supposition. Recoupé avec `gh run list --branch main --workflow iOS` :
  plusieurs commits récents de `main` déjà `conclusion: failure` sur ce même axe Focal (churn
  concurrent), confirmant l'absence de rapport avant même l'ouverture de la PR.
- Disque surveillé tout du long (11 Gi → 5,9 Gi → 4,4 Gi pendant ce run, stable depuis) — pas
  d'incident de type « 0 octet libre » cette fois, mais assez proche pour justifier une vigilance
  continue les prochains runs.
- Branche `claude/apps/ios/debt-cameraview-try-optional-logging` créée EN PREMIER, avant toute
  édition. Diff strictement `apps/ios` (2 fichiers, aucun churn pbxproj — aucun fichier nouveau).
- PR #3109 : CI intégralement verte cette fois (y compris `Test shared`, `Build app`, `Summary`) —
  contrairement aux 3 PR précédentes de ce cycle, aucun job rouge à diagnostiquer. Mergée via
  l'API GitHub directe → `6d81a727b`.

- `tasks/lane-cursor.md` → `lane=ANDROID android_streak=0 last_run=cameraview-try-optional-logging`
  (commit séparé, poussé directement sur `main`, jamais mélangé au diff `apps/ios`).

**Nouveau backlog noté pour un futur run IOS_DETTE** : `try?` reste un gisement de 815 sites
(moins 9 désormais) — un futur run pourrait reprendre la méthode d'aujourd'hui (choisir UN fichier
déjà couvert par des tests source-guard, re-lire chaque site individuellement) plutôt qu'un tri
exhaustif de l'ensemble en une fois, à la manière dont `DispatchQueue.main.async` a été découpé en
plusieurs sous-lots au fil de plusieurs runs.

### 2026-08-17 — Run #13 (`MediaSessionCoordinator.swift` — 4 sites `try?` → `do/catch` + logging, PR #3124 mergée `a2eacc9d1`)

Contexte : `tasks/lane-cursor.md` à `lane=ANDROID android_streak=5 last_run=feed-impression-batching` —
règle d'alternance déclenchée. `gh pr list --state open --search "apps/android OR apps/ios"` → 2 PR
concurrentes (#3096, #3108), aucune touchant un fichier de ce diff.

**RE-PROUVÉ tout le backlog avant de choisir — items 1-7 restent dans l'état documenté par les runs
précédents** (rien de nouveau à rouvrir). **Continué la méthode `try?` ouverte au Run #12** : plutôt
que de re-scanner l'ensemble des 806 sites restants, échantillonné individuellement plusieurs
fichiers à faible nombre d'occurrences (`StatusViewModel` 3, `PhonebookViewModel` 3,
`GlobalSearchViewModel` 3, `UserProfileViewModel` 3, `ConversationSocketHandler` 4,
`SharePendingSendConsumer` 3, `NSEPendingPostConsumer` 4, `NSEPendingMessageConsumer` 5,
`LinkPreviewFetcher` 3) — **chacun écarté après lecture directe** : tous correspondaient à des
patrons déjà documentés comme légitimes par la mémoire projet (`feedback_avoid_try_optional_and_ios_
compat_folder.md`) — regex `NSRegularExpression`/`NSDataDetector` sur un littéral compile-time,
parsing de dates en cascade (`Date(dateStr, strategy:)` avec repli), scans de répertoire
(`contentsOfDirectory`/`Data(contentsOf:)` best-effort dans une boucle), décodage best-effort
(`try? decoder.decode(...)`), `Task.sleep`. Aucun n'a été retenu sans nouvelle preuve contraire.

**Choisi : `MediaSessionCoordinator.swift`, 4 sites — un vrai candidat cette fois.** `setCategory`/
`setActive` sur `AVAudioSession.sharedInstance()` sont des appels SYSTÈME réels (pas une regex
littérale, pas un parsing) qui peuvent authentiquement échouer (autre process tenant le hardware en
exclusif, conflit de routage) — `try?` rendait chaque échec de ce coordinateur audio CENTRAL
(« Coordonne l'accès à AVAudioSession entre tous les composants audio ») totalement indiagnosticable.
Signal fort supplémentaire : la méthode sœur `activateRecordingSync`, juste en dessous dans le même
fichier, utilise déjà un vrai `do/catch` (retourne `Bool`) — `activatePlaybackSync` et
`deactivatePlaybackSync` étaient incohérentes avec leur propre voisine.

**TDD** — pas de seam pour faire réellement échouer `AVAudioSession` en test unitaire (confirmé en
lisant les 2 suites de tests existantes : elles testent le forwarding d'événements système, jamais
les chemins d'échec de `setCategory`/`setActive`). Nouveau fichier source-guard
`MediaSessionCoordinatorTryOptionalLoggingSourceGuardTests.swift` (même patron que
`CameraModelSwitchDuringRecordingTests` du Run #12) : RED confirmé (échec pour la bonne raison — `try?`
encore présent, PAS une erreur de résolution de chemin — corrigée en cours de route : une déletion
de composant de chemin manquante). GREEN : les 4 sites convertis. `activatePlaybackSync` reçoit DEUX
`do/catch` INDÉPENDANTS (pas un seul englobant les deux appels) pour préserver EXACTEMENT le
comportement `try?` d'origine — un échec de `setCategory` ne doit PAS empêcher la tentative
`setActive`, comme c'était déjà le cas. Réutilise le `logger` déjà déclaré en tête de fichier —
aucune nouvelle déclaration. Piège rencontré et corrigé : mon propre commentaire de code mentionnait
littéralement la chaîne `try?` en prose, faisant échouer le verrou global du test
(`test_noTryOptionalRemainsAnywhereInTheFile`) — reformulé.

**Vérification** :
- `./apps/ios/meeshy.sh build` vert (114s).
- **Nouveau motif d'incident opérationnel, distinct du « killed sans diagnostic » du Run #12** :
  `./apps/ios/meeshy.sh test` (suite complète) lancée via `run_in_background` de l'outil Bash a été
  TUÉE deux fois de suite. Cause élucidée cette fois (contrairement au Run #12) : la fenêtre max de
  `run_in_background` est de 10 minutes, et la suite complète (phase 0 SDK + 3 phases app, milliers
  de tests) la dépasse — ce n'est pas un crash système. **Corrigé : 3e tentative lancée en process
  totalement détaché** (`nohup ... > log 2>&1 < /dev/null & disown`, PID sauvegardé), surveillée par
  un Monitor dédié (plafond 55 min) qui poll le log pour les 4 lignes de résumé de phase — a fini par
  aboutir. Phase 0 (SDK, inclut les nouveaux tests) verte, Phase 3 (connectée) verte, Phase 1/2 :
  16 échecs.
- **Chaque échec vérifié individuellement, pas supposé** : les 16 sont concentrés dans 10 classes de
  test (`FocalHostSourceGuardTests`, `FocalPerspectiveCellTests`, `FocalRowMetricsTests`,
  `FocalScrollPassGeometryTests`, `FocalScrollPassSourceGuardTests`, `FocalScrollTimePillMountGuardTests`,
  `FocalVoiceOverParityTests`, `FocalFocusDecorationTests`, `ConversationTopChromeFadeTests`,
  `CallDetailRoutingTests`) — aucune ne touche `MediaSessionCoordinator`/audio-session (`grep`
  confirmé). Recoupé avec la CI GitHub réelle de `origin/main` : `gh run list --workflow iOS` a montré
  un run FAILURE sur `main` au commit `05e704134` — exactement UN commit avant le point de branchement
  de cette PR — et `gh run view --log-failed` a confirmé la liste EXACTEMENT IDENTIQUE des 10 classes
  en échec. Confirmé sans rapport avec ce diff par preuve indépendante, pas par supposition — churn
  concurrent connu de la feature "Focal" en développement actif.
- Branche `claude/apps/ios/debt-mediasessioncoordinator-try-optional-logging` créée EN PREMIER, avant
  toute édition — cette fois le piège de l'itération précédente (édition avant branche, sur la branche
  de routine Android) ne s'est PAS reproduit côté iOS.
- PR #3124 : CI intégralement verte, y compris `sdk-tests` (34 min — le workflow SPM dédié déclenché
  par tout diff `packages/MeeshySDK`) et `Build app (app + cibles de test)` (le job iOS pertinent).
  Mergée via l'API GitHub directe → `a2eacc9d1`.

- `tasks/lane-cursor.md` → `lane=ANDROID android_streak=0
  last_run=mediasessioncoordinator-try-optional-logging` (commit séparé, poussé directement sur
  `main`, jamais mélangé au diff `packages/MeeshySDK`).

**Nouveau backlog noté pour un futur run IOS_DETTE** : `try?` reste un gisement d'environ 802 sites
(4 de moins qu'au Run #12). La méthode « échantillonner plusieurs petits fichiers, écarter ceux qui
matchent les patrons légitimes déjà documentés, ne garder que les vrais appels système/hardware sans
seam de test » s'est montrée efficace ce run-ci et mérite d'être reproduite plutôt que de re-scanner
l'ensemble à l'aveugle.

### 2026-08-17 — Run #14 (`MediaSaveCoordinator.swift` — 1 site `try?` → `removeItemLogging`, PR #3155 mergée `69179bb40`)

Contexte : `tasks/lane-cursor.md` à `lane=ANDROID android_streak=5 last_run=post-detail-reach-stats` —
règle d'alternance déclenchée (5ᵉ run ANDROID consécutif). `gh pr list --state open --search
"apps/android OR apps/ios"` → 1 PR concurrente (#3113, `claude/keen-hamilton-sqq310`), mauvaise
convention de nommage pour cette routine (agent tiers), aucun fichier de ce diff touché.

**RE-PROUVÉ tout le backlog avant de choisir — items 1-7 restent dans l'état documenté par les runs
précédents** (rien de neuf à rouvrir). **Continué la méthode `try?` des Runs #12/#13** : recensement
complet par comptage-par-fichier (`grep -rlE '[^a-zA-Z0-9_]try\?'` sur `apps/ios/Meeshy` +
`packages/MeeshySDK/Sources`), échantillonnage de ~10 fichiers à 1 seul site non encore examinés
(`MediaSaveCoordinator.swift`, `LocationPickerView.swift`, `StoryOfflineMediaWriter.swift`,
`AttachmentQuickLookPreview.swift`, `ChangePasswordView.swift`, `MessageViewsDetailView.swift`) —
tous écartés sauf un après lecture directe : `Task.sleep` (×2, patron déjà légitime), lecture
best-effort d'un fichier local pour une preview QuickLook (`try? Data(contentsOf:)`, un fichier
manquant/corrompu ne fait juste que masquer la preview — bénin), et un commentaire de prose
mentionnant `try?` au passé sans code réel correspondant (`StoryOfflineMediaWriter.swift` — le
défaut qu'il décrit est déjà corrigé).

**Choisi : `MediaSaveCoordinator.discardStagingDirectory(of:)`, 1 site.** Nettoie le dossier de
staging temporaire d'une copie exportée une fois écrite chez l'utilisateur — appel FileManager RÉEL
pouvant authentiquement échouer (permissions, volume en lecture seule), même famille que le fix
`CameraView` du Run #12 (déjà converti vers l'aide SDK `FileManager.removeItemLogging`). Signal
supplémentaire : le helper `removeItemLogging`/`createDirectoryLogging`
(`packages/MeeshySDK/Sources/MeeshySDK/Core/FileManagerLogging.swift`) existe déjà précisément pour
ce patron — distinguer « déjà réclamé » (silencieux, cas nominal) d'un vrai échec (loggé).

**TDD** — pas de seam pour forcer un vrai échec `FileManager` en test unitaire portable (même
constat qu'au Run #13). Nouveau fichier source-guard
`MediaSaveCoordinatorTryOptionalLoggingSourceGuardTests.swift` (même patron `AppSourceGuard
.stripComments` que les gardes Focal existantes) : RED confirmé pour la bonne raison (`try?` encore
présent, `removeItemLogging` absent — 2/2 assertions échouées, pas une erreur de compilation).

**Piège rencontré et corrigé en cours de route** : le premier fix passait `logger: mediaSaveLog` (le
`Logger` déjà déclaré en tête du fichier) — échec de compilation, `main actor-isolated let
'mediaSaveLog' can not be referenced from a nonisolated context` (le target app compile sous
`SWIFT_DEFAULT_ACTOR_ISOLATION = MainActor`, et `discardStagingDirectory` est `nonisolated static
func`). Corrigé en omettant le paramètre `logger:` pour retomber sur le défaut du helper,
`Logger.cache` — déclaré explicitement `nonisolated static let` dans
`packages/MeeshySDK/Sources/MeeshySDK/Core/Logging.swift`, donc utilisable sans contrainte
d'acteur ; la catégorie « cache » est d'ailleurs sémantiquement appropriée pour un nettoyage de
dossier de staging disque.

**Vérification** :
- `./apps/ios/meeshy.sh build` vert après le correctif d'isolation (`xcodebuild build-for-testing`
  confirmé `** TEST BUILD SUCCEEDED **`).
- Test ciblé (nouvelle garde ×2 + `MediaSaveCoordinatorTests` existante ×35, pour couvrir à la fois
  le nouveau comportement et l'absence de régression sur la garde d'exclusion `hasPrefix("meeshy-
  branded-")` déjà en place) lancé via `nohup ... & disown` + `Monitor` (motif désormais systématique
  pour tout run de test ciblé dans cette routine — le premier essai de ce run, via l'auto-promotion
  arrière-plan de l'outil Bash sans `nohup` explicite, avait bien survécu mais avec une collecte de
  diagnostics simulateur qui a traîné ~10 min après la fin réelle des tests, d'où le passage
  systématique à `nohup` pour la suite) : 37/37 verts.
- Suite complète `./apps/ios/meeshy.sh test` (`nohup` + `Monitor` PERSISTENT, ~35 min) : Phase 2
  (connexion & contenu) verte, Phase 3 (connecté) verte. **Phase 0 (SDK) et Phase 1 (isolées)
  rouges, TOUTES DEUX confirmées sans rapport par preuve indépendante, pas supposées** :
  - Phase 0 : erreurs de compilation Swift 6 (concurrence, capture de variable) dans
    `ConversationStoreSocketBridgeTests.swift`, fichier jamais touché par ce diff. Recoupé avec
    `gh run list --workflow sdk-tests.yml --branch main` : le workflow `SDK Tests` était DÉJÀ rouge
    sur les deux derniers push de `main` AVANT le point de branchement de cette PR (commits
    `10888be66` puis un push GatewayBridgeProvider antérieur) — régression pré-existante d'une
    session concurrente (« G-124 »).
  - Phase 1 : `FocalFocusDecorationTests` en échec, zone jamais touchée par ce diff. Tracé
    directement au commit `cd0eab511` (« le defilement suit enfin la courbe »), un fix Focal
    poussé par une AUTRE session Claude en parallèle de ce run-ci (signalée via un message
    cross-session reçu pendant l'attente de CI de ce même run) — confirmé via `git show cd0eab511
    --stat` (modifie `Focal/`) et `git diff origin/main...HEAD --stat` (ce diff ne touche jamais
    `Focal/`).
- Branche `claude/apps/ios/debt-mediasavecoordinator-try-optional-logging` créée EN PREMIER, avant
  toute édition. `project.pbxproj` régénéré par XcodeGen (référence du nouveau fichier de test
  ajoutée, 4 lignes purement additives, committées comme le prescrit `apps/ios/CLAUDE.md`).
- PR #3155 : CI intégralement verte, y compris `Build app (app + cibles de test)` (le job iOS
  pertinent pour ce diff) — la matrice complète `ci.yml` s'est bien déclenchée malgré un diff
  `apps/ios`-only, comme toujours dans ce repo. Mergée via l'API GitHub directe → `69179bb40`.

- `tasks/lane-cursor.md` → `lane=ANDROID android_streak=0
  last_run=mediasavecoordinator-try-optional-logging` (commit séparé, poussé directement sur
  `main`, jamais mélangé au diff `apps/ios`).

**Nouveau backlog noté pour un futur run IOS_DETTE** : `try?` reste un gisement d'environ 801 sites
(1 de moins qu'au Run #13). **Hygiène à traiter en priorité au PROCHAIN run IOS_DETTE** : ce fichier
dépasse maintenant nettement les ~1500 lignes du seuil documenté dans le prompt orchestrateur — la
prochaine itération devrait ouvrir avec un archivage dédié (garder les ~300 dernières lignes,
déplacer le reste vers `tasks/ios-debt-routine-progress-archive-2026-08.md`) AVANT de choisir un
nouvel item, plutôt que de continuer à laisser le fichier grossir sans borne.

### 2026-08-17 — Run #15 (`MeeshyAudioSignature.swift` — 2 sites `try?` → `removeItemLogging`, hygiène d'archivage effectuée)

Contexte : `tasks/lane-cursor.md` à `lane=ANDROID android_streak=5 last_run=discover-sms-invite` —
règle d'alternance déclenchée (5ᵉ run ANDROID consécutif). `gh pr list --state open --search
"apps/android OR apps/ios"` → 1 PR concurrente sans rapport (#3171, web). `df -h /` → 6.7 Gi libre.

**Hygiène effectuée EN PREMIER, comme demandé par la note du Run #14** : ce fichier dépassait déjà
1587 lignes. Runs #1–#9 (le « Journal d'itération » historique, lignes 282–1037, 756 lignes)
déplacés tels quels vers un nouveau `tasks/ios-debt-routine-progress-archive-2026-08.md` — même
convention append/oldest-first que le fichier vivant, pointeur en tête vers ce dernier. Le fichier
vivant tombe de 1587 à 838 lignes ; la section « Backlog » (état vivant, jamais un journal) reste
intacte à sa place, le journal continue directement à partir du « Build-break critique »
2026-08-16.

**Continué la méthode `try?` des Runs #12/#13/#14.** Grep exhaustif `try? FileManager` sur tout le
repo (`apps/ios/Meeshy` + `packages/MeeshySDK/Sources`) : la grande majorité des sites vivent dans
des fichiers à N occurrences (`FeedView+Attachments.swift`, `StoryViewModel.swift`,
`ConversationView+Composer.swift`…) — hors périmètre d'un slice unique, cf. précédent des runs
antérieurs qui n'ont jamais touché ces gros fichiers. Filtré sur les fichiers à 1-2 sites,
auto-contenus, jamais examinés par les runs précédents.

**Choisi : `packages/MeeshySDK/Sources/MeeshyUI/Media/Branding/MeeshyAudioSignature.swift`,
`stampedCopy(of:placement:)`, 2 sites.** SDK-side (mirror du précédent PR #2868 — petit slice SDK
auto-contenu). Le premier (`defer { try? FileManager.default.removeItem(at: jingleURL) }`) nettoie
le fichier temporaire du carillon de marque rendu par `MeeshyBrandJingle`, TOUJOURS exécuté quel que
soit le chemin de sortie de la fonction. Le second (`try? FileManager.default.removeItem(at:
directory)`) nettoie le dossier de sortie uniquement quand l'export AVFoundation échoue
(`session.status != .completed`). Les deux sont de VRAIS appels `FileManager.removeItem` pouvant
authentiquement échouer (permissions, volume en lecture seule) — même famille que les 3 runs
précédents, pas un faux positif commentaire ni un `Task.sleep`/lecture best-effort bénigne.

Convertis vers `FileManager.default.removeItemLogging(at:context:logger: .media)` — catégorie
`.media` choisie explicitement plutôt que le défaut `.cache` du helper (branding audio, pas un
cache disque). `import os` ajouté au fichier : nécessaire pour écrire `.media` en syntaxe
implicite-membre, même si le fichier `import MeeshySDK` (où `Logger.media` est déclaré) — miroir
exact du précédent déjà établi dans `CameraView.swift` (Run #12), qui `import os` pour la même
raison malgré son propre `import MeeshySDK`/`MeeshyUI`.

**TDD** — même constat qu'aux 3 runs précédents : pas de seam pour forcer un vrai échec
`FileManager` en test unitaire portable. Nouveau fichier source-guard
`packages/MeeshySDK/Tests/MeeshyUITests/Media/MeeshyAudioSignatureTryOptionalLoggingSourceGuardTests.swift`
— réutilise le helper PARTAGÉ `ComposerSourceGuard.packageRoot`/`stripComments` déjà établi
(`Tests/MeeshyUITests/Story/Controls/ComposerSourceGuard.swift`) plutôt que de dupliquer la
résolution de chemin `#filePath`, contrairement aux gardes app-side précédentes qui n'avaient pas
cet équivalent partagé côté `Meeshy`/`AppSourceGuard`. 2 tests : zéro `try?` restant dans le
fichier, exactement 2 occurrences de `removeItemLogging` (les deux sites, pas seulement un — garde
contre une conversion partielle). RED confirmé pour la bonne raison avant le fix (`try?` encore
présent, `removeItemLogging` absent).

**Incident rencontré en cours de route, résolu par coordination cross-session plutôt que par un fix
local** : `./apps/ios/meeshy.sh build` a d'abord échoué — mais pour une raison ENTIÈREMENT sans
rapport avec ce diff. `RiverLaneResolver.swift` (chantier « Rivière » d'une autre session Claude,
mergé sur `main` juste avant que ce run fetch) déclarait 2 `static let ISO8601DateFormatter` sans
annotation de concurrence, rejetées par Swift 6 (« not concurrency-safe because non-Sendable type
… may have shared mutable state »). Confirmé indépendamment avant d'agir : le code fautif existait
déjà tel quel sur `origin/main` (`git show origin/main:...` — pas introduit par ce diff), et `gh run
list --branch main` montrait plusieurs runs `ci.yml` consécutifs `cancelled` (jamais menés à terme,
la branche `main` très active de cette session multi-agents annulant les runs les uns après les
autres) — donc aucune confirmation CI n'avait tranché avant ce run local. Pendant l'investigation,
un message cross-session de la session « Refactoriser audio Focal et header des modes » a confirmé
avoir DÉJÀ réparé exactement ce défaut sur `main` (`nonisolated(unsafe)` sur les deux formatters,
même patron déjà établi dans `SocialSocketManager`/`MessageSocketManager`/`APIClient`/
`NotificationModels`/`MessageModels`/`MessageService` — un ISO8601DateFormatter en lecture seule
après configuration est thread-safe en pratique). Plutôt que de dupliquer le correctif : `git
checkout --` sur mon `project.pbxproj` régénéré localement (stale — `origin/main` en avait déjà une
version à jour incluant les références `RiverLaneResolver.swift`/`RiverLaneVectorTests.swift`),
`git fetch origin main`, `git stash push -u` du travail en cours, `git rebase origin/main` (propre,
zéro conflit), `git stash pop` (propre). Rebuild confirmé vert. Accusé de réception envoyé au pair
via `SendMessage`. Aucune ligne de ce diff ne touche `Riviere/` ni la casse en question.

**Vérification** :
- Test ciblé SDK, lancé depuis `packages/MeeshySDK/` (PAS la racine du repo — le premier essai
  `xcodebuild test -scheme MeeshySDK-Package` depuis la racine échoue avec « does not contain an
  Xcode project, workspace or package », le `Package.swift` vivant dans le sous-dossier ; nouveau
  piège d'environnement à retenir, distinct des pièges de disque/simulateur déjà documentés) :
  `xcodebuild test -scheme MeeshySDK-Package -only-testing:MeeshyUITests/
  MeeshyAudioSignatureTryOptionalLoggingSourceGuardTests -derivedDataPath Build` → `** TEST
  SUCCEEDED **`, 2/2 verts.
- `./apps/ios/meeshy.sh build` (après rebase sur le fix upstream) → `Build succeeded in 57s`, un
  seul warning pré-existant sans rapport (`iPadRootView+Navigation.swift:458`, variable non lue).
- Suite `MeeshyUITests` complète non relancée ce run (le test ciblé + le build app suffisent à
  couvrir la garde de source + la non-régression de compilation ; `MeeshyMediaBrandingGeometryTests`
  — les tests de timing purs du même fichier — n'a aucune dépendance sur les 2 lignes modifiées).
- Branche `claude/apps/ios/debt-meeshyaudiosignature-try-optional-logging` créée EN PREMIER, avant
  toute édition. Zéro churn `project.pbxproj` dans le diff final (le fichier neuf de test est sous
  `Tests/`, pas `Sources/` — SPM n'a pas besoin d'un pbxproj Xcode pour ses propres cibles de test,
  seul `apps/ios/Meeshy.xcodeproj` en a un, et rien n'y a été ajouté par ce diff).

- `tasks/lane-cursor.md` → `lane=IOS_DETTE android_streak=0
  last_run=ios-debt-meeshyaudiosignature-try-optional-logging` (commit séparé, poussé directement
  sur `main`, jamais mélangé au diff `packages/MeeshySDK`).

**Nouveau piège d'environnement noté pour un futur run** : `xcodebuild -scheme MeeshySDK-Package`
doit être lancé depuis `packages/MeeshySDK/` (où vit `Package.swift`), jamais depuis la racine du
repo — contrairement aux commandes `apps/ios/meeshy.sh`/`xcodebuild -project
apps/ios/Meeshy.xcodeproj`, qui tournent bien depuis la racine.
