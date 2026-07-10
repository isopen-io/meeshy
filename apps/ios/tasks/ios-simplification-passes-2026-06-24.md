# iOS — Passes de simplification (audit 2026-06-24)

> Document de cadrage pour des **sessions dédiées**. Chaque passe = une branche/lot
> autonome avec son build + sa validation + son commit sélectif. Source : audit
> bugs/incohérences/simplifications du 2026-06-24 (5 agents, findings vérifiés au code).

## État au 2026-06-24

### ✅ Livré, vérifié, committé
- **Phase 1 — code mort** (`9a38751ce`) : ~700 lignes. TranslationResolver (type mort),
  8 méthodes mortes de `ConversationCommandHandler`, 6 `@Published` fantômes de
  `ConversationStateStore`, sections mortes de `ConversationView` (Date/Empty/Unread +
  overlay no-op), `RetryEngine`(SDK)+`MessageRESTSender` stub, mungers SDP morts
  (`addAudioRedundancy`/`enableSimulcast`), `WebRTCStubs.swift`. Build app + bundle
  de tests verts (`** TEST BUILD SUCCEEDED **`).
- **Phase 2 — bugs** (`8f4da5e0e`) :
  - **A1** — `NSEPendingPostConsumer`/`NSEPendingMessageConsumer` : suppression du
    fichier prefetché différée APRÈS decode+save/commit (était avant → perte de
    données sur échec). Payload corrompu nettoyé quand même.
  - **A3** — `BubbleContentBuilder.resolveEffectiveContent` : retrait du fallback
    Prisme qui affichait `preferredTranslation` quand aucune traduction ne matchait
    la langue active (violation règle #1). Retourne l'original. Test ajouté
    (`BubbleContentMatrixTests.test_resolveEffectiveContent_returnsOriginalWhenNoTranslationMatchesActive`,
    vert sur simu 18.2).
  - **A6** — `CallManager.applySurvivalVideoSend` : re-check `currentCallId` après
    les `await` (upgrade/downgrade + createOffer).

### Écartés / différés
- **A5 (deinit `nonisolated(unsafe)`) = FAUX POSITIF.** `storyPrefetchTask`/
  `groupingTask` sont des `Task<Void,Never>?` → **Sendable**, donc l'accès depuis le
  `nonisolated deinit` est légal sans annotation (seul `typingTimers: [Timer]`,
  non-Sendable, en a besoin — déjà annoté). Le build vert le confirme. Ne pas
  « corriger ».
- **A4 (`prefetchedMediaURLs` non borné) = différé.** Mineur : le doc-comment de
  `StoryViewModel` indique que le viewer gère déjà l'éviction via chargement à la
  demande ; la croissance du Set est bornée en pratique par le nombre de stories
  vues. Aucun seam logout/reset propre dans `StoryViewModel` pour vider le Set.
  À reprendre si un reset de session est introduit (vider dans ce reset).

---

## Conventions à respecter dans CHAQUE passe (rappel)
- **XcodeGen** : `apps/ios/project.yml` est la source de vérité. Tout ajout/suppression
  de fichier ou de cible → `cd apps/ios && xcodegen generate` AVANT `meeshy.sh build`
  (meeshy.sh ne lance pas xcodegen). NE PAS committer le churn pbxproj/xcscheme/
  Package.resolved ni les Info.plist auto-bumpés (`git checkout --` dessus). Commit
  **sélectif** des sources uniquement.
- **SDK purity** : un atome (formatter pur, paramètres opaques) → `packages/MeeshySDK`.
  Un composant qui orchestre/décide (cascade cache→downloader→policy, "quand faire X")
  → app. Cf. `packages/MeeshySDK/CLAUDE.md`.
- **Tests** : exécuter sur **simu 18.2** (UDID `30BFD3A6-…` est déjà en 18.2). Les
  runtimes 18.5+/26.x crashent au teardown xctest. `build-for-testing` puis
  `test-without-building -only-testing:…`.
- **Commits** : pas de trailer `Co-Authored-By` (préférence utilisateur).
- **Ne JAMAIS stripper un effet visuel** pour un micro-gain (préférence utilisateur).

---

## Passe C7 — Déduplication des formatters durée/bytes

### ⚠️ Correction de prémisse (vérifié 2026-06-24)
Ce ne sont **PAS** « 12 formatters identiques » mais **~25 sites DIVERGENTS**. Une
consolidation naïve casserait des affichages. Variantes constatées :
- **Unités** : `TimeInterval`/`Double` secondes · `Int` secondes · `Int`
  **millisecondes** (`formatDurationMs`, `formatDuration(milliseconds:)`) · `Float` secondes.
- **Padding minutes** : `%d:%02d` (non-paddé, majorité) vs `%02d:%02d` (paddé :
  `FloatingCallPillView:273`, `CallManager:2550`).
- **Heures** : `%d:%02d:%02d` quand h>0 (`CallModels:135`).
- **Précision sub-seconde** : `%d:%02d.%02d` (`TrackDetailPopover:231`).

### Sites (file:line)
**App** (`apps/ios/Meeshy`) : `MessageOverlayMenu:1453`, `MessageInfoSheet:492`,
`UniversalComposerBar+Recording:438`, `CameraView:221`, `MessageDetailSheet:2416`,
`RecentMediaStrip:307`, `ComposerModels:76`, `ConversationView+AttachmentHandlers:396`,
`AudioPostComposerView:514`, `FloatingCallPillView:273` (paddé), `ThemedConversationRow:580`
(`formatDurationMs`), `MagicLinkView:278`, `CallManager:2550` (paddé).
**SDK** (`packages/MeeshySDK`) : `VoiceRecordingView:233`, `StoryVoiceRecorder:164`,
`StoryAudioPanel:375`, `TrackDetailPopover:231` (précision), `TransportBar:32/45`,
`StoryAudioCell:205`, `ClipInspector:110`, `RulerView:60`, `MediaTypes:559`,
`MeeshyAudioEditorView:979`, `MeeshyVideoThumbnail:220` (ms), `UniversalAudioRecorderView:352`,
`VideoEditorTimeline:527`, `CallModels:135` (heures), `CallSummaryMetadata:136`,
`CoreModels:1168`, `FeedModels:88`.
**Bytes** : helper canonique déjà existant et testé → `AudioPlayerView.formatBytes`
(SDK, `MeeshyUI/Media/AudioPlayerView.swift:528`, `nonisolated public static`).
Doublons app à rebrancher : `UploadProgressBar:90`, `CallModels:144`.

### Approche (prudente)
1. Créer `packages/MeeshySDK/Sources/MeeshySDK/Utils/MeeshyDuration.swift` (atome,
   SDK purity) avec des fonctions **typées par variante**, ex :
   - `static func mmss(seconds: Int) -> String` → `%d:%02d`
   - `static func mmssPadded(seconds: Int) -> String` → `%02d:%02d`
   - `static func hmmss(seconds: Int) -> String` → heures si >0 sinon `mmss`
   - `static func mmss(milliseconds: Int) -> String`
   - overloads `Double`/`Float` qui délèguent à la variante `Int` après conversion.
   Tests purs (`MeeshySDKTests`) couvrant chaque variante + bornes (0, 59s, 60s, 1h).
2. Migrer **uniquement les sites dont l'unité ET le padding correspondent EXACTEMENT**
   à une variante. Laisser la précision sub-seconde (`TrackDetailPopover`) telle quelle
   (cas unique, pas de gain). Rebrancher `formatBytes` sur le helper SDK.
3. Vérifier chaque site migré : l'unité d'entrée (lire le call site, pas juste la déf).

### Vérification
- Build SDK + app verts (`xcodegen generate` non requis : pas d'ajout de fichier app,
  mais OUI requis car ajout d'un fichier SDK… non — SDK = SPM auto-glob, pas de
  xcodegen). Lancer les nouveaux tests `MeeshyDuration` + `build-for-testing`.
- **Visuel** : ouvrir un audio (mm:ss), un appel (pill paddée mm:ss + summary heures),
  un enregistrement vocal — vérifier l'identité d'affichage avant/après.

### Risque : Moyen. Valeur : DRY modérée, aucun bug corrigé.

---

## Passe C6 — `CommentSurfaceView` (extraction)

### Constat
Le composer de commentaire + reply banner + câblage `ThreadedCommentSection` est
~90 % identique entre `PostDetailView.swift` (~1930 l) et `FeedCommentsSheet.swift`
(~1573 l, qui contient DÉJÀ `CommentsSheetView` utilisé par Reels). Incohérence liée :
**B2** — `toggleCommentLike` (socket→REST fallback, timeout, `commentHeartInFlightIds`)
est dupliqué entre les deux surfaces (le like de POST est unifié via `post:liked`, mais
pas le like de COMMENTAIRE).

### Approche
1. Extraire `CommentSurfaceView(post:onCommentSent:)` (app-side — orchestration UX,
   pas SDK) regroupant : composer, reply banner, `ThreadedCommentSection`.
2. Extraire un `CommentLikeService`/méthode VM partagée pour `toggleCommentLike`
   (source unique). Consommé par PostDetail + sheet feed + sheet reels.
3. Remplacer les 3 usages.

### Vérification
- Build vert + tests existants (`PostDetailViewModelTests`, `FeedCommentsSheet*`,
  `ReelsViewModelTests`) verts.
- **QA visuelle** (device/simu) : poster un commentaire, répondre (reply banner →
  focus composer), liker un commentaire, depuis les 3 surfaces (détail post, sheet
  feed, sheet reels). Vérifier identité de comportement.

### Risque : Élevé (UI commentaires). Valeur : ~450 l dédupliquées, source unique like commentaire.

---

## Passe C4 — Split de `CallManager.swift` (2987 l)

### Constat
6 responsabilités séparables dans un seul fichier : (1) FSM appel + transitions,
(2) CallKit (`CallKitDelegateProxy` + transactions), (3) **session audio + routing**
(`configureAudioSession`/`applySpeakerRoute`/`deactivateAudioSession`/interruption/
route-change ~250 l), (4) **signaling socket** (`setupSocketListeners` ~165 l + emit
helpers + retry backoff), (5) monitoring (network/thermal/screen-capture/background
~200 l), (6) PiP.

### Approche
1. Extraire `CallAudioSessionController` (responsabilité 3) — atome paramétré → candidat
   SDK SI agnostique, sinon app. Probablement **app** (lit `RTCAudioSession`, encode des
   règles produit Mac/CallKit). Protocole `CallAudioSessionControlling` d'abord (TDD iOS).
2. Extraire `CallSignalingCoordinator` (responsabilité 4) — app.
3. `CallManager` délègue ; comportement strictement préservé.

### À folder dans cette passe (findings liés au même fichier)
- **B3** — `toggleTranscription` (`CallManager:1394`) : langues hardcodées `"fr"` →
  résoudre via `resolveUserLanguage()`/`preferredContentLanguages` (Prisme).
- **Code mort** — `emitCallEnd(callId:toUserId:)` (`CallManager:2541-2543`, 0 appelant)
  + le commentaire `_ = userId` (l.1167). **Supprimé** (audit calling-stack 2026-07-01) —
  au passage, `endCall()` ne gate plus l'émission de `call:end` sur `remoteUserId`
  non-nil (le guard `if let callId, let userId` ne servait qu'à justifier la
  référence morte à l'API legacy).
- **Transcription unidirectionnelle** — `WebRTCService.createTranscriptionChannel()`
  n'était jamais appelé côté offerer (seul le receiver câble via `didOpen`).
  **Décision produit tranchée (2026-07-10)** : supprimée plutôt que réparée — au-delà
  du canal jamais créé côté offerer, l'UI (`showTranscript`) n'avait aucun déclencheur
  atteignable, `requestPermission()` n'était jamais appelé, et `appendLocalAudioBuffer`/
  `appendRemoteAudioBuffer` n'avaient aucun appelant car `P2PWebRTCClient` n'expose pas
  l'audio device module de la build WebRTC publique — même corrigé, le canal n'aurait
  jamais reçu de segments réels. `CallTranscriptionService` (+ tests), le panneau
  `CallView.transcriptOverlay`, `toggleTranscription()`, `DataChannelTranscriptionMessage`
  et le cas `.transcription` de `DataChannelInbound` ont été retirés en bloc — même
  traitement que la suppression des voice-effects (2026-07-05, cf.
  `CallEffectsOverlay.swift:7-15`). Le data channel `"transcription"` lui-même est
  conservé : il porte toujours le `bye` in-band (raccroché instantané P2P) et le ping
  keep-alive, qui restent en usage.

### Vérification
- Build vert + `CallManagerTests`/`CallManagerAudioSessionTests`/`CallEventQueueTests`/
  `CallTranscriptionServiceTests` verts.
- **Test device réel obligatoire** (appels audio + vidéo, route audio Mac/speaker,
  CallKit incoming, survie réseau) — cf. CLAUDE.md « Native calls macOS subsystem ».

### Risque : Élevé (sous-système appels). Valeur : ~600 l réorganisées + B3 + code mort.

---

## Passe P4 — Recâbler `MeeshyShareExtension` + `MeeshyIntents`

### Constat
Code complet mais **jamais compilé** (absents de `project.yml`, donc pas de `.appex`
produit) :
- `MeeshyShareExtension/ShareViewController.swift` (665 l) — « Partager vers Meeshy »,
  utilise App Group `group.me.meeshy.apps`. (Info.plist présent, **entitlements manquant**.)
- `MeeshyIntents/AppIntents.swift` (~430 l) — Siri/Shortcuts, deep-links `meeshy://`.
  (Info.plist présent, entitlements à évaluer.)
`apps/ios/CLAUDE.md` § App Extensions les liste pourtant comme existants.

### Approche (build-ready)
1. **Créer les entitlements** (miroir de `MeeshyNotificationExtension.entitlements` —
   App Group `group.me.meeshy.apps`) :
   - `MeeshyShareExtension/MeeshyShareExtension.entitlements`
   - `MeeshyIntents/MeeshyIntents.entitlements` (si AppIntents lit des données partagées).
2. **Ajouter les 2 cibles dans `project.yml`** (gabarit calqué sur
   `MeeshyNotificationExtension`) :
   ```yaml
     MeeshyShareExtension:
       type: app-extension
       platform: iOS
       deploymentTarget: "16.0"
       sources:
         - path: MeeshyShareExtension
       settings:
         INFOPLIST_FILE: MeeshyShareExtension/Info.plist
         PRODUCT_BUNDLE_IDENTIFIER: me.meeshy.app.share-extension
         CODE_SIGN_STYLE: Automatic
         CODE_SIGN_ENTITLEMENTS: MeeshyShareExtension/MeeshyShareExtension.entitlements
       dependencies:
         - package: MeeshySDK
           product: MeeshySDK
     MeeshyIntents:
       type: app-extension          # ou "app-extension" App Intents Extension
       platform: iOS
       deploymentTarget: "16.0"
       sources:
         - path: MeeshyIntents
       settings:
         INFOPLIST_FILE: MeeshyIntents/Info.plist
         PRODUCT_BUNDLE_IDENTIFIER: me.meeshy.app.intents
         CODE_SIGN_STYLE: Automatic
         CODE_SIGN_ENTITLEMENTS: MeeshyIntents/MeeshyIntents.entitlements
       dependencies:
         - package: MeeshySDK
           product: MeeshySDK
   ```
   Vérifier l'`NSExtensionPointIdentifier` des Info.plist (`com.apple.share-services`
   pour le share, `com.apple.appintents-extension` pour les intents) et que
   `ShareViewController.swift`/`AppIntents.swift` compilent contre le SDK.
3. **Déclarer les cibles comme dépendances de l'app `Meeshy`** (embed des `.appex`)
   si XcodeGen ne le fait pas automatiquement via `dependencies: [target: …]`.
4. `cd apps/ios && xcodegen generate && ./meeshy.sh build`. Itérer sur les erreurs
   de compilation (imports manquants, API SDK).
5. **Mettre à jour `apps/ios/CLAUDE.md`** (§ App Extensions) pour refléter l'état réel.

### Vérification
- Build app + 2 `.appex` verts.
- **Device** : la share-sheet iOS affiche « Meeshy » (partage image/texte) ; Siri/
  Shortcuts exposent les `AppIntent` (`meeshy://…`). Le simu ne valide que la compile.

### Risque : Moyen (config build + provisioning App Group). Valeur : 2 features activées
(ou ~1100 l supprimées si abandon — **décision produit** : recâbler vs supprimer).

---

## Backlog — findings d'audit non encore planifiés

Incohérences / drift relevés mais hors des 4 passes ci-dessus (à intégrer dans une
session « polish » ou rattacher à la passe du sous-système concerné) :

- **B1** — Accent divergent : `ConversationView:780` passe `accentColor ?? brandPrimaryHex`
  à `MessageDetailSheet`, alors que `MessageOverlayMenu`/`ConversationInfoSheet` utilisent
  la computed `accentColor` (fallback `DynamicColorGenerator`). Uniformiser sur la computed.
- **B4** — `ConversationListViewModel` : `hasMore` (`@Published`) double-miroir de
  `paginationState`, désync sur branche `.error`. Rendre `hasMore` calculé
  (`var hasMore { paginationState != .exhausted }`).
- **B (persist liste)** — `MessageStore`/`ConversationListViewModel` : persistance liste
  dépendante du chemin mutateur (`schedulePersist` vs `Task{save}` inline vs jamais pour
  `setConversations`). Router toute persistance par `schedulePersist`.
- **D1** — **1254** `.font(.system(size:))` **sans** `relativeTo:` → casse Dynamic Type
  (accessibilité). Migration vers `MeeshyFont`/fonts sémantiques. Gros chantier a11y.
- **D2** — 601 `cornerRadius:` + 585 `RoundedRectangle(cornerRadius: N)` numériques →
  `MeeshyRadius`.
- **D3** — 46 hex bruts (`MeeshyApp:802-807` re-déclarent `backgroundPrimary/Secondary`
  de ThemeManager) → tokens.
- **A4** — `StoryViewModel.prefetchedMediaURLs` non borné (cf. § Différés).
- **Bubble Equatable** — `BubbleContent.swift:35/94` (`TODO(Task14)`) : égalité n'élargit
  pas aux champs mutables (thumbnailUrl…) → risque bulle non re-rendue sur mutation.
- **PresenceManager:130** — `TODO presence-bulk` : N writes individuels au lieu d'un bulk.

---

## Faux positifs de l'audit pré-existant (NE PAS « corriger »)
- Messagerie « cassée » par le stub `MessageRESTSender` → FAUX : le vrai envoi passe par
  `messageService.send` + `OutboxFlusher` (robuste). Le stub était un chemin parallèle mort
  (supprimé en Phase 1).
- Fuite `file://` au publish story → déjà corrigée.
- Pool AVPlayer surchargé → un seul `SharedAVPlayerManager` (sain).
- `StoryPublishService` « stub » → sentinel d'attente d'executor intentionnel (OK).
- `.onChange` brut SwiftUI → 0 usage réel (`adaptiveOnChange` partout).
