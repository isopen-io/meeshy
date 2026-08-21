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

## 2026-08-06 : ADR-2 amende — pas d'`actor CallEventQueue` distinct, serialisation via hops `@MainActor`

**Statut**: Accepte

**Contexte**: Un audit du sous-systeme d'appel a grep `CallEventQueue` sur tout `apps/ios` (zero occurrence) alors qu'ADR-2 (voir entree du 2026-07-04 ci-dessus) et ce meme fichier decrivent explicitement une facade `@MainActor CallManager` + un `actor CallEventQueue` prive pour serialiser les entrees concurrentes socket/CallKit/WebRTC/reseau. En pratique, `CallManager` serialise ses transitions d'etat directement via des dizaines de `Task { @MainActor [weak self] in ... }` au point d'entree de chaque callback delegate/socket (ex. `CallManager.swift:4840-4931`) — ce qui empeche bien les data races (MainActor est un executeur serie), mais n'est pas l'acteur dedie decrit par l'ADR.

**Decision**: Amender ADR-2 pour refleter le code livre : la serialisation des evenements d'appel repose sur le fait que `CallManager` est lui-meme `@MainActor` et que chaque callback externe (delegate WebRTC, event socket, callback CallKit) re-entre via un hop `Task { @MainActor in }` avant de muter l'etat — pas sur un `actor CallEventQueue` distinct. Ce pattern est fonctionnellement equivalent pour la garantie recherchee (pas de race sur l'etat d'appel) et deja couvert par les tests de concurrence existants (`P2PWebRTCClientConcurrencySourceTests`, etc.). Aucun changement de code n'est requis par cette entree — elle corrige uniquement la documentation pour qu'elle cesse de decrire un composant qui n'existe pas.

**Alternatives rejetees**: implementer un `actor CallEventQueue` distinct pour faire correspondre le code a l'ADR d'origine — rejete pour cette passe : reecrire le point d'entree de synchronisation d'un sous-systeme d'appel mature et en production (voir historique de fixes de race conditions dans `services/gateway/decisions.md` et les commits recents `fix(calls/...)`) sans un besoin fonctionnel identifie serait un changement architectural a haut risque pour un benefice non demontre. A reconsiderer si un futur besoin (ex. group calls / SFU) exige une vraie serialisation d'acteur.

## 2026-08-13 : Deep links des surfaces hors-app — la table de routage est la SSOT, et une garde la confronte aux émetteurs

**Statut**: Accepté

**Contexte**: Les widgets (`MeeshyWidgets/`) et les App Shortcuts (`MeeshyAppIntents.swift`) composent leurs `meeshy://` par interpolation de chaîne, dans du code qui n'importe pas `DeepLinkParser`. Rien ne confronte ces URL à la table de routage : le compilateur valide la chaîne, les tests du widget ne l'atteignent pas, ceux du routeur ne la connaissent pas. Résultat mesuré au cycle 106 : **7 hosts émis, 3 routés**. Les quatre boutons du widget « Réponse rapide » et le raccourci Siri « Message X on Meeshy » n'ont jamais rien fait.

**Décision**:
1. `DeepLinkParser` / `DeepLinkRouter` restent la **seule** table de routage. Une surface hors-app n'invente pas un schéma d'URL : elle émet une forme qui y figure.
2. Toute forme émise doit être **classée** dans `DeepLinkSurfaceRoutingGuardTests` — routée (avec une URL témoin qui doit résoudre) ou délibérément non routée (avec sa raison). La garde extrait les hosts réellement présents dans les sources émettrices et exige l'égalité des deux ensembles : un host nouveau fait rougir, un host classé qui a disparu aussi.
3. Un texte transporté par un deep link (réponse rapide, dictée Siri) est **déposé en brouillon** (`DraftStore`), jamais envoyé. Un tap depuis l'écran d'accueil ou une transcription Siri approximative ne peut pas produire un message irrattrapable. Un brouillon qui porte déjà du texte n'est jamais écrasé.
4. Le **host décrit ce que la surface montre, pas ce qu'elle porte** : `meeshy://contact/{id}` et `meeshy://send?contactId=` transportent des identifiants de **conversation** (`WidgetDataManager.publishFavoriteContacts` écrit `conv.id`). Suivre l'écrivain, jamais le nom.

**Alternatives rejetées**:
- *Router les 7 hosts d'un coup* : `conversations/*`, `call` et `translate` demandent des destinations produit qui n'existent pas (élire « la conversation la plus récente », amorcer un appel depuis une URL, un écran de traduction hors conversation). Les brancher sur une destination approximative serait pire que le no-op actuel — et le silence resterait, la garde le rend explicite.
- *Faire émettre au widget des formes canoniques (`meeshy://c/{id}`)* : corrige les émetteurs d'aujourd'hui sans empêcher le prochain d'inventer un host. La contrainte doit vivre dans un test qui LIT les émetteurs, pas dans leur bonne volonté.

**Conséquences**: toute nouvelle surface hors-app qui émet un `meeshy://` doit être ajoutée à la liste balayée par la garde, sans quoi ses URL restent invisibles à cette vérification. Le balayage couvre aujourd'hui `MeeshyWidgets/` et `MeeshyAppIntents.swift`.

## 2026-08-13 : L'aperçu de conversation se résout par le Prisme à TOUS les points d'affichage, garde d'ensemble à l'appui

**Statut**: Accepté

**Contexte**: `MeeshyConversation.resolvedLastMessagePreview(preferredLanguages:)` est la source de vérité iOS du Prisme Linguistique pour l'aperçu de conversation (`CLAUDE.md` règle #3, jumelle de `resolveLastMessagePreview()` côté gateway). Elle était appelée par deux lecteurs — `ThemedConversationRow` et `GlobalSearchViewModel` — pendant que trois autres surfaces d'affichage lisaient `lastMessagePreview` brut : `WidgetDataManager` (texte publié dans l'App Group, donc affiché sur l'écran d'accueil), `SharePickerView` et `WidgetPreviewView`. Les trois recevaient pourtant les mêmes objets `MeeshyConversation`, `lastMessageTranslations` inclus. Rien ne rougissait : chaque surface affichait un texte plausible, et les deux lecteurs corrects — testés, commentés — donnaient à tout audit l'impression que la règle était tenue.

**Décision**:
1. **Aucune surface n'affiche `lastMessagePreview` brut.** Le champ est une donnée de transport ; la valeur affichable est celle que rend le résolveur, avec le prisme du lecteur.
2. **Le prisme du lecteur a une seule autorité app-side** : `AuthManager.shared.currentUser?.preferredContentLanguages`, exactement comme `ConversationListView`. Une vue qui a besoin du prisme l'expose en propriété calculée ; un service le reçoit par un seam injectable (`WidgetDataManager.preferredContentLanguagesProvider`), jamais par une liste recopiée.
3. **Le dernier point de résolution avant la sortie de l'app est obligatoire.** Un texte publié dans l'App Group ne peut plus être résolu par personne : `publishConversations` doit appliquer le prisme, pas le déléguer au widget (qui n'a ni compte ni traductions).
4. **La règle est tenue par une garde d'ensemble, pas par convention** : `ConversationPreviewPrismSourceGuardTests` extrait tous les accès `.lastMessagePreview` sous `apps/ios/Meeshy/` et exige de chaque fichier une classification — résolu, ou allowlisté avec sa raison. Une garde qui compte des occurrences doit refuser un balayage vide, sinon son silence passe pour un succès.
5. **Le test d'existence et le rendu lisent la MÊME valeur.** `hasText` (qui arbitre entre texte, pièce jointe et position) se calcule sur le texte résolu : deux valeurs différentes sur un même écran font réserver la place d'un texte qui ne s'affichera pas.

**Alternatives rejetées**:
- *Résoudre à l'écriture, dans `ConversationListViewModel` / `ConversationStore`* : figerait la langue du lecteur DANS le cache. Le prisme est une propriété du lecteur au moment du rendu — un changement de langue en réglages doit se voir sans re-télécharger les conversations.
- *Faire résoudre le widget lui-même* : l'extension n'a ni session, ni `lastMessageTranslations` (le payload App Group ne transporte qu'une chaîne), ni le catalogue de langues de l'utilisateur. Lui transmettre la carte de traductions gonflerait `recent_conversations` de 50 conversations × N langues pour un affichage d'une ligne.
- *Corriger les trois surfaces sans garde* : c'est exactement l'état qui a produit ce défaut — deux lecteurs corrects donnaient l'illusion d'une règle tenue.

**Conséquences**: la garde ne balaie que `apps/ios/Meeshy/`. Une surface d'affichage vivant dans une cible d'extension (widget, NSE, partage) resterait hors de sa portée — aujourd'hui aucune n'affiche d'aperçu qu'elle résout elle-même, mais une extension qui le ferait devrait étendre le balayage en même temps.

## 2026-08-18 : Retrait du mode Focal (perspective) — Script devient le mode de lecture nominal

**Statut**: Accepté (arbitrage utilisateur explicite)

**Contexte**: Le mode Focal (perspective au défilement : élection, échelle/alpha par courbe gelée, bande de focus, magnification de l'élue) a traversé trois passes de stabilisation (ré-ancrage spec §5, plafond de compensations d'offset, reconfigure ciblé par `changeVersion`) sans jamais éteindre complètement ses bogues de défilement — crashs SIGTRAP récurrents sur fling violent (récursion `_updateVisibleCellsNow`), micro-sauts de scène, coût par frame. L'utilisateur a tranché : « ça bogue trop ».

**Décision**:
1. **Le pass et sa machinerie sortent de la compilation** (`Focal/Scroll/**`, `FocalFocusControlBar`, `FocalBridgeRow`, six sites d'appel hôte, atterrissages bande de focus, inset de tête, typographie de focus, champs `isFocused`/`sentAt`). Le code complet reste récupérable au commit `bce87148c` — voir `docs/focal-retrait-ios-2026-08-18.md`.
2. **La loi PARTAGÉE reste intacte** (`ReadingModeOrchestrator`, miroir de `packages/shared/utils/reading-modes.ts` ; `FocalFocusCurve`, miroir de `focus-curve.ts` — la Lentille consomme `.list`). Le clamp vit à la CONSOMMATION iOS : `ReadingModeController.clampRetiredModes` rabat toute décision `.focal` (branche par défaut, préférences collantes historiques, forçage) sur `.script`. Le web garde son Focal.
3. **`FocalRow` reste** : c'est la rangée plate du mode Script — densité uniforme, zéro transform, gabarit CONSTANT (`Focus.avatarSize`/`Focus.textIndent` : hauteur d'en-tête et retrait ne varient jamais).
4. **Stabilité Script — l'entonnoir** : le self-sizing des cellules `UIHostingConfiguration` invalide le layout SANS passer par `shouldInvalidateLayout` ni par les compensations d'offset (quatre itérations de SIGTRAP l'ont prouvé) ; `MessageListLayout.invalidateLayout(with:)` avale les invalidations PARTIELLES au-delà de 4 par transaction et se rattrape au tour suivant par une invalidation complète. Vérifié : 200 flings violents + repos sans crash.
5. **Réactivité** : chrome de retour dès la LEVÉE du doigt (`isDragging` seul), reports de reconfigure jusqu'au vrai arrêt ; pagination vers le haut cache-FIRST (fenêtre GRDB servie AVANT le REST).

**Alternatives rejetées**:
- *Encore une passe de stabilisation du pass* : trois itérations sérieuses n'ont pas suffi ; le couple perspective-par-frame × self-sizing × liste inversée reste structurellement fragile sous UIKit.
- *Supprimer aussi `FocalRow`/`FocalFocusCurve`* : la rangée plate EST le mode Script, et la courbe est un miroir de loi partagée consommé par la Lentille — les retirer casserait des surfaces vivantes pour un gain nul.
- *Clamper dans la loi partagée* : le web garde son Focal ; la loi gelée et ses vecteurs TS↔Swift ne bougent pas pour une décision de plateforme.

**Conséquences**: les préférences collantes `.focal` historiques rendent `.script` sans migration de données ; toute restauration future doit reprendre la dette de stabilité là où le retrait l'a laissée (le retrait ne l'a pas résolue, il l'a retirée de la route) ; `ReadingModeLensCatalog.displayOrder` passe à trois modes et les items « Focal (bêta) » disparaissent des menus de liste.

## 2026-08-18 : Le drapeau-toggle pilote la PISTE audio — une seule loi de résolution (`AudioTrackLanguageResolver`)

**Statut**: Accepté (directive utilisateur : « lorsqu'on switch de drapeau d'audio, il faut aussi switcher l'audio et synchroniser la lecture sur les segments »)

**Contexte**: Le drapeau de version (ligne des réactions) ne changeait que le TEXTE. La lecture audio en conversation délègue toujours au parent (`onPlayRequest` → `ConversationViewModel.playAudio`), qui jouait `attachment.fileUrl` en dur : le widget pouvait afficher les segments d'une piste traduite pendant que le coordinateur jouait l'original. Le canal `activeAudioLanguage` (ThemedMessageBubble → BubbleStandardLayout → AudioMediaView) existait mais n'était alimenté par personne ; `activeAudioLanguageOverrides` (VM) n'avait aucun lecteur.

**Décision**:
1. **Une loi unique, pure, app-side** : `AudioTrackLanguageResolver.resolve(manualOverride:originalLanguage:preferredLanguages:translatedAudios:)` — bascule manuelle du drapeau d'abord (l'origine y vaut « piste originale »), sinon Prisme (l'origine gagne à SON rang). Consommée par la VUE (`AudioMediaView.resolvedPreferredTranscriptionLanguage` + onChange de l'override) ET par le MOTEUR (`ConversationViewModel.playAudio` → `effectiveAudioTrackUrl`, `setBubbleActiveDisplayLanguage` → `switchActiveAudioTrackIfNeeded` → `playVariant` si lecture active du même message).
2. **Le karaoké suit gratuitement** : `resolveDisplaySegments` (SDK) suivait déjà la langue sélectionnée ; la tenue plate complète rend désormais le bloc karaoké interactif (`AudioPlayerChromePlan.flatTranscriptionFollowsPlayback`, `.flatFocused` seulement — la tenue minimale garde sa citation tronquée).
3. **`switchToLanguage` (SDK) ne stoppe plus le moteur EXTERNE** : le stop-avant-availability-gate ne vaut que pour le player possédé ; en conversation le coordinateur vient de rejouer la bonne piste (`playVariant`), le stopper tuait la lecture qu'on venait de faire suivre.
4. **La bande interne de drapeaux du widget sort du chemin standalone** (`FocalAudioBlock` passe `footerModel: nil`) : second basculeur local jamais remonté au VM, contraire à l'arbitrage « un seul drapeau, l'exploration au menu d'appui long ». Le carrousel garde `.empty` (drapeaux = navigation par piste d'un message multi-pistes).
5. **Vocal sans traduction texte** : `BubbleContentBuilder` replie `activeLang` et `preferredLangCode` sur la langue audio préférée (`preferredAudioLangCode`, résolu en amont) — sans quoi le drapeau d'un vocal traduit restait inerte et montrait la mauvaise face.

**Alternatives rejetées**:
- *Faire remonter `currentAudioUrl` du SDK via `onPlayRequest(String)`* : change l'API publique du SDK pour tous les call sites ; la résolution VM-side donne la même vérité sans toucher les signatures.
- *Câbler la bande interne du widget au VM* : garder deux basculeurs pour la même décision, c'est la divergence assurée — l'arbitrage produit n'en garde qu'un.

**Conséquences**: une bascule pendant la fenêtre de swap de piste (<1 s, `isPlaying` transitoirement faux) peut ne pas faire suivre la lecture — un re-tap répare ; la sélection est en mémoire (non persistée), un relaunch revient au Prisme.

## 2026-08-21 : Focal revient en passe MINIMALE, Bulles devient un choix, la Lentille suit le doigt

**Statut**: Accepté (directive utilisateur : « arranger et compléter la vue Script, Bulle et Focal », puis « bravo, Focal fonctionne — la magnificence doit porter tous les détails sur un fond accent » et « garder les mêmes proportions d'espace »)

**Contexte**: Le retrait du 2026-08-18 avait rabattu Focal sur Script (clamp de consommation) ; Bulles n'était joignable qu'en coupant la bêta ; la liste Lentille peignait une carte de focus vide, décalée, repositionnée seulement au changement d'élu, dont l'encoche ouvrait une feuille plein écran ; le pull-to-refresh restait coincé à 27 % (offset brut sous un `safeAreaInset`). Un Time Profiler sur le fil (10 s de défilement) montrait `MessageListLayout.fireOrDeferRecoveryInvalidation` se re-planifier à chaque tour de boucle : 830 ms CPU main thread + 2,9 s de pièges noyau dispatch.

**Décision**:
1. **Focal = transform + opacity CALayer, et rien d'autre** (`FocalScrollPerspective`, `Focal/Core/`) : pour chaque cellule visible, la loi PARTAGÉE du fil (`FocalFocusCurve.focusCurve(variant: .thread)`) donne échelle et alpha ; une **compaction** tire chaque rangée rétrécie vers la ligne de focus de la hauteur perdue par celles qui l'en séparent (proportions conservées, zéro relayout) ; `MessageListLayout.focalOverscan` pré-réalise les cellules au-dessus de l'écran que la compaction fait descendre. Ni élection-atterrissage, ni loupe, ni typographie à l'arrêt — la machinerie qui boguait n'est pas restaurée.
2. **Le message en focus** : carte teintée de l'accent de la conversation (sublayer, par frame) ; ses DÉTAILS (identité même en continuation, présence, mood, jour + heure, texte plafonné à `FocalMetrics.Focus.maxCharacters`) par UNE reconfiguration ciblée À LA POSE (`syncFocalFocusDetails`) — jamais pendant le mouvement : une hauteur qui change en plein momentum est ce qui faisait boguer l'ancien pass.
3. **Bulles est un choix de rendu** (`ReadingModeController.renderDecision`) : un choix collant `.bubbles` drapeau ON est rendu tel quel — même chemin que le web (`THREAD_MOUNTABLE_MODES`), loi partagée INTACTE. Catalogue du chip `[.focal, .script, .bubbles, .summary, .river]`, cycle sur les trois vues ; menu de la liste `[auto, focal, script, bulles, résumé, rivière]`.
4. **Lentille** : carte de focus MAGNIFIÉE (hauteur token 84, avatar 52, nom, heure, non-lus, pont/aperçu 2 lignes, badge de type) qui suit la rangée élue à CHAQUE tick (hôte abonné au relais, `midY` vivant du registre), disparaît hors écran ; encoche = `Menu` système. Pull-to-refresh : offset RELATIF à l'inset (`contentOffset.y + contentInsets.top`, SDK) + loi pure `MeeshyPullPhaseLaw`. Rail « moi » aligné sur le tray (💭 / + / listing). Pilule = section ÉPINGLÉE (registre inerte des stickers). Inset collant = `accessoryCollapsedHeight`.
5. **Coûts par passe/par frame** : instantané d'environnement unique (drapeaux), menu contextuel construit derrière le portillon de la row, contexte de passe (langues + index O(1)), `onGeometryChange` au lieu de `GeometryReader`+`onChange`, plus de ressort infini du badge mood en liste/en-tête, `statusForUser` O(1), `FocalRowInput.==` sans allocation, verrou de scène à une lecture d'attributs par cellule, rattrapage d'invalidation joué à la POSE (flush) avec filet 250 ms. Chrome du fil de retour à `isTracking` (la levée du doigt — `isDragging` reste vrai pendant la décélération).

**Alternatives rejetées**:
- *Restaurer le pass du commit `bce87148c`* : la dette de stabilité revenait avec lui ; la passe minimale reprend la loi, pas la mécanique.
- *Porter `.bubbles` dans la loi partagée* : les vecteurs TS↔Swift ne bougent pas pour un choix de rendu d'une plateforme ; la règle vit à la consommation, comme l'ancien clamp.
- *Reconfigurer la rangée en focus par frame* : hauteur mobile en plein momentum = la famille de bogues que le retrait avait écartée.

6. **L'aperçu d'appui long d'une conversation = la carte des DERNIERS MESSAGES** (`ConversationPreviewView` : bannière, avatar/logo, titre, icônes d'en-tête, fil récent), sur les DEUX chemins OS, drapeau ON comme OFF. `LentillePeekView` (en-tête + menu « Auto · Focal · Script · … » dans l'aperçu, contrat LWS-8/I-072) est SUPPRIMÉE — directive user du 21/08 : « ce menu ne sert à rien, juste voir les derniers messages ». Le choix de mode garde deux portes : l'encoche de la carte de focus et le sous-menu « Mode de lecture ». Sur le chemin natif iOS 26+, les derniers messages se chargent à l'ouverture de l'aperçu (`.task { onLoadPreview() }`) au-delà des 20 premières rangées préchargées.
7. **Pilule de section = le sticker qui TIENT la ligne d'épinglage**, pas « le plus haut à l'écran » : un `LazyVStack(pinnedViews:)` garde un moment le sticker poussé AU-DESSUS de la ligne avant de le démonter, et la pilule disait « AUJOURD'HUI » sous « PLUS ANCIEN » épinglé. La ligne (globale) est mesurée UNE fois sur le conteneur de défilement (`onGeometryChange`, zéro écriture par tick) et lue par `LentilleSectionPositionRegistry.pinnedSectionId(positions:pinLine:)`.
8. **Focal à l'ouverture** : toute reconfiguration de cellule remet la pose à plat (registration) — chaque `dataSource.apply` de reconfiguration repose donc la perspective en complétion ; les détails du message en focus se synchronisent aussi AU REPOS (complétion d'apply hors geste), plus seulement à la pose ; `focalOverscan` est posé au premier layout (`viewDidLayoutSubviews`, le mode arrive avant le chargement de la vue) ; l'heure du message en focus est PERMANENTE (`FocalIdentityHeader.revealsTimeAlways`) — elle passait par le révélé de défilement, invisible au repos. Le (+) d'ajout rapide de réaction arrive en Script/Focal (`FocalRowInput.isLastReceivedMessage`, règle unique `BubbleReactionsOverlay.isMounted`).

**Conséquences**: `docs/focal-retrait-ios-2026-08-18.md` reçoit un addendum ; les tests qui encodaient le retrait (`ForcedReadingModeOverrideTests`, `ReadingModeLensCatalogTests`, `ModeMenuModelTests`) sont réécrits ; `PeekViewModelTests` est remplacée par `LongPressPreviewGuardTests` (les gardes de `Lentille/Mode/` y sont reprises) ; `tasks/lentille-recette-q140.md` L12 amendée ; mesure liste (frames distinctes/s en mouvement, simulateur) 46,8 → 54,1.

## 2026-08-21 (bis) : la magnificence n'existe que pendant le défilement — centre de l'écran, retour à plat au repos

**Statut**: Accepté (directive utilisateur : « le cadre doit apparaître quand on est en train de scroller, au repos il disparaît ; remettre le message et la conversation en magnificence presque au centre ; au bout de quelques secondes sans scroller la vue redevient Script, tout se ré-aplatit ; permettre que la magnificence touche tout le contenu ; enlever l'effet d'entrée/sortie des messages ; plus d'interstices ; les messages font partie de la scène avant d'être visibles »)

**Contexte**: Après la passe minimale du matin (carte et détails permanents, ligne de focus à 150 pt du composeur, compaction vers le bas seulement), la perspective restait posée au repos, la bande était basse, le dernier/premier élément n'était jamais atteignable, les rangées lointaines s'effaçaient aux bords (« arrivée/sortie »), et le texte des rangées plates de l'utilisateur était BLANC en mode clair (`BubbleExpandableText` appliquait la règle « blanc sur ma bulle accent » à une rangée sans fond).

**Décision**:
1. **Scène = geste utilisateur** (fil ET liste). Fil : `MessageListViewController.noteFocalScrollTick` n'active la perspective que si `isDragging || isDecelerating` (jamais un défilement programmé) ; la pose réarme un compte à rebours (`FocalMetrics.Scene.restDelay` 2 s) ; `flattenFocalScene` ramène transforms, opacités et carte à l'identité en `flattenDuration` (0,45 s, `UIView.animate`, `beginFromCurrentState`), puis rend les détails du message en focus (une reconfiguration, hors mouvement). Les ticks de la fenêtre d'entrée (`enterDuration` 0,25 s) animent depuis la valeur présentée — pas de saut. Liste : `LentilleSceneActivity` (niveau 0…1 publié DEUX fois par session, offset inerte relu par frame) est lu par `LentillePerspective` (fondu de la pose vers l'identité) et par `LentilleFocusCardHost` (opacité = niveau).
2. **Ligne de focus au centre de la région visible**, qui glisse vers le bord quand le contenu ne peut plus venir à elle : fil — au bord bas au repos sur le dernier message, remontée linéaire sur une demi-hauteur (`FocalScrollPerspective.focusY(visibleTop:visibleBottom:offsetFromBottom:)`) ; liste — au bord haut au repos en haut, descente linéaire (`LentilleFocusBand.centerY(viewportTop:viewportBottom:offsetFromTop:)`, même fonction pour l'élection et la perspective ; le relais publie un offset NÉGATIF en descendant : une seule conversion `offsetFromTop(relayOffset:)`).
3. **Compaction symétrique** (fil) : les rangées sous la ligne rétrécissent vers leur haut et sont tirées vers le haut de la hauteur perdue entre elles et la ligne (`CellPose.anchorY`, `pull` signé) ; sur-réserve de cellules des DEUX côtés (`MessageListLayout.focalOverscan`, `insetBy(dy: -overscan)`) : les messages sont réalisés avant d'être visibles.
4. **Plancher d'opacité** (fil, `FocalScrollPerspective.alphaFloor` 0,62) et **distance absolue** (liste, `LentillePerspective.pass`) — règles de CONSOMMATION iOS, loi partagée et vecteurs TS↔Swift INTACTS : une rangée lointaine reste lisible, le fondu court « sous la bande » du miroir (pensé pour une bande en bas d'écran) n'est pas appliqué.
5. **Queue de liste = accès rapides** (`ConversationListQuickActions`, vue pure ; aussi l'état vide) : nouveau message, story, mood, post, invitation (lien de parrainage `AffiliateCreateView`), lien raccourci (`CreateTrackingLinkView`) — routés vers les portes EXISTANTES ; hauteur = une demi-région visible pour que la dernière conversation atteigne la bande. « Publier un post » passe par `Router.pendingOpenFeedComposer` (patron `pendingOpenSearch`) : `RootView` montre le flux, `ThemedFeedOverlay` ouvre son composeur — ce qui répare au passage l'action « Post » du tableau de bord, dont la notification n'avait aucun observateur.
6. **Rangée plate : texte toujours `textPrimary`** (`FocalRow` passe `isMe: false` à `BubbleExpandableText`) ; le chip de mode prend la couleur de texte du thème en mode clair.

**Alternatives rejetées**:
- *Changer la loi partagée (`FOCUS_CURVE_CONSTANTS`)* pour adoucir les bords : la loi est un contrat TS↔Swift ; une règle de consommation iOS (plancher, valeur absolue) obtient l'effet demandé sans toucher aux vecteurs.
- *Détails du message en focus par frame* : une hauteur qui change en plein momentum — la famille de bogues écartée le 18/08 ; les détails restent posés à la pose et rendus à l'aplatissement.
- *Observer le relais depuis chaque rangée* pour fondre la pose : 120 Hz × 100 rangées ; le niveau de scène change deux fois par session et l'offset est relu par référence dans `visualEffect`.

**Conséquences**: tests réalignés (`FocalScrollPerspectiveTests`, `FocusCardElectionTests`, `LentilleFocusElectionCadenceTests`, `LentillePerspectiveCurveTests`) + `LentilleSceneActivityTests` ; 8 clés `conversations.quick.*` (7 langues) ; `docs/focal-retrait-ios-2026-08-18.md` reste la référence de ce qui n'est PAS revenu.

## 2026-08-21 (ter) : date complète du message en focus, chrome de retour près de la fin du scroll, Rivière branchée

**Statut**: Accepté (directives utilisateur du soir)

**Décision**:
1. **Horodatage du message en focus** (`FocalFocusTimestamp`, règle pure) : « Aujourd'hui 12:45 », « Hier 18:45 », « Mardi 23:40 » jusqu'à 6 jours, puis « Sam. 3 oct. · 14:41 » (année ajoutée si ce n'est pas l'année en cours). Les mots viennent du catalogue (`date.*`), injectés par la rangée.
2. **La carte encadre aux mêmes espaces qu'en Script** : elle mange les rembourrages asymétriques de la rangée (`Row.paddingVertical`, `Row.groupTopPadding` en tête de groupe) pour une marge visible égale en haut et en bas ; l'étiquette « tête de groupe » est posée sur la cellule à la configuration. La citation prend sa hauteur idéale (`fixedSize`) et le contenu reste collé en haut : une cellule à hauteur ESTIMÉE (auto-dimensionnement différé par l'entonnoir pendant le mouvement) n'étire plus le rail. Sur-réserve ramenée à 0,3 hauteur visible — **limite connue** : l'entonnoir (4 invalidations partielles par transaction, garde anti-SIGTRAP du 18/08) laisse parfois une cellule pré-réalisée à sa hauteur estimée jusqu'à la pose (blanc sous la rangée) ; lever ce plafond demande une mesure de stabilité en fling, pas une retouche.
3. **Chrome du fil** : retour « quand on s'approche de la fin du scroll » (`FocalChromeReturn` : doigt posé ⇒ caché ; décélération ⇒ caché tant que la distance à l'offset d'arrivée capturé dans `scrollViewWillEndDragging` dépasse 160 pt ; repos ⇒ visible) ; chaque composant glisse VERS SON BORD en fondant et en revient (`EdgeHiddenChrome`, en-tête vers le haut sans démontage, composeur et bulle « retour en bas » vers le bas).
4. **Rivière — lot 1 (point d'entrée)** : `RiverConversationMapping` (fil → loi ; messages système et supprimés ne sont pas des voix ; participants = expéditeurs ; texte Prisme injecté ; curseur d'ouverture = bulle la plus récente), `RiverConversationHost` (navigation possédée, géométrie recalculée sur empreinte des voix), `ConversationView` câble `isRiverFlagEnabled` (drapeau `riviere_mode`, hors bêta : `MEESHY_FLAG_RIVIERE_MODE=1` ou `meeshy.flag.riviere_mode`) et monte l'hôte derrière `mode == .river`. Lots 2–5 (système gravés pleine largeur, gestes/retours, éligibilité réelle, recette) dans `tasks/todo.md`.

**Alternatives rejetées**: identité sur TOUTES les rangées Focal (aurait évité la reconfiguration à la pose mais change la densité du mode) ; relever le budget d'invalidations du layout (garde de crash) sans campagne de flings.
