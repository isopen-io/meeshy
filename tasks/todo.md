# Remédiation complète iOS — suivi (2026-07-20)

Spec : `docs/superpowers/specs/2026-07-20-ios-full-remediation-design.md`
Plan détaillé : `docs/superpowers/plans/2026-07-20-ios-full-remediation.md`

## Vague 1 — lanes parallèles (fichiers disjoints, worktrees) — ✅ MERGÉ sur main

- [x] **Lane GW** — gateway notifications : GW1 posts câblés (fix majeur) · GW2 friendContentEnabled · GW3 mute fan-out · GW4 threadId/category · GW5 payload enrichi (createdAt/messageType/traduction Prisme) · GW6 appels (callsEnabled, fallback no-voip, stale-foreground) · GW7 pushSent/showPreview/DND timezone
- [x] **Lane P-X** — présence 1/3/5 hors iOS : PX1 shared TS (recent→idle, garde 5 min) · PX2 web (maps, gating, labels, dédup users.service) · PX3 Android miroir · PX4 heartbeat gateway lastActiveAt
- [x] **Lane P-iOS** — présence iOS : PI1 PresenceModels/PresenceStyle · PI2 PresenceManager 30 s + flips · PI3 surfaces labellisées (badge story, identity bar, a11y)
- [x] **Lane N-iOS** — notifications iOS : NI1 busy_timeout+protection fichier · NI2 clé E2EE NSE · NI3 prePersist typé média · NI4 handler fiable + reply durable outbox · NI5 commenter depuis notifs sociales (threading : réponse→commentId, nouveau post→racine) · NI6 actions ami réelles + split catégories CALL · NI7 retry VoIP token + retrait FirebaseMessaging
- [x] **Lane GWF** (follow-up gateway) — commentId/friendRequestId dans le data des pushes sociaux/ami (mergé avec résolution manuelle de conflit sur NotificationService.ts)

Corrections trouvées en vérifiant réellement (pas l'exit code) après merge : compile Swift 6 `NSEDecryptor` (statics nonisolated sous SWIFT_DEFAULT_ACTOR_ISOLATION=MainActor) · clé xcstrings morte `story.groupIntro.recent` (renommage recent→idle).

Vérifié vert : shared 47/47 (1382 tests) · gateway 536/536 (14424 tests, 1 flake ponctuel non reproduit au 2e run) · web présence 16/16 (294 tests) · iOS `meeshy.sh test` phase1 1510/1510 + phase2 2403/2403 + phase3 1/1.

## Vague 2 — Lane AV (avatars/bannières) — ✅ MERGÉ sur main (partiel)

- [x] **Lane AV** — 7/12 sites câblés (commit d1ea9c69c) ; 5 restants bloqués par des lanes B pas encore lancées : `ConversationListHelpers.swift:276`, `CallView.swift:355,1730,1777`, `StoryViewerView+Content.swift:1904` — à câbler quand les lanes B propriétaires (B8 Images/viewers, B10 Pièces jointes, B13 Appels, B18 Liste conv-vues, B6 Stories) auront tourné

## Vague 3 (B1-B5) — ✅ MERGÉ sur main

- [x] **B1 Auth & session**, **B2 Profil/avatar/queue**, **B3 Liste conversations — données**, **B4 Conversation ouverte — VM/envoi**, **B5 Feed social** — tous mergés (commits e2507c6cd, f0716f23d, ad6ba7592, bf880ddff, a3a47fbb2). Conflits non triviaux résolus manuellement (vérification ligne par ligne, jamais de choix mécanique) : B2 (préservation `''` customDestinationLanguage + test helper), B3 (2 fonctions SDK complémentaires + doc recalée + 6 tests fusionnés), B4 (helper de langue dupliqué unifié sur le meilleur + `onReply` retiré — référençait une propriété inexistante, aurait cassé la compile), B5 (fragment de code orphelin écarté + vrai fix de durabilité réappliqué au bon endroit).

## Intégration — ✅ terminée pour Vague 1+2+3

- [x] Reviews adversariales Vague 1 + Vague 3 + fixes confirmés
- [x] Merges Vague 1 + GWF + AV + B1-B5 sur main
- [x] Build device (`./apps/ios/meeshy.sh device`) : 5 erreurs de compilation trouvées et corrigées post-merge (commits d06e98ea3, 16b5ed874, 16f4e1268) — pbxproj périmé (xcodegen), 2× isolation Swift 6 (OutboxDispatcher, même classe que NSEDecryptor), 1× argument obsolète (ProfileUserPostsList→FeedPostCard, code mort pré-existant), 1× import manquant (AttachmentUploaderTests), 1× régression test (pollution cache singleton CacheCoordinator entre tests, démasquée par le fix B3 fetch-then-replace)
- [x] Vérif finale : `meeshy.sh test` 3 phases **toutes vertes** (1536+2456+1 tests, 0 échec)

## Vague 4 (B6-B11) — ✅ MERGÉ sur main

- [x] **B6 Stories**, **B7 Réels/vidéo**, **B8 Images & viewers SDK**, **B9 Audio SDK**, **B10 Pièces jointes**, **B11 Surfaces secondaires offline** — tous mergés (commits 81fa7a3c9, 9e5e7aaac, 6be904e01, bfebd25e4, 7677fc565, a236b3269), tous fast-forward/clean (0 conflit — les 6 lanes avaient forké exactement de la pointe de main). Reviews adversariales : 2 P0 compile-breakers trouvés et corrigés en B11 (mutation actor-isolée hors acteur, appel MainActor synchrone depuis test non-@MainActor) ; plusieurs P1 réels corrigés (dédup self-echo commentaire story, watch-tracking vidéo mort sur MeeshyVideoPlayer+Renderers, ownsEngine jamais reset, CachedBannerImage pixelSize ignorait la largeur, langue audio auto-seedée pilotait la lecture à l'insu du Prisme, download bloqué en cas de perte de course, mime HEIC menteur sur échec, reply ThreadView perdue par un reseed de cache mal placé).
- Gaps documentés et assumés (hors scope lane, à reprendre en Vague 5+ si besoin) : durabilité OfflineQueue complète des réactions/commentaires story (nécessite OutboxKind, fichier d'une autre lane) ; 2/3 pipelines de publication morts non supprimés (nécessitent vérif compile) ; violation SDK purity pré-existante non-régressée dans MediaDownloadPolicy/CachedAsyncImage et ConnectionActionView (dette déjà là avant cette session, correction complète = refactor plus large hors périmètre) ; UserProfileSheet.swift envoie encore une demande d'ami en REST direct (hors fichiers de la lane B11).
- Post-merge, build réel (`meeshy.sh test`) a mis au jour 7 erreurs de compilation supplémentaires + 11 échecs de test réels, tous corrigés (commits 923574511, 98005b410, 2f75bb74a, 085ce9e02, c99d2015b) :
  - 3× nouvelle occurrence du piège Swift 6 SE-0466 (isolation MainActor par défaut) : `formatMediaFileSize` (MediaTypes.swift), `ReelEngineOwnershipPolicy.shouldRelease`, helper de test `makeEmptyResponse`/`AnyCodable` — portant le total à 8 occurrences identifiées cette session (NSEDecryptor, OutboxDispatcher, formatMediaFileSize, ReelEngineOwnershipPolicy, applyingStoryCommentAdded, reactionRollbackTarget, makeEmptyResponse + 1 test non marqué `try`)
  - pbxproj périmé (nouveau fichier `StoryNotificationOfflineContent.swift` non référencé) — xcodegen régénéré
  - **Root cause investigation** : 11 échecs de test story (100% dans 2 nouveaux fichiers) tracés à une limitation réelle de la technique « construire un `StoryViewerView` hors hiérarchie et lire son `@State` après un appel de méthode » — la valeur assignée après construction ne persiste PAS de manière fiable (confirmé empiriquement par un test diagnostique : écriture puis lecture immédiate, sans appel de méthode entre les deux, relit déjà la valeur par défaut). Le précédent cité par la lane n'exerçait en réalité jamais ce chemin. Fix : extraction de la logique pure de `applyStoryCommentAdded` et `sendReaction` en fonctions statiques testables (`applyingStoryCommentAdded`, `reactionRollbackTarget`), miroir du pattern déjà éprouvé `rollingBackOptimisticComment` ; 11 tests réécrits pour cibler ces fonctions pures directement.
  - 1× test source-guard à fenêtre fixe cassé par un ajout légitime de B7 (fenêtre élargie, pas de régression réelle)
- [x] Vérif finale post-Vague 4 : `meeshy.sh test` 3 phases **toutes vertes** (1541+2510+1 tests, 0 échec)

## Vague 5 — lot 1 (B12, B14, B17) — ✅ MERGÉ sur main

- [x] **B12 Réglages & préférences** — mergé (e0a0e732f) : 5 toggles privacy placebo grisés "Bientôt disponible" (+ 2 supplémentaires trouvés en review : allowContactRequests/allowGroupInvites, fixés en 66f83d35b) · picker "Langue de l'interface" mort retiré (real fix bloqué par MeeshyApp.swift, hors lane) · applyRemote respecte pendingCategories (fin de la race server-wins) · moteur auto-download mort supprimé · DnD hours via DatePicker · sync thème réconciliée après fetch.
- [x] **B14 Robustesse noyau** — mergé (a3ccd99de) : EmbeddableVideoResolver rejette tout videoId non-ASCII via `allSatisfy` (review a trouvé et corrigé un bug réel : l'implémentation initiale utilisait `prefix` qui ne fait que tronquer, acceptant un id partiellement invalide — fix en b210cde32) + encode `/` dans le segment de chemin (traversal via videoId) · fallback in-memory AppDatabase logue l'échec de migration · TextAnalyzer annoté `@MainActor` explicite (`@unchecked Sendable` retiré). NOTE : réponse notification lock-screen (try? silencieux) déjà traitée par la lane N-iOS (Vague 1) — non retouchée.
- [x] **B17 Détail message & SSOT helpers** — mergé (d0e297dae) : MessageDetailSheet a11y complète (22 boutons) + LanguageDisplay SDK (fin table 18-langues dupliquée 3x) · GlobalSearchView/ParticipantsView délèguent à RelativeTimeFormatter · ClipInspector délègue à TransportBar.formatTime · ConversationOptionsViewModel utilise MeeshySDK.LoadState. 0 finding en review (2 lentilles).
- [x] xcodegen regen post-merge (nouveaux fichiers de test) — CURRENT_PROJECT_VERSION restauré 1254 (da6df4593)
- [x] Post-merge, 3 tours de compile/test réels ont mis au jour 5 bugs supplémentaires, tous corrigés :
  - `MeeshySDK.LoadState` ambigu (le module `MeeshySDK` contient aussi un enum top-level `MeeshySDK` namespace — la qualification complète résolvait vers `MeeshySDK.MeeshySDK.LoadState`, inexistant) — 2 sites (ConversationOptionsViewModel.swift + son test), corrigé en `3acabe4e5`
  - `comingSoonPrivacyKeyPaths: Set<AnyKeyPath>` marqué `nonisolated` alors que `AnyKeyPath` n'est pas `Sendable` — `nonisolated(unsafe)` (constante littérale immuable), même commit
  - `settings.interface_language` devenu orphelin après le retrait du picker par B12 — supprimé du catalogue xcstrings (édition chirurgicale 35 lignes, JSON validé), corrigé en `2d9016e4b`
  - 2 tests B17 (`GlobalSearchViewTimeAgoTests`, `ParticipantsViewRelativeTimeTests`) assertaient des chaînes françaises codées en dur ("maintenant", "il y a 5 min") — invalide dans ce test target qui tourne avec le vrai bundle app sous la locale simulateur (anglaise ici), contrairement au test target SDK où l'absence de bundle fait retomber déterministiquement sur le `defaultValue` français. Réécrits en assertions de délégation/structure locale-indépendantes, même commit.
  - Piège méthodologique noté : un premier run tué par un double-backgrounding accidentel (`&` + `run_in_background`) a produit des diagnostics de compile fantômes/contradictoires (fichier lu correct mais erreurs incohérentes) — un `meeshy.sh clean` a tranché en confirmant que seules 2 erreurs étaient réelles, le reste était un artefact de build interrompu.
- [x] Vérif finale : `meeshy.sh test` 3 phases **toutes vertes** (1555+2544+1 tests, 0 échec)

## Vague 5 — lot 1, reprise B13/B15/B16 — ✅ MERGÉ sur main, vérifié vert

- [x] **B13 Appels retry/privacy** — canRetryCall gaté sur l'identité de l'appel terminé · alerte privacy screen-recording en vidéo · pill minimisée visible + durée corrigée · endedView (Close, couleur sémantique, plus de try?) · 3e appel supplanté → emitCallReject · toast toggleVideo localisé · BubbleCallNoticeView Reduce Motion + isDark · IslandEmergingBanner conservé (item 8 audité : décision documentée du 2026-07-13 de le garder en réserve).
- [x] **B15 Profil sheet SDK** — UserProfileSheetViewModel extrait app-side (SDK purity), sendFriendRequest via outbox, 4 catch{} vides → logging+états distincts, ProfilePostRow re-render gate corrigé, locale réelle pour date d'inscription/last-seen. + 3 correctifs de continuation (loadProfile TTL cache sur hit `.fresh`, profileLoadFailed câblé dans detailsTab, ProfilePostRow.isDark ajouté à l'Equatable).
- [x] **B16 i18n/catalogues** — MeeshyWidgets String Catalog créé, MeeshyUI 112 clés fr-only traduites, Siri/App Intents localisés, MessageTextRenderer Dynamic Type, notification.audio_voice_message.body corrigé, developmentLanguage aligné fr, pluriels réels, emailVerification traduit. + 2 correctifs de continuation (pluriel compteur non-lus, stubs VideoTransportControls/Siri).
- **Incident majeur (résolu)** : après le merge initial, `main` local a été réinitialisé sur `origin/main` (`git reset --hard`, hors de mon contrôle), effaçant B12-B17 + B13/B15/B16 (jamais poussés vers origin). Rien perdu (commits toujours en objets git) — consolidé via branche de sauvegarde mergée sur le nouveau main + cherry-pick des commits de continuation trouvés dans les worktrees de récupération de l'utilisateur.
- **Root cause du blocage de build (résolu)** : 4 clés du catalogue `MeeshyUI/Resources/Localizable.xcstrings` étaient composées uniquement de spécificateurs de format et de ponctuation, sans AUCUN caractère alphabétique (`%@  %@`, `%@ / %@`, `%lld %@`, `%@, @%@`) — le générateur de symboles Swift d'Xcode (`GenerateStringSymbols`, invoqué automatiquement pour toute cible ayant un `.xcstrings`) ne peut dériver aucun nom de symbole depuis ces clés et **plante toute la compilation de la cible MeeshyUI** au lieu de les ignorer silencieusement (bug/limite Xcode, pas du code applicatif). Symptôme trompeur : `xcodebuild` échouait avec des erreurs `lstat: No such file or directory` sur les artefacts `.swiftmodule`/`.swiftdoc`/`.abi.json` de MeeshyUI, sans qu'aucune ligne "Compiling" n'apparaisse pour ses fichiers Swift — la vraie erreur `GenerateStringSymbols` était noyée dans le log verbeux. Diagnostiqué en buildant le scheme `MeeshyUI` isolément (`xcodebuild build -scheme MeeshyUI` depuis `packages/MeeshySDK`), qui affiche l'erreur clairement au lieu de la masquer. **Fix** : 3 sites de code convertis en `Text(verbatim:)`/`String(...)` pour du contenu non-traduisible (nom natif de langue + drapeau, display name + @handle, valeur+libellé déjà traduit) qui n'a pas besoin d'entrer dans le catalogue ; 1 clé orpheline (`%@ / %@`, aucun site d'appel vivant trouvé) supprimée chirurgicalement. **À retenir pour l'avenir** : si `meeshy.sh test`/`clean`/`clean --deep` échouent à l'identique malgré plusieurs cycles complets, tester le scheme MeeshyUI isolément AVANT de soupçonner le cache/l'environnement — le symptôme `lstat` sur les artefacts d'une cible SPM imbriquée peut cacher une vraie erreur de compilation de ressources (xcstrings) noyée dans un log très verbeux.
- [x] Merge d'un conflit de merge externe actif (`.git/MERGE_HEAD`, PR #2181/itération 194i accessibilité `MessageDetailSheet.swift`) — 3 hunks résolus en gardant HEAD (sur-ensemble strict de l'autre côté).
- [x] Post-fix, `meeshy.sh test` a révélé 5 échecs de test réels (pas des régressions de code, des tests obsolètes/à fenêtre trop courte) : fenêtre fixe de `CallViewAccessibilityTests.audioDurationCapsuleVicinity` (600→1900 chars, un commentaire d'une doctrine a11y externe 206i/210i/211i poussait l'assertion hors fenêtre — même piège que `ConversationMediaGalleryVideoControlsTests` en Vague 4) · un test vérifiant `children: .combine` alors que le code utilise désormais délibérément `.ignore` (doctrine documentée en commentaire, statusPill surface déjà l'état signal séparément) → test renommé et réécrit pour vérifier le comportement actuel · clé xcstrings `message-detail.a11y.retranslate` incohérente avec la convention `{section}.{action}` du fichier → renommée `message-detail.a11y.language.retranslate`.
- [x] Worktrees + branches de lane nettoyés (B12-B17 + B13/B15/B16 + récupération) après vérification merged/clean.
- [x] **Vérif finale : `meeshy.sh test` 3 phases toutes vertes (1558+2544+1 tests, 0 échec)**

## Vague 5 — lot 2a (B18, B19, B20) — ✅ MERGÉ sur main, vérifié vert

- [x] **B18 Liste conversations — vues, rows & présence** — distinction .idle/recherche-vide dans la branche vide · pastilles présence rafraîchies via signal ciblé (presenceVersion débouncé), composé proprement avec le travail P-iOS déjà mergé sans le retoucher · onLoadPreview limité aux 20 premières rows visibles · NewConversationViewModel distingue échec réseau de 0 résultat · label VoiceOver + tick minute pour horodatage relatif.
- [x] **B19 Bulles — Equatable & drapeaux** — gate Equatable de ThemedMessageBubble complété (mentionDisplayNames, allAudioItems) · slot deviceLocale ajouté à la bande de drapeaux (4e axe Prisme étendu).
- [x] **B20 Deep links & join flow** — alias court `meeshy://c/<id>` géré (était silencieusement droppé) · messages d'erreur join flow/registration localisés (5 langues) au lieu du français codé en dur.
- [x] 0 conflit de merge (fichiers disjoints confirmés), xcodegen regen (nouveaux fichiers de test) + CURRENT_PROJECT_VERSION restauré, worktrees/branches nettoyés.
- [x] **Vérif finale : `meeshy.sh test` 3 phases toutes vertes (1558+2587+1 tests, 0 échec)**

## Vague 5 — lot 2b (B21, B22, B23) — ✅ MERGÉ sur main, vérifié vert — **DERNIER LOT DE LA VAGUE 5**

- [x] **B21 Perf divers** — iPadRootView n'observe plus NetworkMonitor.shared sans jamais le lire (re-render inutile à chaque flap réseau) · Timer.publish().autoconnect() de SyncPill/ConversationScrollControlsView stabilisé (fini le gel des animations de points à chaque re-init du parent).
- [x] **B22 Tests couverture factice & skips permanents** — AuthServiceTests.swift : 21/24 tests tautologiques remplacés par une vraie couverture d'AuthManager via son seam authService ; AuthManagerRefreshTests.swift : seam KeychainStoring en mémoire injecté, retrait des 2 XCTSkipIf(true) permanents ; source-guards WebRTC/CallsTab passés du silent-skip au XCTFail loud ; 4 tests "Covered by Phase 4 XCUITest" (cible inexistante) remplacés par une vraie couverture unitaire ; StoryCanvasSnapshotTests réactivé avec swift-snapshot-testing (+ import manquant corrigé et vraies baselines enregistrées en continuation).
- [x] **B23 Tests CI/hygiène** — ios-tests.yml : benchmarks XCTMetric gated + grant photos-add pour le guard caméra ; 3 tests flaky wall-clock (#1869) remplacés par horloge injectable ; 6 artefacts de test morts supprimés ; 52 fonctions SDK renommées vers la convention test_{method}_{condition}_{expectedResult} (AuthManagerRefreshTests.swift exclu comme demandé, possédé par B22).
- [x] Merge d'un fix de continuation B18 arrivé après coup (worktree recréé automatiquement pour un stage "Fix" encore en vol) : 3 bugs réels trouvés en review adversariale — enableAutoPreviewLoad classé contre la liste brute non filtrée au lieu de l'ordre de rendu réel (starvation du preview pour les vues sectionnées/filtrées) · emptyBranch résolvait le texte de recherche avant loadState (un état encore en chargement affichait "aucun résultat" au lieu du skeleton) · requête de recherche utilisateur (PII) loguée en clair → `.private`.
- [x] 0 conflit de merge (fichiers disjoints confirmés, exclusion AuthManagerRefreshTests.swift respectée par B23), xcodegen regen (retire les références pbxproj des fichiers morts supprimés) + CURRENT_PROJECT_VERSION restauré, worktrees/branches nettoyés.
- [x] Post-merge, 3 bugs réels supplémentaires trouvés et corrigés en vérifiant réellement (pas l'exit code) :
  - **Catch non-exhaustif** : 2 blocs `catch let error as MeeshyError` dans AuthServiceTests.swift (réécrit par B22) sans `catch` générique de repli — exige `throws` sur la fonction englobante. Fix : ajout du catch exhaustif (commit `4643dbfd4`).
  - **Crash SIGABRT réel (régression externe, pas une lane)** : `CallTranscriptionService.stopLocalCapture()` touchait inconditionnellement `AVAudioEngine.inputNode` même quand la capture n'avait jamais démarré — accéder à `.inputNode` pour la première fois active paresseusement la session audio du process, ce qui est sans risque sur device mais **crash non-rattrapable dans l'hôte de test** (pas d'entitlement micro/matériel). Révélé par un commit externe récent (`resetForCallEnd persists a guarded speaker-resolved transcript snapshot`) qui a ajouté la première couverture de test exerçant `stopTranscribing()` depuis un état "jamais démarré" (appel entrant reçu seul, jamais transcrit localement). Fix : flag `isCaptureActive`, mis à `true` seulement après succès de `audioEngine.start()`, gardant tout le corps de `stopLocalCapture()` (commit `38dda8190`).
  - **Pollution asynchrone inter-tests (root cause la plus subtile de tout le chantier)** : `test_refreshSession_authFailure_requiresReauthentication` et `test_refreshSession_withoutActiveSession_throwsSessionExpired_withoutCallingService` échouaient de façon *order-dependent* dans la suite complète mais passaient en isolation — piège classique de faux-négatif si on ne teste qu'en isolation. Root cause : `AuthManager.handleUnauthorized()` déclenche une `Task` fire-and-forget à chaque 401 (y compris depuis une activité SANS RAPPORT — upload E2EE, prefetch de story — qui touche le même singleton `AuthManager.shared`), laissant `tokenRefreshTask` non-nil ; le garde de sérialisation de `refreshSession(force:)` (`if let task = tokenRefreshTask { return try await task.value }`) fait alors que le test SUIVANT attend silencieusement le résultat de cette tâche fantôme au lieu d'évaluer son propre scénario. Reproduit de façon fiable en isolant la classe de test complète (`xcodebuild test-without-building -only-testing:MeeshyTests/AuthServiceTests`). Fix : seam de test dédié `cancelPendingTokenRefreshForTesting()` (miroir du pattern `setTranscribingForTesting` déjà établi), câblé dans `setUp()`/`tearDown()` (commit `4d8805e6c`).
- [x] **Vérif finale de TOUTE LA VAGUE 5 : `meeshy.sh test` 3 phases toutes vertes (1560+2589+1 tests, 0 échec)**

## 🏁 VAGUE 5 COMPLÈTE (B12-B23, 163 défauts d'audit) — TERMINÉE ET VÉRIFIÉE VERTE

Les 12 lanes de l'audit transverse (B12 Réglages, B13 Appels, B14 Robustesse noyau, B15 Profil sheet SDK, B16 i18n, B17 Détail message/SSOT, B18 Liste conversations vues, B19 Bulles, B20 Deep links, B21 Perf divers, B22 Tests couverture, B23 Tests CI) sont toutes mergées sur `main` local et vérifiées vertes via `meeshy.sh test` (3 phases, run final : 4150 tests, 0 échec). Combinées aux Vagues 1-4 (notifications, présence, avatars, auth/session, feed social, stories/réels/médias/pièces jointes/surfaces offline), **l'intégralité du plan de remédiation iOS de cette session est terminée**.

**Incidents majeurs surmontés pendant ce chantier** (documentés en détail dans les sections ci-dessus, à consulter en cas de récidive) :
1. Rebase/reset externe de `main` local ayant temporairement effacé le lot 1 + sa reprise (rien perdu, tout consolidé).
2. Bug de build silencieux (`GenerateStringSymbols` d'Xcode plantant sur des clés xcstrings 100% placeholders) — diagnostiqué via build isolé du scheme MeeshyUI.
3. Crash SIGABRT AVAudioEngine (régression externe indépendante des lanes).
4. Pollution asynchrone inter-tests via une Task fire-and-forget partagée sur un singleton.

**Activité externe concurrente notée tout du long** : un ou plusieurs processus automatisés (itérations d'accessibilité 194i→211i+, PRs de qualité web/CI) ont continué à merger sur `main` pendant tout le chantier — fichiers disjoints des lanes de cette session dans tous les cas rencontrés, gérés au fil de l'eau (conflits de merge résolus, réviosions de tests obsolètes alignées sur les nouvelles doctrines documentées).

- [ ] Doc/mémoire présence (CLAUDE.md, mémoire) — reste à faire si souhaité, hors scope immédiat de la remédiation technique
- [ ] **Push vers origin/main** : **NE PAS FAIRE sans confirmation explicite de l'utilisateur** — `origin/main` a divergé de `main` local pendant ce chantier (incident de reset documenté ci-dessus) ; un push nécessite d'abord de clarifier avec l'utilisateur la stratégie de réconciliation souhaitée (rebase, merge, ou push direct s'il confirme que l'état actuel de `main` local est bien ce qu'il veut publier)

## Annexe B — audit transverse (163 défauts dédupliqués → 23 lanes ; backlog complet : tasks/audit-backlog-2026-07-20.md + tasks/audit-notes-2026-07-20.md)

Top risks Vague 1 (résolus) : P0 magic link connecté = fuite inter-comptes · P0 changement d'avatar 100% cassé · P0 édition profil offline → 404 infini · P1 clés E2EE survivantes au logout · P1 pullToRefresh détruit L1+L2 avant fetch.

## Review — chantier complet (Vagues 1-5)

**Ampleur** : 163 défauts d'audit + notifications/présence/avatars (demande initiale) répartis sur 23 lanes B + 5 lanes Vague 1 + 1 lane Vague 2, exécutés via workflows multi-agents en pipeline (implémentation TDD → review adversariale 2 lentilles → fix des findings confirmés), en worktrees git isolés, mergés par lots pour limiter l'empreinte disque.

**Qualité du processus** : chaque merge vérifié pour fraîcheur/disjonction avant fusion ; chaque lot suivi d'un `meeshy.sh test` complet réel (jamais l'exit code seul) ; tout échec post-merge diagnostiqué à la source (lecture du code réel, jamais de correctif à l'aveugle) avant correction. Plusieurs bugs réels (pas seulement des piètres de compilation) ont été trouvés et corrigés grâce à cette discipline de vérification systématique — le chantier aurait pu se déclarer "terminé" prématurément à plusieurs reprises si seul l'exit code du merge avait été considéré.

**Dette assumée / hors scope** (documentée par les lanes elles-mêmes, à reprendre si besoin) : traduction des aperçus long-press dans la liste de conversations (nécessite des fichiers d'une autre lane) ; kind outbox `.createConversation` mort non retiré ; quelques gaps de durabilité OfflineQueue pour réactions/commentaires story ; refactor SDK purity plus large pour MediaDownloadPolicy/CachedAsyncImage (dette pré-existante, non régressée).

---

# Cohérence du routage des notifications (in-app + push iOS) — 2026-07-23

## Symptôme rapporté
Notification de **commentaire sur un réel** → l'ouverture mène à **une story sans rapport**.

## Cause racine (prouvée par lecture du code)

1. `POST /posts/:postId/comments` (`services/gateway/src/routes/posts/comments.ts:246`) appelle
   `createStoryCommentNotificationsBatch` pour **tout** post commenté (pas seulement les stories).
   Ce batch émet des notifications de type `story_thread_reply` / `friend_story_comment`
   **même pour un RÉEL**, en portant le vrai discriminant dans `metadata.postType = "REEL"`.
2. Côté iOS, `RootView.navigateFromNotification` traitait
   `.storyNewComment / .friendStoryComment / .storyThreadReply` par une branche **hard-codée story**
   qui n'appelait JAMAIS `NotificationContentRouter` et ignorait `ctx.postType` :
   → `router.push(.storyNotificationTarget(storyId: <id du réel>))`
   → le viewer de story s'ouvrait sur un id qui n'est pas une story.

Le web (`apps/web/utils/notification-helpers.ts:152`) faisait déjà la bonne chose
(`metadata.contentType ?? metadata.postType` d'abord, type de notif seulement en repli) :
c'est iOS qui divergeait de la source de vérité.

## Défauts connexes de la même famille (métadonnées incohérentes / non lues)

| # | Emplacement | Défaut |
|---|---|---|
| A | `NotificationService.createFriendContentNotificationsBatch` | n'écrivait que `metadata.contentType`, jamais `postType` → `data.postType` du push vide → un **réel d'ami** ouvrait `postDetail` au lieu du viewer immersif |
| B | `NotificationService.createCommentLikeNotification` | aucun `postType` → `comment_like` sur réel/story mal routé |
| C | `NotificationService.createNotification` (push data) | `data.postType` ne retombait pas sur `metadata.contentType` |
| D | `iPadRootView+Navigation` | mêmes branches story hard-codées + logique dupliquée `isStoryPost` au lieu du routeur partagé |
| E | SDK `SocketNotificationMetadata` | pas de `contentType` → le toast socket `friend_new_*` sans discriminant |
| F | `NotificationNavContext` (3 inits) | lisait `postType` seul, jamais `contentType` |
| G | `user_mentioned` hors conversation | `createPost/CommentMentionNotificationsBatch` n'émettent qu'un `postId` ; iOS ne routait ce type que par `conversationId` → **tap sans effet** pour toute mention faite dans un post ou un commentaire (le web, lui, routait correctement) |
| H | les 2 batchs de mention | n'émettaient aucun `postType` → mention dans le commentaire d'un réel mal routée |

## Plan

### Gateway (source des métadonnées)
- [x] `createFriendContentNotificationsBatch` : écrire `metadata.postType` à côté de `contentType`
- [x] `createCommentLikeNotification` : accepter + persister `postType` ; appelant le fournit
- [x] `createNotification` : `data.postType` retombe sur `metadata.contentType`
- [x] Tests jest correspondants

### iOS (décision de surface — source de vérité unique)
- [x] `NotificationContentRouter` : accepter `contentType` en second discriminant, couvrir TOUS les types sociaux
- [x] `RootView.navigateFromNotification` : toutes les branches sociales passent par le routeur
- [x] `iPadRootView+Navigation` : `isStoryPost` supprimé, routeur partagé
- [x] `NotificationNavContext` : `postType ?? contentType` pour les 3 sources
- [x] Tests XCTest correspondants

### SDK
- [x] `SocketNotificationMetadata.contentType` + `SocketNotificationEvent.postType = postType ?? contentType`
- [x] `NotificationPayload` : lire `contentType` en repli de `postType`

## Review

**Gateway** — `createFriendContentNotificationsBatch` écrit `metadata.postType = contentType` en
plus de `contentType` (rétro-compat web conservée) ; `createCommentLikeNotification` accepte et
persiste `postType`, renseigné par `CommentReactionService` depuis `post.type` ;
`createNotification` fait retomber `data.postType` du push sur `metadata.contentType`.

**SDK** — `SocketNotificationMetadata.contentType` ajouté, `SocketNotificationEvent.postType`
résout `postType ?? contentType`, `NotificationPayload.postType` lit les deux clés du push.

**iOS** — `NotificationContentRouter.surface(postType:contentType:notificationType:storyLifecycleHint:)`
devient la source de vérité unique ; `RootView.navigateFromNotification` route les 5 familles
sociales via `socialSurface(_:postId:)` avec l'intent story dérivé du type
(`.comments` / `.reactions` / `.view`) ; `iPadRootView+Navigation` délègue au même routeur
(les réels y ouvrent `postDetail`, faute de viewer immersif, mais ne partent plus jamais vers
le viewer de story) ; `NotificationNavContext` lit `postType ?? contentType` sur les 3 sources.

**Mentions (défauts G/H)** — les 2 batchs de mention acceptent et persistent désormais `postType`
(renseigné par `routes/posts/comments.ts` et les 2 sites de `routes/posts/core.ts`), et
`RootView` fait retomber la branche message/mention sur la surface sociale quand la notification
ne porte pas de `conversationId` — une mention dans un post/commentaire n'est plus un cul-de-sac.

**Vérification**
- Gateway : `bun run test` — **81 suites / 1826 tests verts** (notifications, mentions, posts,
  routes commentaires), dont 9 nouveaux ; `tsc --noEmit` propre.
- Web : **15 suites / 338 tests verts** (contrat `contentType ?? postType` non régressé).
- iOS : `xcodebuild build-for-testing` **SUCCEEDED** puis `test-without-building` sur simu 18.2 —
  **21/21 `NotificationContentRouterTests` verts**, dont la non-régression exacte du bug rapporté
  (`story_thread_reply` + `postType REEL` → `.reel`).
- Vérification iOS faite dans un **worktree jetable sur HEAD** : le worktree principal était muté
  en parallèle par une autre session (refactor `DevicePermissions` à moitié appliqué), et HEAD
  lui-même ne compile pas (`AVAudioSession.requestMicrophonePermission` référencé par `0a66a536d`,
  helper `MicrophonePermission.swift` jamais committé) — neutralisé par un stub local jetable.

**Constat hors périmètre (non traité)** — sur Android, le tap d'une notification ne fait que
`markAsRead` : aucune navigation n'est implémentée (`NotificationsScreen.kt`). Ce n'est pas une
incohérence de routage mais une fonctionnalité absente ; la demande portait sur iOS.

**Note d'architecture (à conserver)** : le **nom du type de notification n'est pas un discriminant
d'entité**. `story_thread_reply` / `friend_story_comment` sont des types de *fan-out de commentaire*
émis pour n'importe quel contenu (post, réel, mood, story). Le seul discriminant fiable est
`metadata.postType` (ou `metadata.contentType` pour `friend_new_*`). Toute nouvelle surface cliente
DOIT passer par `NotificationContentRouter` (iOS) / `resolveContentRoute` (web).
