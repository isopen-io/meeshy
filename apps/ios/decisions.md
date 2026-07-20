# Decisions - apps/ios (SwiftUI iOS App)

## 2025-01: Architecture - MVVM strict
**Statut**: Accept
**Contexte**: SwiftUI ncessite un pattern clair pour sparer UI et logique mtier
**Decision**: MVVM avec `@MainActor class` ViewModels, `@Published` properties, Views pures SwiftUI
**Alternatives rejet**: MVC (pas adapt SwiftUI), VIPER (trop complexe pour l'quipe), TCA (courbe d'apprentissage)
**Cons**: Boilerplate (ViewModel+View+Model par feature), Combine ncessaire pour les streams

## 2025-01: Navigation - ZStack custom (pas NavigationStack)
**Statut**: Accept
**Contexte**: Besoin d'animations personnalises (scale+fade+slide) et d'un UI immersif sans chrome
**Decision**: ZStack avec `@State` boolens, `.transition(.asymmetric())` avec spring animations, callbacks `onBack`
**Alternatives rejet**: NavigationStack (animations limites, barre de navigation impose), TabView (pas adapt au chat)
**Cons**: Pas de deep linking, bouton retour manuel, pas de swipe-to-dismiss natif, vues en mmoire

## 2025-01: Services - Singletons (`static let shared`)
**Statut**: Accept
**Contexte**: Managers coteux (connexions rseau, modles ML) ne doivent pas tre recrs
**Decision**: Singleton pour AuthManager, APIClient, MessageSocketManager, PresenceManager, MediaCacheManager, ThemeManager
**Alternatives rejet**: Dependency injection (setup container complexe), Environment Objects (pas adapt aux services), Service Locator (indirection inutile)
**Cons**: Difficile  tester (tat global), dpendances caches

## 2025-01: Networking - URLSession natif + Socket.IO + Combine
**Statut**: Accept
**Contexte**: REST pour API, WebSocket pour temps rel, streams d'vnements ractifs
**Decision**: APIClient gnrique `async/await`, deux Socket Managers spars (Message + Social), Combine PassthroughSubject pour events
**Alternatives rejet**: Alamofire/Moya (URLSession suffit), un seul socket manager (reconnexion indpendante ncessaire), callbacks (obsolte)
**Cons**: Code dupliqu entre les deux socket managers, gestion manuelle des `AnyCancellable`

## 2025-01: Property Wrappers - Convention StateObject/ObservedObject/EnvironmentObject
**Statut**: Accept
**Contexte**: SwiftUI exige le bon wrapper pour viter les recrations de ViewModels
**Decision**: `@StateObject` quand la View CRE le VM, `@ObservedObject` pour les singletons, `@EnvironmentObject` pour VMs partags dans la hirarchie
**Alternatives rejet**: Tout en @StateObject (lifecycle incorrect pour singletons), tout en @ObservedObject (recration inattendue)
**Cons**: Subtil  comprendre, `@EnvironmentObject` manquant = crash runtime (pas compile-time)

## 2025-01: Media - Kingfisher + Actor MediaCacheManager
**Statut**: Accept
**Contexte**: Images frquentes et petites vs audio/vido rares et volumineux = politiques de cache diffrentes
**Decision**: Kingfisher pour images, Actor custom pour audio/vido/documents (NSCache mmoire + FileManager disque, 7j TTL)
**Alternatives rejet**: SDWebImage (moins Swift-natif), cache unique (politiques incompatibles)
**Cons**: Deux systmes de cache  maintenir, pas d'viction automatique du disque au-del de l'ge

## 2025-01: Design System - Glass UI + View Modifiers custom
**Statut**: Accept
**Contexte**: Design language personnalis avec `.ultraThinMaterial`, gradients, et animations spring
**Decision**: ThemeManager singleton, modifiers rutilisables (`.glassCard()`, `.pressable()`, `.shimmer()`, `.pulse()`), Color(hex:) extension
**Alternatives rejet**: UI kit tiers (pas assez de contrle), styles hardcods (pas de thming)
**Cons**: Performance des effets empils (blur+shadow+gradient), courbe d'apprentissage des modifiers

## 2025-01: Concurrence - async/await + @MainActor + Actor
**Statut**: Accept
**Contexte**: Swift concurrency moderne pour thread safety et performance
**Decision**: ViewModels `@MainActor class`, `actor` pour le cache (MediaCacheManager), `async/await` pour le rseau, Combine pour les streams
**Alternatives rejet**: GCD (legacy, pas de structured concurrency), tout Combine (trop verbeux pour single-value), tout async/await (Combine meilleur pour streams)
**Cons**: Paradigmes mixtes (Combine + async/await), retain cycles dans les closures Combine

## 2025-01: Tokens - UserDefaults (DETTE TECHNIQUE)
**Statut**: Accept (temporaire)
**Contexte**: Simplicit de dveloppement, pas de problmes Keychain en simulateur
**Decision**: JWT et session tokens stocks dans `UserDefaults.standard`
**Alternatives rejet**: Keychain (complexit et entitlements) - DEVRAIT TRE LA SOLUTION FINALE
**Cons**: **RISQUE SCURIT** - UserDefaults non chiffr, tokens extractibles depuis backup
**Action requise**: Migrer vers Keychain avant release production

## 2025-01: Build - Script shell custom (`meeshy.sh`)
**Statut**: Accept
**Contexte**: Automatisation build/run/test/archive sans dpendance externe
**Decision**: Script bash 601 lignes wrappant xcodebuild, dtection auto simulateur, log streaming avec crash monitoring
**Alternatives rejet**: Fastlane (overkill, dpendance Ruby), Xcode GUI (pas automatable)
**Cons**: Fragilit du bash (whitespace, quoting), macOS+Xcode obligatoire

## 2025-02: Dpendances - 5 librairies SPM
**Statut**: Accept (rvis 2026-05 — Kingfisher retir ; 2026-07 — WhisperKit retir, jamais import)
**Contexte**: Dpendances minimales, Swift Package Manager natif
**Decision**: Firebase 12.12+, Socket.IO 16.1+, WebRTC 141.0+ ; reconnaissance vocale on-device via Apple Speech framework (SFSpeechRecognizer), pas de dpendance tierce
**Alternatives rejet**: CocoaPods (ncessite Ruby, pas natif)
**Cons**: Firebase + WebRTC ajoutent ~30MB au binaire, vendor lock-in Firebase

## 2026-05: Suppression de Kingfisher (dpendance morte)
**Statut**: Accept
**Contexte**: Kingfisher 7.10 tait dclare dans `apps/ios/Package.swift` depuis le dbut du projet, mais l'audit SOTA 2026-05-06 a dcouvert qu'**aucun fichier Swift ne l'importait** (`grep "import Kingfisher"` = 0 rsultats). L'image loading tait dj fait via `AsyncImage` natif SwiftUI + `CachedAsyncImage` custom (`packages/MeeshySDK/Sources/MeeshyUI/Primitives/CachedAsyncImage.swift`) qui utilise `DiskCacheStore` et `CacheCoordinator.shared.images` (3-tier cache du SDK).
**Decision**: Supprimer Kingfisher de `apps/ios/Package.swift` (dependencies + target product). Aucun changement de code Swift requis (zro import). Conserver `CachedAsyncImage` + `CacheCoordinator` qui sont la stratgie d'image loading active.
**Alternatives rejet** :
- **Bumper Kingfisher 7.10 → 8.9** (recommandation initiale de l'audit) : inutile puisque la lib n'est pas utilise. Maintenir une dpendance non-utilise = dette tech qui pollue le SPM graph et augmente le bundle.
- **Migrer tout vers Kingfisher** : ajouterait une dpendance redondante alors que `CacheCoordinator` 3-tier est dj en place et test.
- **Migrer vers Nuke 13** : non justifi (mme raisonnement).
**Justification SOTA (audit 2026-05-06)** :
- Le pattern actuel (`AsyncImage` SwiftUI + `CachedAsyncImage` + `DiskCacheStore`) est natif iOS 15+ et SOTA 2026
- Le `CacheCoordinator` 3-tier (mmoire NSCache + disk FileManager + rseau) est plus performant qu'une simple `KFImage` car coupl  l'invalidation Socket.IO
- Suppression d'une dpendance morte = -1 paquet SPM, build plus rapide, moins de surface d'attaque
**Cons**: aucun. Le retrait est purement bnfique (rien ne casse, dette tech limine).
**Source**: `docs/superpowers/specs/2026-05-06-composer-based-story-repost-sota-audit.md` Pilier 11 (rvis post-investigation)

## 2026-05: Stories - Immuabilit post-publication
**Statut**: Accept
**Contexte**: Les utilisateurs peuvent crer/diter une story librement dans le composer pre-publish (StoryComposerView : slides, effets, stickers, audio, visibilit). **Aprs publication, aucune dition n'est possible** ; seule la suppression de la story (ou d'une slide individuelle) est offerte. Le menu kebab de l'utilisateur propritaire affiche uniquement "Supprimer".
**Decision**: Les stories sont **immuables** une fois publies. Le menu kebab ne propose JAMAIS d'option "Modifier" pour les stories. La granularit "delete single slide" reste possible.
**Justification SOTA (audit 2026-05-06)** :
- **Alignement industrie 100%** : Instagram, Snapchat, BeReal, TikTok Stories, Threads — toutes les plateformes leaders interdisent l'dition post-publish
- **Trust** : l'immuabilit = preuve de confiance (anti-fake-news, contre-mesure  l'dition silencieuse aprs viralit)
- **Simplicit cognitive** : modle write-once plus simple  expliquer  l'utilisateur
- **Confidentialit** : un follower qui a vu la story originale peut tre sr que ce qu'il a vu n'a pas t modifi  posteriori
**Alternatives rejet** :
- **dition libre 5min aprs publi** (style Threads/X pour les posts) : casse la trust, ncessite badge "Edited" omniprsent, complexifie les caches CDN, et n'est pas attendu pour des stories phmres 24h
- **dition limite au texte seul** : pas de demande utilisateur, complexit pour un gain marginal
**Implications** :
- Pour corriger une erreur, l'utilisateur supprime + recre (workflow universel sur les plateformes leaders)
- Le composer pre-publish doit rester puissant et accessible (pas de friction  l'dition AVANT publication)
- L'option "Add slide" sur story existante est append-only (acceptable, prserve l'immuabilit des slides existants)
**Cons**: aucun (alignement industrie unanime). Risque rsiduel : utilisateur frustr de devoir supprimer pour corriger un typo — accept comme tradeoff.
**Source**: `docs/superpowers/specs/2026-05-06-composer-based-story-repost-sota-audit.md` Pilier 20

## 2026-05: Mdia snapshot - Reflink (COPYFILE_FICLONE) ct gateway
**Statut**: Accept
**Contexte**: Le repost-en-post d'une story duplique les mdias vers de nouveaux paths CDN (snapshot indpendant pour survivre  l'expiration de la story originale). L'implmentation initiale utilisait `fs.copyFile(src, dst)` sans flag — full byte copy systmatique.
**Decision**: Utiliser `fs.copyFile(src, dst, fs.constants.COPYFILE_FICLONE | COPYFILE_EXCL)` dans `services/gateway/src/services/MediaService.ts`. `COPYFILE_FICLONE` = best-effort copy-on-write reflink (zero-copy sur APFS, btrfs, XFS, ext4 5.6+) avec fallback automatique vers full copy. `COPYFILE_EXCL` = guard contre overwrite race (UUID destination).
**Justification SOTA (audit 2026-05-06)** :
- Sur APFS/btrfs/XFS, le reflink est gratuit (~zro I/O, ~zro RAM, atomic)
- Sur les filesystems non-supports, fallback transparent vers full copy (zro impact)
- Gain estim : -90% I/O sur duplication snapshot, support reflinks natif macOS/Linux modern
**Alternatives rejet** :
- **Streams** (`createReadStream.pipe(createWriteStream)`) : universel mais 2 buffers RAM, complexit accrue
- **Server-side copy S3** (`CopyObject`) : non applicable car stockage actuel = volumes Docker locaux. Sera la SOTA quand on migrera vers MinIO/R2 (cf. Pilier 7 audit).
**Cons**: dpend du filesystem hte (mais fallback gracieux)
**Source**: `docs/superpowers/specs/2026-05-06-composer-based-story-repost-sota-audit.md` Pilier 3

## 2026-05-16 : Envoi de messages WebSocket-first + fallback REST

**Statut**: Accepte
**Contexte**: L'app iOS envoyait TOUS les messages texte via REST (`POST /conversations/:id/messages`), sans jamais tenter le WebSocket. Le gateway expose pourtant le handler `message:send` (utilise par le web en primaire), et tous les autres evenements temps reel — reactions, commentaires, statuts de lecture — transitent deja par Socket.IO. REST etait cense n'etre qu'un fallback ; iOS avait simplement diverge (aucun emetteur `message:send` cote SDK).
**Decision**:
- SDK `MessageSocketManager.sendAsync(...)` emet `message:send` avec ACK (`emitWithAck` + timeout 10s, miroir de `sendWithAttachmentsAsync`). Retourne `SendMessageAck` (`messageId`, `clientMessageId`, `createdAt`) ou `nil`.
- `ConversationViewModel.sendMessage` tente le WebSocket d'abord, puis bascule sur REST si : socket deconnecte, pas d'ACK dans le delai, ou erreur serveur.
- Le gateway `_sendResponse` echoe desormais `createdAt` dans l'ACK socket pour que la ligne optimiste recoive l'horodatage serveur sans attendre le broadcast `message:new`.
- L'evenement `message:send` a ete etendu pour porter tout le jeu d'effets de message — `isBlurred`, `expiresAt` (ephemere), `effectFlags` (bitfield), `isViewOnce`, `maxViewOnceCount` — ajoutes au schema Zod `SocketMessageSendSchema` et au `messageRequest` du handler `handleMessageSend`, a parite stricte avec la route REST. `MessageProcessor.saveMessage` recompose le bitfield `effectFlags` (bits BLURRED / EPHEMERAL / VIEW_ONCE) a l'identique pour les deux transports.
- Le view-once (`isViewOnce` / `maxViewOnceCount`) etait une feature morte cote envoi : ni `SendMessageBody` (REST) ni `SocketMessageSendSchema` (WS) ne l'acceptaient, et `MessageProcessor.saveMessage` ne l'ecrivait pas — le message etait toujours cree avec `isViewOnce = false`. Cable de bout en bout sur les DEUX transports + le processor + le payload broadcast `message:new` (`maxViewOnceCount` ajoute a `_buildMessagePayload`). Les effets bitfield purs (shake, zoom, glow, confetti...) etaient deja transportes par `effectFlags` sur les deux voies.
**Garde (reste sur REST)**: messages E2EE (le chiffrement iOS produit un payload de forme REST — `content` base64 + `isEncrypted`/`encryptionMode` — et non la forme socket `encryptedContent`/`encryptionMetadata` du web), et messages avec pieces jointes (voie WS dediee `message:send-with-attachments`).
**Justification**: parite avec le web et avec les autres evenements temps reel ; reutilise la connexion socket deja ouverte (pas de handshake HTTP) ; ACK socket = transition horloge -> simple coche plus rapide. La livraison temps reel aux destinataires (broadcast `message:new`) etait deja en WS quel que soit le transport d'envoi — ce changement aligne juste le transport d'envoi.
**Securite by-design**: si la voie WS est cassee ou indisponible, le comportement degrade exactement vers l'ancien chemin REST (eprouve). REST n'est jamais retire.
**Alternatives rejetees**:
- **E2EE iOS en WS** : necessiterait de retravailler le bloc de chiffrement iOS pour produire `encryptedContent`/`encryptionMetadata` (forme socket, comme le web) ; chantier separe — reporte.
- **WS-only sans fallback** : fragile (socket en handshake au demarrage, coupures reseau) — REST reste indispensable comme filet.
**Cons**: deux chemins d'envoi a maintenir (WS + REST), mais c'est deja le cas (REST + `message:send-with-attachments`).

## 2026-05-26 : Audio playback persistence — engine ownership decouple de la SwiftUI cell

**Statut**: Accepte
**Contexte**: AudioPlayerView (SDK MeeshyUI) possedait son engine via `@StateObject private var player = AudioPlaybackManager()`. Quand la cellule sortait du viewport (scroll, navigation, app en background), SwiftUI detruisait la View et desallouait l'engine, coupant l'audio. Aucun moyen d'ecouter un message audio long en continuant a naviguer.

**Decision**: Architecture en trois couches.

- **ConversationAudioCoordinator** (app singleton @MainActor) possede l'engine via le protocol AudioPlaybackEngineDriving, la queue d'audios non ecoutes, l'ActiveAudioContext, et les hooks lifecycle (logout via AuthManager.$isAuthenticated, conversation supprimee via le nouveau SocialSocketManager.conversationDeleted, message supprime via MessageSocketManager.messageDeleted). Guard contre CallManager.callState.isActive.

- **AudioPlayerView SDK** : deux modifications backward-compat. (1) parametre `externalPlayer: AudioPlaybackManager? = nil` — si fourni, utilise via @ObservedObject au lieu du @StateObject interne. Strategie dummy + register-opt-out via nouvelle `AudioPlaybackManager.init(registerWithCoordinator: Bool)`. (2) parametre `onPlayRequest: (() -> Void)? = nil` — quand fourni ET `player.attachmentId != attachment.id`, le tap play route vers le parent au lieu de `player.togglePlayPause()` interne.

- **AudioBubbleRouter** (app wrapper de bulle conv) observe `coordinator.activeContext`. Si actif (`attachmentId` matche self), rend AudioPlayerView avec `externalPlayer = coordinator.engineForBubble` (tous les controls play/pause/seek touchent l'engine partage). Sinon, rend AudioPlayerView normal + `onPlayRequest` qui appelle `vm.playAudio()` (set le contexte coordinator + demarre la lecture via l'engine partage).

- **Background persistence** : `MediaLifecycleBridge.prepareForBackground` + `MeeshyApp.adaptiveOnChange(scenePhase)` gardent contre `coordinator.isPlaying`. Si true, l'AVAudioSession reste active et `UIBackgroundModes:audio` autorise l'OS a continuer la lecture.

- **MiniAudioPlayerBar** (`AdaptiveRootView` overlay) flottant au-dessus du tab bar, visible quand `coordinator.activeContext` non nil. Avatar + sender + nom conv + progress + play/pause/next/close. Auto-fade 5s apres queue vide via graceContext.

- **NowPlaying bridge** (`ConversationAudioCoordinator+NowPlaying`) MPNowPlayingInfoCenter + MPRemoteCommandCenter. Throttle 0.25s sur currentTime, removeDuplicates sur isPlaying/activeContext, artwork best-effort via `CacheCoordinator.shared.images.image(for:)`. Race protection : re-verifie `activeContext.attachmentId` apres await artwork.

**Reuse maximise** : aucun composant visuel nouveau (waveform, play button, time row, speed chip). AudioPlayerView SDK existant entierement preserve avec ses features (transcription, translatedAudios, BubbleFooter slots, fullscreen, langue Prisme Linguistique).

**Sites concernes** : 4 sites de bulle conv migres vers `AudioBubbleRouter` (3x ConversationMediaViews + 1x BubbleAttachmentView). Les sites hors-conv (composer preview, fullscreen, story, PostDetailView, FeedPostCard) gardent AudioPlayerView direct (engine local).

**Hooks lifecycle exhaustifs** : 5 cas qui ferment la lecture (close) — logout, conversation supprimee, message du active context supprime, queue vide, user tap close mini-player. Le 6e cas (message d'un autre element de la queue supprime) supprime juste cet element de la queue.

**Consequence majeure** : l'audio joue via une bulle de conv survit aux changements de view (scroll, navigation, background app, lock screen). L'audio joue via composer / fullscreen / story garde l'ancien comportement (@StateObject local).

**Alternatives rejetees**:
- **Plan original "ZERO modification SDK"** : aurait remplace AudioPlayerView par un AudioBubbleRouter qui rend des Active/Inactive bubbles minimaux. Aurait perdu transcription, translation, BubbleFooter, fullscreen. Rejete car regresse le Prisme Linguistique et la UX existante.
- **Extraction AudioPlayerCore** (separer rendering de ownership engine) : trop invasif sur les 1155 lignes de AudioPlayerView.swift, risque cassure non maitrise.
- **Owned engine au niveau du parent (VM)** : SwiftUI @StateObject reste lie au View lifecycle, ne survit pas au demontage.

**Tests** : 42 tests automatises (10 builder + 12 coordinator + 4 VM + 4 router + 3 lifecycle bridge + 2 scene phase + 7 mini-player). Smoke manual requis pour Now Playing lock screen, AirPods, CarPlay, interruptions CallKit/telephone/Siri, et background continu sur device reel.

**Source**: `docs/superpowers/specs/2026-05-25-audio-continuous-playback-design.md` + `docs/superpowers/plans/2026-05-25-ios-audio-playback-persistence-plan.md`

## 2026-06-12 : AudioRecorderManager reste app-side — pas d'unification avec DefaultSDKAudioRecorder

**Statut**: Accepte
**Contexte**: L'audit lifecycle 2026-06-12 a corrige le meme bug (deinit CleanupHandle, self-stop a maxDuration) en double dans `AudioRecorderManager` (app) et `DefaultSDKAudioRecorder` (SDK core) — les deux conforment a `AudioRecordingProviding` et partagent ~80 % de leur code (metering, level history, timer, stop/cancel). La revue a propose de supprimer la copie app au profit du recorder SDK.

**Decision**: Les deux classes coexistent, MAIS la duplication mecanique est reduite :
- Le dictionnaire AVAudioRecorder est desormais derive de `AudioRecordingSettings.avRecorderSettings` (source unique SDK) dans les DEUX classes — plus de dict construit a la main cote app.
- Ce qui reste duplique est **volontairement app-side** car c'est de la politique produit (test du grain, SDK Purity) : session `.voiceChat` + `.allowBluetoothHFP` (audit P1-10 — chaine EC/AGC/NS, eviter le flap A2DP→HFP), refus de demarrer pendant un appel via `CallManager.shared.callState` (singleton app), rollback A3 de session sur echec d'init, callback `onMaxDurationReached` pour l'UX composer. Le recorder SDK passe par `MediaSessionCoordinator.activateRecordingSync` avec la config generique.

**Regle d'entretien**: tout fix de MECANIQUE d'enregistrement (timer, metering, deinit, fichiers) doit etre applique aux deux classes (chercher « aligné sur DefaultSDKAudioRecorder » dans le code). Tout changement de POLITIQUE session reste cote app uniquement.

**Alternatives rejetees**:
- **Suppression de la copie app / composition** : exigerait de remonter la politique session (.voiceChat/HFP, garde CallManager) dans le SDK — violation directe de la regle SDK Purity (le SDK ne lit pas les singletons produit, n'encode pas « quand faire X ») et du precedent AttachmentDownloader (rollback 83e55297c).
- **Sous-classement** : `DefaultSDKAudioRecorder` est `final` par design (pas d'inheritance dans le SDK) ; l'ouvrir pour un seul consommateur inverse le rapport cout/benefice.

## 2026-06-15 : Custom Layout — `sizeThatFits` et `placeSubviews` DOIVENT sonder les enfants identiquement (height: nil)

**Statut**: Accepte (commit `d43307430`)

**Contexte**: Les bulles de conversation portant une carte OpenGraph (`LinkPreviewCard`, message contenant une URL) s'affichaient ~170pt trop hautes — un grand vide violet sous la carte dans lequel le message suivant venait **chevaucher** (entremêlage rapporté sur device, prioritaire mise en production). `BubbleBodyFooterLayout` (custom `Layout` qui empile body + footer) avait deux passes divergentes :
- `measuredSize()` (appele par `sizeThatFits`) sondait le body via `body.sizeThatFits(proposal)` en **transmettant la hauteur proposee**.
- `placeSubviews()` sondait via `body.sizeThatFits(ProposedViewSize(width:, height: nil))` — hauteur **nil**.

Le body d'une bulle a lien heberge un `LinkPreviewCard` dont le `.frame(minHeight: 64)` n'a **pas de maximum** : sonde avec une hauteur, il grandit pour la **remplir**. Comme la taille mesuree redevient la prochaine proposition du parent, la hauteur s'emballe en **boucle de feedback** (escalier mesure 184→218→…→383.7pt pour ~213pt de contenu reel). Prouve par instrumentation runtime sur sim : meme body, meme largeur 281.4 → `sizeThatFits` body=349.7pt vs `placeSubviews` body=179.7pt. Les bulles **texte** y echappent (`Text` retourne sa hauteur ideale quel que soit la hauteur proposee), d'ou le bug **uniquement** sur les bulles a lien.

**Decision**: Dans un custom `Layout`, mesurer la hauteur **intrinseque** d'un enfant via `child.sizeThatFits(ProposedViewSize(width: proposal.width, height: nil))`, **jamais** en transmettant la hauteur proposee. `sizeThatFits` (taille rapportee au parent) et `placeSubviews` (placement) doivent sonder les enfants de **maniere identique** — sinon la taille rapportee derive du placement reel et la cellule deborde / chevauche sa voisine. Fix applique : `measuredSize` aligne sur `placeSubviews`.

**Regle generale**: tout enfant flexible en hauteur (`.frame(minHeight:)` sans max, `Spacer`, `RoundedRectangle`/`Rectangle` sans frame fixe, `.frame(maxHeight: .infinity)`) **remplit la hauteur proposee**. Le sonder avec une hauteur non-nil dans `sizeThatFits` couple la taille rapportee a la proposition et peut creer une boucle de feedback (la taille mesuree redevient la proposition). Toujours proposer `height: nil` pour obtenir la hauteur ideale.

**Verification**: frame-a-frame (idb `ui describe-all`) sur la meme conversation, avant/apres — bulle OG 383.7→213.7pt, chevauchement 72.7pt → espacement sain +46pt, fond de bulle du message suivant restaure. Confirme visuellement (screenshots).

**Alternatives rejetees**:
- **Capper `LinkPreviewCard` avec un `maxHeight` ou `.fixedSize(vertical:)`** : masque le symptome sur un seul composant ; d'autres enfants flexibles futurs re-declencheraient le bug. Le fix au niveau du `Layout` traite la source unique de la divergence (et c'est la maniere SOTA de mesurer une hauteur intrinseque d'enfant).

**Voir aussi**: [[feedback-swiftui-layout-sizethatfits-height-nil]] (memoire). Lie au piege [[feedback-swiftui-layout-cache-recycled-cells]] (Layout.Cache perime au recyclage) — meme famille « custom Layout + cellule recyclee + mesure ».

## 2026-07-04 : Calling architecture — decisions.md pointe vers les specs superpowers (pas de duplication)

**Statut**: Accepte

**Contexte**: Un audit du sous-systeme d'appel (WebRTC/CallKit/PushKit, `CallManager.swift`, `P2PWebRTCClient.swift`, `WebRTCService.swift`, `WebRTCTypes.swift`) a note que ce fichier ne contenait aucune entree dediee a l'architecture d'appel, alors que le sujet a deja fait l'objet de plusieurs rondes de conception formelles ailleurs dans le repo.

**Decision**: Les ADR canoniques pour le systeme d'appel vivent dans `docs/superpowers/specs/2026-05-10-calls-sota-redesign-design.md` (section 10 — 7 ADRs : moteur media libwebrtc, facade `@MainActor CallManager` + `actor CallEventQueue` pour serialiser les entrees concurrentes socket/CallKit/WebRTC/reseau, verrouillage optimiste Prisma `version` sur `CallSession`, `setCodecPreferences` plutot que SDP munging sauf pour `transport-cc`, session audio `.voiceChat` pour la Voice Isolation OS, appels anonymes limites au socket actif sans PushKit, bus `MediaPipelineHook` pour extensibilite future). Ce fichier ne duplique pas ces decisions — il pointe vers la source, conformement a l'esprit "decisions.md par package" mais sans re-ecrire un contenu deja arbitre ailleurs. Voir aussi `docs/superpowers/specs/2026-03-29-webrtc-p2p-calling-design.md` (spec Phase 1) et `docs/superpowers/specs/2026-06-20-ios-call-pip-and-hardening-design.md` (PiP + hardening).

**Verification faite lors de l'audit** (aucun changement de code requis) :
- `P2PWebRTCClient.swift` contient deux declarations de `final class P2PWebRTCClient` (ligne ~37 et ~1602) correctement isolees par `#if canImport(WebRTC) / #else / #endif` — pas un doublon accidentel.
- `WebRTCService.swift` (@MainActor, 613 lignes) n'est pas un legacy dupliquant `P2PWebRTCClient.swift` (1650 lignes) : c'est la couche de politique/isolation d'acteur (ADR-2 ci-dessus) qui delegue au `client: any WebRTCClientProviding`. Les deux fichiers ont des responsabilites distinctes et doivent coexister.

**Alternatives rejetees**: dupliquer le contenu des specs superpowers dans ce fichier — rejete, cree un risque de divergence entre deux sources de verite pour la meme decision.
