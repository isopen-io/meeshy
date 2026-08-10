# Decisions - packages/MeeshySDK (Swift SDK)

## 2026-08-10: Prisme de l'aperçu — deux chemins, une seule convention de clés
**Statut**: Accepté
**Contexte**: `MeeshyConversation.resolvedLastMessagePreview(preferredLanguages:)` et ses douze témoins existent depuis longtemps ; le champ qu'ils lisent (`lastMessageTranslations`) valait `nil` par le chemin REST, faute de champ dans `APIConversation` et de production côté gateway. La doc du champ annonçait le câblage au futur et renvoyait à un contournement applicatif (`ConversationListViewModel.attachLastMessageTranslations`) qui n'existe nulle part. Le gateway expédie désormais `lastMessageTranslations` et `lastMessageOriginalLanguage`.
**Decision**: `APIConversation` décode les deux clés au niveau CONVERSATION (pas dans `lastMessage`) et `toConversation(currentUserId:)` les pose sur le domaine, **clés minuscules** — même normalisation que `ConversationSyncEngine.previewTranslations(from:)` sur le chemin socket. Une carte vide reste `nil` : le résolveur distingue « aucune traduction utile » de « carte présente », et `{}` sérialiserait inutilement dans le cache disque. `lastMessageOriginalLanguage` est ce qui permet de séparer « pas de traduction vers ma langue » de « le message EST déjà dans ma langue » (règle #3 du Prisme).
**Alternatives rejetées**: porter la carte dans `APIConversationLastMessage` (elle n'a pas la forme de `Message.translations`, un `[APITextTranslation]` — deux formes sous un même nom auraient dérivé, et `MeeshyConversation` décode déjà la clé plate pour son cache) ; élargir l'init memberwise de `MeeshyConversation` (il aurait fallu toucher chacun de ses appelants pour deux champs optionnels) ; laisser le seul chemin socket alimenter le champ (les traductions arrivent APRÈS le `message:new`, et le démarrage à froid n'en voit aucune).
**Cons**: la ligne de liste applique le Prisme dès le premier chargement REST ; une gateway antérieure qui n'envoie pas les clés reste décodable et retombe sur `lastMessagePreview` brut ; le fanout `conversation:updated` ne porte pas encore la carte, donc une ligne rafraîchie par édition/suppression revient temporairement à l'original.


## 2025-02: Architecture - Dual-Target (MeeshySDK + MeeshyUI)
**Statut**: Accept
**Contexte**: Sparation logique mtier et UI pour rutilisabilit
**Decision**: Deux targets SPM: `MeeshySDK` (core, pas de SwiftUI) et `MeeshyUI` (composants SwiftUI, dpend de MeeshySDK)
**Alternatives rejet**: Target unique (force dpendance SwiftUI pour le core), framework spar (overhead maintenance), micro-packages (trop fragment)
**Cons**: Possibilit d'utiliser le SDK sans UI (tests, extensions, widgets)

## 2025-02: Dpendance unique - Socket.IO Client
**Statut**: Accept
**Contexte**: Minimiser les dpendances externes pour stabilit et taille du binaire
**Decision**: Seule dpendance: `socket.io-client-swift 16.1+`. URLSession pour HTTP, Foundation pour JSON, Combine pour streams
**Alternatives rejet**: Alamofire (URLSession suffit), Starscream (Socket.IO l'inclut dj), SwiftyJSON (Codable natif suffit)
**Cons**: Plus de code custom pour HTTP, mais contrle total et zro dpendance transitoire

## 2025-02: Networking - APIClient gnrique async/await
**Statut**: Accept
**Contexte**: Client HTTP type-safe avec refresh token automatique
**Decision**: APIClient singleton, mthode gnrique `request<T: Decodable>()`, retry automatique sur 401 avec token refresh, dcodage ISO8601 fractionnaire
**Alternatives rejet**: Alamofire (dpendance inutile), async URLSession brut (boilerplate), Moya (trop abstrait)
**Cons**: Code custom  maintenir, mais type-safe et sans dpendance

## 2025-02: Sockets - Deux managers spars
**Statut**: Accept
**Contexte**: Messages et feed social ont des cycles de vie diffrents
**Decision**: `MessageSocketManager` (messages temps rel) et `SocialSocketManager` (posts, stories, statuts) comme singletons spars
**Alternatives rejet**: Manager unique (reconnexion d'un type affecte l'autre), trois+ managers (fragmentation excessive)
**Cons**: Code dupliqu (connexion, reconnexion, auth), mais reconnexion indpendante

## 2025-02: Cache Mdia - Swift Actor
**Statut**: Superseded by Unified Cache System (2026-03)
**Contexte**: Accs concurrent au cache depuis multiple threads
**Decision**: `actor MediaCacheManager` avec double couche (NSCache mmoire + FileManager disque 7j TTL), dduplification in-flight
**Alternatives rejet**: Class avec locks (error-prone), DispatchQueue (legacy), Kingfisher seul (pas de cache audio/vido)
**Cons**: Syntaxe `await` obligatoire pour chaque accs au cache

## 2026-03: Unified Cache System - CacheCoordinator + typed stores
**Statut**: Accept
**Contexte**: 5 cache managers indpendants (Conversation, Message, Participant, UserProfile, Media) avec logique duplique, flush/eviction incohrents, et aucune coordination centralize
**Decision**: Systme unifi avec 3 couches:
- **Foundation types**: `CachePolicy` (TTL/staleTTL/maxItemCount), `CacheIdentifiable`, `CacheResult<T>` (.fresh/.stale/.expired/.empty), `ReadableCacheStore`/`MutableCacheStore` protocols
- **GRDBCacheStore<Key, Value>**: Actor gnrique L1 Dictionary + L2 GRDB SQLite, dirty tracking (2s debounce + 10s max cap), LRU eviction
- **DiskCacheStore**: Actor L1 NSCache + L2 FileManager, SHA256 file naming, budget eviction, static UIImage cache
- **CacheCoordinator**: Actor singleton exposant `.conversations`, `.messages`, `.participants`, `.profiles` (GRDBCacheStore) et `.images`, `.audio`, `.video` (DiskCacheStore). Souscrit  17+ vnements Socket.IO, gre lifecycle (background flush, memory warning eviction)
- **ParticipantService**: Actor app-layer avec pagination (loadFirstPage, loadNextPage, hasMore)
**Alternatives rejet**: Core Data (heavyweight, pas actor-native), Realm (dpendance externe massive), pure UserDefaults (pas de requetes), garder les 5 managers spars (duplication ingrable)
**Cons**: Un seul point d'entre pour tout le cache, politiques configurable par type de donne, stale-while-revalidate pattern, tests isols via injection de dpendances (MockMessageSocket, MockSocialSocket, in-memory DatabaseWriter)
**Fichiers supprims**: ConversationCacheManager, MessageCacheManager, ParticipantCacheManager, UserProfileCacheManager, MediaCacheManager, DBCachedParticipant, LocalStore, SQLLocalStore + 4 test files

## 2025-02: Models - Decodable + toDomain() pattern
**Statut**: Accept
**Contexte**: Les rponses API et les modles de domaine ont des formes diffrentes
**Decision**: Modles `APIxxx: Decodable` (forme API) avec extensions `toDomain()` vers modles de domaine (forme app)
**Alternatives rejet**: Modle unique (mlange concerns API et UI), DTO manual mapping (plus verbeux), Codable bidirectionnel (pas toujours ncessaire)
**Cons**: Double modle  maintenir, mais sparation claire API vs domaine

## 2025-02: Auth - UserDefaults (DETTE TECHNIQUE)
**Statut**: Accept (temporaire)
**Contexte**: Rapidit de dveloppement, simplicit en simulateur
**Decision**: Tokens JWT et session stocks dans `UserDefaults.standard` sous cls `meeshy_auth_token` et `meeshy_session_token`
**Alternatives rejet**: Keychain (solution correcte mais complexit entitlements)
**Cons**: **RISQUE SCURIT** - UserDefaults non chiffr, extractible depuis backup device
**Action requise**: Migrer vers Keychain avant release production (priorit haute)

## 2025-02: Events - Combine PassthroughSubject
**Statut**: Accept
**Contexte**: Les socket managers doivent publier des vnements de manire ractive
**Decision**: `PassthroughSubject<EventType, Never>` pour chaque type d'vnement, subscribers via `.sink()` + `AnyCancellable`
**Alternatives rejet**: Callbacks/closures (pas composables), AsyncStream (moins flexible pour multi-subscribers), NotificationCenter (pas type-safe)
**Cons**: Gestion manuelle des `AnyCancellable`, `[weak self]` obligatoire dans closures

## 2025-02: Configuration - MeeshyConfig centralis
**Statut**: Accept
**Contexte**: URLs et timeouts doivent tre configurables par environnement
**Decision**: `MeeshyConfig` avec URLs de base (API, WebSocket, media), timeouts, feature flags
**Alternatives rejet**: Hardcod (pas multi-env), xcconfig seul (pas accessible au runtime), UserDefaults (pas de dfauts types)
**Cons**: Un seul point de configuration pour tout le SDK

## 2026-05: Story Canvas — Cartographie GPU/Metal (NE PAS SUPPRIMER)

**Statut**: Reference document — règle de préservation

**Contexte**: Lors de l'audit 2026-05-11 plusieurs composants story-canvas étaient orphelins (0 référence production). Risque de suppression accidentelle d'optimisations Metal pendant cleanup. Spec mère D-6 (`docs/superpowers/specs/2026-05-08-story-canvas-fidelity-design.md`) précise les 4 hot paths GPU.

**Inventaire Metal/GPU dans `Story/Canvas/`** :

| Composant | Optimisation | Wiré ? | Règle |
|---|---|---|---|
| `Metal/StoryFilters.metal` + `Layers/StoryFilteredLayer.swift` | Custom Metal compute kernels (vintageFilter, bwContrastFilter) via CAMetalLayer | ✅ | KEEP — filter pipeline production |
| `StoryBlurFilter.swift` | **MPSImageGaussianBlur** (Metal Performance Shaders, GPU) — 3× plus rapide que `CIGaussianBlur` | ❌ Orphelin actuellement | **🚨 NE PAS SUPPRIMER** — réservé glass UI / sticker glow (Phase 3 Task 3.2 spec). Wiring quand le modèle exposera `backgroundStyle: .glass` ou `glowRadius: Float`. |
| `StoryMediaDecoder.swift` | VideoToolbox HW decode + MetalKit textures | ✅ Via `StoryMediaLoader` | KEEP — production |
| `StoryRenderingContext.swift` | Singleton Metal device + command queue partagés | ✅ Partout | KEEP — fondamentale |
| `StoryRendererCache.swift` (B3) | Cache CALayer (GPU via Core Animation render server) entre frames d'export | ✅ `StoryAVCompositor` | KEEP — Plan B production |
| `StoryAVCompositor.swift` (Phase 4) | Custom `AVVideoCompositing` → render direct CALayer dans CVPixelBuffer | ❌ Pipeline export pas consommé par `StoryPublishService` actuellement | KEEP — feature post-launch (video story exports) |

**Composants supprimés 2026-05-11** (commit `a1b58da8`) : `StoryComposerVC`, `StoryViewerVC`, `StoryComposerRepresentable`, `StoryModelMigration`. **AUCUN Metal/GPU**. C'étaient des wrappers UIKit/SwiftUI dev-time autour de `StoryCanvasUIView` qui n'ont jamais été branchés. La voie active est `StoryComposerCanvasView` (UIViewRepresentable direct sur `StoryCanvasUIView`).

**Decision/règle** : Avant tout cleanup d'orphelin dans `Story/Canvas/`, vérifier :
1. Le fichier importe-t-il `Metal` / `MetalKit` / `MetalPerformanceShaders` / `VideoToolbox` ? Si oui → préserver, ouvrir une issue "wire X feature".
2. Sinon → safe à supprimer.

**Alternatives rejetées** : Suppression aveugle des orphans aurait perdu `StoryBlurFilter` (39L) qui réutilise l'infrastructure Metal partagée et est pré-câblé pour des features glass UI futures.

**Cons** : Carry-over de ~40L de code non-wiré. Acceptable — coût de maintenance < coût de re-implémenter l'optimisation Metal.

## 2026-05-12: Story Publish Queue — Unification (StoryOfflineQueue → adapter)

**Statut** : Accepté

**Contexte** : Deux queues persistantes coexistaient pour les stories en attente de publish, chacune avec sa propre persistance disque et son propre handler :
- `StoryPublishQueue` (`Documents/meeshy_cache/story_publish_queue.json`) : retry + backoff exponentiel (5 tentatives, 30s→2h), handler typé `(Item) async throws -> String`, drainage automatique sur reconnexion via `MessageSocketManager.isConnected`.
- `StoryOfflineQueue` (`applicationSupportDirectory/StoryOfflineQueue/story_offline_queue.json`) : FIFO bounded 20, handler `(Item) async -> Bool`, drainage via `NetworkMonitor.isOffline` observé par `StoryOfflineQueueBootstrap`.

Les call-sites étaient éparpillés : `StoryViewModel.publishOffline()` enqueuait dans `StoryPublishQueue.shared` ; `TimelineViewModel.handlePublishTap()` enqueuait dans `StoryOfflineQueue.shared` via le seam `OfflineQueueProviding`. Résultat : un item pouvait dormir dans une queue sans handler câblé (la prod ne wirait que `StoryOfflineQueue`, alors que `StoryPublishQueue.setPublishHandler` n'avait aucun call-site). Risque de double publish si un dev câblait les deux, ou de perte silencieuse si la mauvaise était drainée.

**Décision** : consolider sur `StoryPublishQueue` comme unique source de vérité. `StoryOfflineQueue` devient un adapter fin qui forward toutes ses opérations (`enqueue`, `dequeue`, `pendingItems`, `flush`, `purge`, `setOnPublish`) vers `StoryPublishQueue` via le protocole de test seam `PublishQueueForwarding`. Le handler `Bool`-returning legacy est wrappé en `throws -> String` typé : `false` devient un throw `StoryOfflineRetryableError` (que `StoryPublishQueue` interprète comme retryable), `true` synthétise le `tempStoryId` comme `publishedStoryId`. La conversion `StoryOfflineQueueItem ↔ StoryPublishQueueItem` est pure et testable via `StoryQueueItemConverter.convert(_:)` / `.reverse(_:)`, en utilisant `tempStoryId` comme carrier pour l'id legacy (`StoryOfflineQueue.dequeue(itemId)` reste adressable).

Une utility one-shot `StoryQueueMigrator.migrateLegacyOfflineQueue()` draine le fichier legacy `applicationSupportDirectory/StoryOfflineQueue/story_offline_queue.json` sur cold start : décodage, conversion item par item, forward via `PublishQueueForwarding`, puis suppression du fichier source. Idempotente (no-op si le fichier est absent) ; un JSON corrompu est renommé `.corrupted-<timestamp>` pour stopper le retry tout en préservant les octets pour forensic.

**Alternatives rejetées** :
- **Déprécier `StoryOfflineQueue`** (Option B) : breaking pour `TimelineViewModel+OfflinePublish` (4 call-sites) et `MockOfflineQueue` ; rejeté car coût de migration > coût de l'adapter (~120 LoC).
- **Garder les deux queues + bridge dans Bootstrap** : continue de payer le double-store et la confusion ; rejeté car le bug architectural reste structurellement présent.
- **Fold dans `OfflineQueue` (outbox)** : `OfflineQueue` est messaging-only, son schéma `OutboxRecord` ne fitte pas les payloads de slide + media. La fusion outbox est trackée séparément par `Mutations/MutationPayloads.PublishStoryPayload` (Tier C, post-launch).

**Conséquences** :
- Une seule queue persistée → plus de risque de perte d'item selon le call-site.
- Retry + backoff exponentiel + max 5 tentatives + hash-check des média locaux → garanties uniformes pour tous les call-sites (`StoryViewModel`, `TimelineViewModel`, futurs composants).
- `StoryOfflineQueueTests` actuels touchent à des invariants de stockage (path `applicationSupportDirectory`, `reloadFromDisk` semantics) qui ne s'appliquent plus à l'adapter ; ils seront mis à jour ou supprimés dans un follow-up.
- `StoryQueueItemConverter.reverse(_:)` est lossy sur `originalLanguage` (non porté dans `StoryPublishQueueItem`). Acceptable : aucun call-site de production ne lit ce champ pour le moment ; si besoin, ajouter un champ optionnel sur `StoryPublishQueueItem` dans une révision ultérieure.

**Fichiers concernés** :
- `Sources/MeeshySDK/Persistence/StoryQueueMigrator.swift` (nouveau) : protocole `PublishQueueForwarding`, conformance `StoryPublishQueue`, enum `StoryQueueMigrator`, enum `StoryQueueItemConverter` (forward only ; `reverse` vit avec l'adapter).
- `Sources/MeeshySDK/Persistence/StoryOfflineQueue.swift` (réécrit) : adapter actor, plus de fichier disque propre, conversion bidirectionnelle.
- `Tests/MeeshySDKTests/Persistence/StoryQueueUnificationTests.swift` (nouveau) : forwarding, pendingItems round-trip, migration drainage, idempotence, JSON corrompu.

## 2026-05-12: ThumbHash — alignement Wolt spec (encodeur + decodeur DCT complets)

**Statut** : Accepté

**Contexte** : Le pipeline placeholder image bout en bout était cassé. Côté gateway (`services/gateway/src/services/attachments/ThumbHashGenerator.ts`), `rgbaToThumbHash` du package npm `thumbhash@0.1.1` (Wolt spec, auteur Evan Wallace) produit des hashes ~22-30 octets : 5 octets de header (24-bit + 16-bit) + nibbles AC encodés via DCT, persistés dans `Attachment.thumbHash` / `StorySlideMedia.thumbHash`. Côté iOS, `packages/MeeshySDK/Sources/MeeshySDK/Utils/ThumbHash.swift` :
- L'encodeur retournait seulement `[h0, h1, h2, h3, h4]` (5 octets DC), perdant tous les coefficients AC. Incompatibilité totale avec le format gateway.
- Le décodeur (`thumbHashToRGBA`) ignorait les AC et remplissait toute la sortie avec la couleur moyenne ; le layout des helpers (`thumbHashToAverageRGBA`) était également incorrect (`header24` dérivé de 4 octets au lieu de 3 ; P/Q remappés sur [0,1] au lieu de [-1,+1]).
- `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/Layers/StoryBackgroundLayer.swift` : le seam `ThumbHashDecoder.decodeIfAvailable(_:size:)` était un no-op (`return nil`) malgré la présence de `Utils/ThumbHash.swift` dans le SDK.

Conséquence : sur tout backdrop image de story (et tout `ProgressiveCachedImage`/`CachedAsyncImage` consommant `thumbHash`), l'utilisateur voyait un fond noir pendant le chargement réseau au lieu du blur preview "Instagram-like" promis par l'axe "optimistic preview" du brief.

**Décision** : porter l'implémentation Swift de référence d'Evan Wallace (https://github.com/evanw/thumbhash/blob/main/swift/ThumbHash.swift, MIT) dans `Utils/ThumbHash.swift`. Le port :
- **Encodeur** : DCT complet sur les canaux L/P/Q (et A si alpha présent), packing header 24 bits sur bytes [0..2], header 16 bits sur bytes [3..4], puis AC sur nibbles successifs (deux nibbles par byte). Largeur typique 25-28 octets — byte-compatible avec `thumbhash` npm.
- **Décodeur** : lecture inverse des deux headers, extraction de `lScale`/`pScale`/`qScale`/`hasAlpha`/`isLandscape`/`lx`/`ly`, IDCT à 32 px sur le plus long côté. Retourne `(0, 0, [])` si le hash est tronqué (manque d'octets AC) au lieu de fabriquer des pixels.
- **API publique inchangée** : `rgbaToThumbHash(w:h:rgba:)`, `thumbHashToRGBA(hash:)`, `thumbHashToAverageRGBA(hash:)`, `thumbHashToApproximateAspectRatio(hash:)`, `UIImage.toThumbHash()`, `UIImage.fromThumbHash(_:)`, `UIImage.thumbHashAverageColor(_:)`. Les call-sites (`StorySlideRenderer.computeThumbHash`, `StoryComposerView`, `ProgressiveCachedImage`, `CachedAsyncImage`, `InlineVideoPlayerView`) n'ont rien à changer.
- **Seam UI** : `StoryBackgroundLayer.ThumbHashDecoder.decodeIfAvailable(_:size:)` devient `nonisolated static func` et délègue à `UIImage.fromThumbHash(_:)`. Le paramètre `size:` est volontairement ignoré : `CALayer` gère le resampling via `contentsGravity = .resizeAspectFill`, pré-scaler ici gaspille du CPU et dégrade la qualité sur retina.

**Alternatives rejetées** :
- **Option B — "couleur moyenne floutée"** : renommer en `AverageColorHash`, garder 5 octets, ajouter `@available(*, deprecated, renamed:)`. Incompatible avec la prod : tous les hashes existants en MongoDB ont été générés par le gateway au format Wolt complet. Les 5 premiers octets sont juste un préfixe — interpréter le reste comme alpha DC + nibbles serait incorrect et produirait des couleurs fausses. De plus, l'UX "fond noir → image" est strictement pire que "blur preview → image".
- **Ajouter un package SPM `evanw/thumbhash`** : pas de `Package.swift` publié dans le repo de référence (un seul fichier `ThumbHash.swift` standalone). Le coût de vendoring + maintenance license MIT est négligeable vs. ajouter une dépendance SPM exotique.
- **Demander au gateway d'émettre un format compact 5 octets** : casse le contrat avec `apps/web` (consomme `thumbHash` via la lib npm officielle pour ses placeholders Next.js) et avec d'éventuels clients tiers/forward-compat.

**Conséquences** :
- Le décodeur strict refuse les hashes tronqués (≥ 5 octets de header sans AC). Les anciens tests qui forgeaient un 5-byte hash artificiel ont été remplacés par des roundtrip tests utilisant des buffers RGBA réels — l'intent (valider qu'un hash décode) est mieux servi par cette approche.
- Coût CPU encodeur : ~5-15 ms sur une image 100×100 (vs. ~2-5 ms pour l'ancien encodeur DC-only). Acceptable : appelé une seule fois par slide à la publication (`StorySlideRenderer.computeThumbHash`), jamais sur chemin de rendu. Décodeur : ~1-3 ms (IDCT 32px), bien sous le budget frame 16 ms.
- Le hash passe d'environ 8 caractères base64 (5 octets) à ~36-40 caractères (25-28 octets). Toujours sous le seuil "tiny string" — la colonne MongoDB `thumbHash` est déjà dimensionnée pour `~33 chars` (cf. commentaire schema `attachments` ligne 725 / `storySlideMedia` ligne 2805).
- `nonisolated` sur `ThumbHashDecoder.decodeIfAvailable` requis car `MeeshyUI` applique `.defaultIsolation(MainActor)` (SE-0466) et le seam doit être appelable sans hop d'actor depuis les chemins de `Task { @MainActor in ... }` de `StoryBackgroundLayer.configure`. Pure CPU + `UIImage` immutable = sûr sans isolation.

**Fichiers concernés** :
- `Sources/MeeshySDK/Utils/ThumbHash.swift` (réécrit, ~450 LoC) : port Wolt complet, licence MIT vendored en en-tête, helper `clampNibble` privé pour borner les quantizations.
- `Sources/MeeshyUI/Story/Canvas/Layers/StoryBackgroundLayer.swift` (lignes 174-191) : `ThumbHashDecoder.decodeIfAvailable` → `UIImage.fromThumbHash(_:)`, marqué `nonisolated static`.
- `Tests/MeeshySDKTests/Utils/ThumbHashTests.swift` : remplacement de `test_fromThumbHash_validBase64_createsImage` par un test de roundtrip + ajout `test_fromThumbHash_truncatedFiveByteHeader_returnsNil` ; remplacement de `test_thumbHashToRGBA_validHash_returnsNonEmptyPixels` par un roundtrip + ajout `test_thumbHashToRGBA_truncatedAfterHeader_returnsEmpty`.
- `Tests/MeeshySDKTests/Utils/ThumbHashPipelineTests.swift` (nouveau) : roundtrip simple, roundtrip avec alpha, landscape preserve aspect, négatifs (invalid/empty/truncated), simulation gateway 100×100, préservation couleur dominante.
- `Tests/MeeshyUITests/Story/Canvas/ThumbHashDecoderIntegrationTests.swift` (nouveau) : seam `ThumbHashDecoder` (empty/invalid/valid) ; `StoryBackgroundLayer.configure(kind: .image(...))` assigne ou non `CALayer.contents` selon la validité du hash.

## 2026-08-09 : AudioPlayerView — l'audio suit la langue Prisme automatiquement (renversement du « B9 fix »)

**Statut** : Accepté

**Contexte** : `AudioPlayerView` séparait deux notions qui auraient dû être unifiées : la langue affichée dans le bandeau de transcription et la langue réellement JOUÉE. `selectedAudioLanguage` était bien seedé dès l'`init` avec la langue Prisme déjà résolue en amont par l'app (`resolveInitialTranscriptionLanguage(initialTranscriptionLanguage)`), mais `hasUserSelectedAudioLanguage` démarrait inconditionnellement à `false` et ne passait à `true` que dans `switchToLanguage` — le seul point atteint par un tap explicite sur un pill de langue ou un changement du binding `externalLanguage`. `resolvePlaybackUrl` (fonction pure statique testable) ne basculait sur une traduction que si `isUserSelected == true` ; sinon, retour systématique à `originalUrl`. Conséquence : la langue Prisme résolue servait uniquement à préremplir le texte du bandeau de transcription, jamais à choisir la piste audio jouée — documenté explicitement dans le code comme une décision délibérée (« B9 fix »), pas un oubli, et verrouillé par une régression (`AudioPlayerViewPlaybackLanguageTests.swift`).

**Décision** : renversement assumé de cette politique — l'audio doit suivre la langue préférée automatiquement, comme le texte, sur demande explicite du propriétaire produit. `hasUserSelectedAudioLanguage` est renommé `hasExplicitAudioLanguage` (le nom `hasUserSelected...` devenait trompeur : le flag représente désormais « la lecture doit suivre `selectedAudioLanguage` », que ce soit par seed Prisme automatique ou par tap explicite, pas seulement par action utilisateur). Il est seedé dans l'`init`, juste après `_selectedAudioLanguage` :
```swift
self._hasExplicitAudioLanguage = State(
    initialValue: AudioPlayerView.resolveInitialTranscriptionLanguage(initialTranscriptionLanguage) != "orig"
)
```
`switchToLanguage` continue de poser le flag à `true` sur tap explicite (déjà `true` si Prisme avait résolu une langue — no-op idempotent). `resolvePlaybackUrl` garde exactement la même signature/logique, seul son paramètre `isUserSelected` est renommé `hasExplicitLanguage` : le vrai changement est uniquement la valeur initiale du flag côté appelant. Ceci respecte automatiquement la règle Prisme #1 (pas de traduction disponible dans la langue préférée ⇒ afficher l'original, jamais `translations.first`) car `resolveInitialTranscriptionLanguage` la respecte déjà en amont : si aucune traduction ne matche, la valeur résolue est `"orig"`, donc le flag reste `false` et la lecture reste sur l'original — comportement inchangé dans ce cas précis.

**Alternatives rejetées** :
- **Supprimer entièrement `hasExplicitAudioLanguage` et faire dépendre `resolvePlaybackUrl` uniquement de `selectedLanguage != "orig"`** : fonctionnellement équivalent dans tous les cas actuels (le flag devient redondant s'il ne fait que suivre la même valeur), mais supprime un point d'extension déjà nommé et documenté qui pourrait servir plus tard (télémétrie « choix explicite vs Prisme », persistance différenciée). Écarté pour rester au diff minimal et ne pas changer la signature de `resolvePlaybackUrl` sans raison.
- **Ne rien changer côté iOS, ne corriger que le bug web équivalent** : rejeté explicitement par le propriétaire produit — iOS est le frontend de référence sur lequel les autres (web) se calquent, il devait être corrigé en premier/ensemble.

**Conséquences** :
- Un audio dont Prisme a résolu une traduction (`initialTranscriptionLanguage` non-nil et ≠ `"orig"`) joue désormais automatiquement cette traduction dès l'ouverture du lecteur, sans tap utilisateur — parité avec le comportement texte.
- Le test `test_init_neverMarksLanguageAsUserSelected` (qui verrouillait l'ancien comportement) est inversé en `test_init_marksLanguageAsExplicitWhenPrismeResolvesATranslation` ; un cas de non-régression est ajouté pour `initialTranscriptionLanguage = nil`/`"orig"` (le flag reste `false`, lecture sur l'original).
- Les 4 tests purs existants sur `resolvePlaybackUrl` gardent leurs assertions telles quelles — seul le nom du paramètre à l'appel change.

**Fichiers concernés** :
- `Sources/MeeshyUI/Media/AudioPlayerView.swift` (commits `b9a9e0c90`, `b9a1a4f7e`) : renommage `hasUserSelectedAudioLanguage` → `hasExplicitAudioLanguage`, seed dans `init`, renommage du paramètre `isUserSelected` → `hasExplicitLanguage` sur `resolvePlaybackUrl`, mise à jour de la doc de `initialTranscriptionLanguage`.

**Limite connue** : `hasExplicitAudioLanguage` et `selectedAudioLanguage` sont des `@State`, seedés une seule fois dans `AudioPlayerView.init()`. Si la vue est déjà montée (bulle visible dans la conversation) et qu'une traduction arrive ENSUITE via une mise à jour temps réel, rien ne re-seed cet état aujourd'hui — contrairement à l'implémentation web (Tâche 2 de ce même plan, `apps/web/hooks/use-audio-translation.ts`) qui re-dérive réactivement la langue à chaque nouvelle traduction reçue. Concrètement : l'auto-follow Prisme ne s'applique qu'à la construction de `AudioPlayerView` (cold open, scroll-back, réutilisation de cellule) — pas à une traduction qui arrive pendant que la bulle est déjà affichée à l'écran ; l'utilisateur doit alors encore taper un pill de langue pour l'entendre. Assumé comme limitation connue plutôt que corrigé dans cette vague — un re-seed réactif en SwiftUI est un changement d'état non trivial et non testé qui mérite son propre cycle de tâche/revue. Candidat de suivi, pas une lacune que ce plan prétend avoir résolue.

Détail complet et rationale : `docs/superpowers/specs/2026-08-09-audio-translation-prisme-reliability-design.md` (Problème 1).
