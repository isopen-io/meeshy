# Audit Part 14 — MeeshySDK Core: Auth, Cache, Configuration, Models

Scope: 46 files from `packages/MeeshySDK/Sources/MeeshySDK/` covering the
authentication layer, the unified two-tier cache subsystem, configuration,
core utilities, crypto/diagnostics, and the bulk of the SDK domain models.

---

## packages/MeeshySDK/Sources/MeeshySDK/Auth/AuthManager.swift

**Purpose**: `@MainActor` singleton owning all authentication session state
(token storage, multi-account, session restore, optimistic profile mutation).

**Public API surface**:
- `struct ProfileSnapshot` (Sendable, Equatable) — `displayName`, `bio`, `avatarUrl`.
- `protocol AuthManaging` (`@MainActor`, `AnyObject`) — `isAuthenticated`, `currentUser`, `isLoading`, `errorMessage`, `savedAccounts`, `authToken`, `currentUserPublisher`; methods `login`, `register`, `requestMagicLink`, `validateMagicLink`, `requestPasswordReset`, `logout`, `checkExistingSession`, `handleUnauthorized`, `removeSavedAccount`, `applyLocalProfileChanges`, `restoreLocalProfileSnapshot`.
- `final class AuthManager: ObservableObject, AuthManaging` — `static shared`; `@Published` `isAuthenticated/currentUser/isLoading/errorMessage/savedAccounts`; `var authToken`, `var isCurrentTokenExpired`.

**Key behaviors / algorithms**:
- Per-user namespaced Keychain keys (`meeshy_token_<userId>`, `meeshy_user_<userId>`, `meeshy_session_token_<userId>`). Active user id in `UserDefaults` + an App Group suite (`group.me.meeshy.apps`) for extensions.
- JWT expiry check decodes the base64url payload inline, reads `exp`, applies a 30s margin.
- `checkExistingSession()`: cache-first auth (shows cached user before network), proactive token refresh when JWT near-expiry + sessionToken present, then background revalidation via `/auth/me` (stale-while-revalidate for the profile). `isActive==false` on revalidate → forced re-auth.
- `handleUnauthorized()` 401 handler with `isRefreshing` guard against concurrent refresh loops.
- Token rotation (refresh while already authenticated) triggers `MessageSocketManager`/`SocialSocketManager` `forceReconnect()`.
- Multi-account: `SavedAccount` list persisted to `UserDefaults`, sorted by `lastActiveAt`. `requireReauthentication` clears token but keeps saved account for one-tap re-login.
- `sanitizeDataURIs` strips `data:` avatar/banner before keychain persist.
- One-time migration from legacy global keys.
- Optimistic profile mutation: `applyLocalProfileChanges` returns a snapshot for rollback.

**Dependencies / couplings**: `KeychainManager`, `AuthService`, `APIClient`, `MessageSocketManager`, `SocialSocketManager`, `MeeshyUser`.

**Android port note**: Map to a `AuthRepository` (singleton via Hilt) exposing `StateFlow<AuthState>`. Use Android `EncryptedSharedPreferences`/Keystore for token storage, regular `SharedPreferences` for active-user-id and saved accounts. JWT decode via a small base64url helper or `nimbus-jose-jwt`. App-Group equivalent = a `ContentProvider` or shared prefs for widgets. Re-auth/refresh logic ports 1:1 to coroutines.

- [ ] Username/password login
- [ ] Registration
- [ ] Magic link request + validation
- [ ] Password reset request
- [ ] Multi-account (saved accounts, one-tap switch)
- [ ] Persistent session restore with proactive token refresh
- [ ] Optimistic profile edit with rollback

---

## packages/MeeshySDK/Sources/MeeshySDK/Auth/AuthModels.swift

**Purpose**: Codable request/response DTOs for the auth API + the central `MeeshyUser` model.

**Public API surface**:
- Requests: `LoginRequest`, `RegisterRequest`, `MagicLinkRequest`, `MagicLinkValidateRequest`, `ForgotPasswordRequest`, `ResetPasswordRequest`, `SendPhoneCodeRequest`, `VerifyPhoneRequest`, `VerifyEmailRequest`, `VerifyEmailCodeRequest`, `ResendVerificationRequest`, `RefreshTokenRequest`.
- Responses: `LoginResponseData`, `MagicLinkResponse`, `VerifyPhoneResponse`, `AvailabilityResponse` (`var available`), `MeResponseData`.
- `struct MeeshyUser` (Codable, Identifiable, Sendable, CacheIdentifiable) — ~30 fields (identity, status, translation prefs, profile enrichment, `signalIdentityKeyPublic`). `withProfileChanges(...)` immutable copy helper; `var preferredContentLanguages: [String]` — the Prisme Linguistique resolution order (systemLanguage → regionalLanguage → customDestinationLanguage → "fr"), explicitly excluding device locale.
- `struct SavedAccount` (Codable, Identifiable, Sendable) — `var shortName`.

**Android port note**: Kotlin `data class` with `@Serializable` (kotlinx.serialization) / Moshi. `preferredContentLanguages` is load-bearing for translation — port verbatim, case-insensitive dedup. `MeeshyUser` is the canonical user model; keep one source of truth.

---

## packages/MeeshySDK/Sources/MeeshySDK/Auth/AuthService.swift

**Purpose**: Stateless auth API calls (all state lives in `AuthManager`).

**Public API surface**:
- `protocol AuthServiceProviding: Sendable` — login, register, requestMagicLink, validateMagicLink, requestPasswordReset, resetPassword, sendPhoneCode, verifyPhone, verifyEmail, verifyEmailWithCode, resendVerificationEmail, checkAvailability, refreshToken, me, logout.
- `final class AuthService: @unchecked Sendable` — `static shared`, init injects `APIClientProviding`. Also `changePassword`, `verifyEmail(token:)`, `resendEmailVerification`.

**Key behaviors**: Endpoints under `/auth/*` and `/users/me/password`. Non-`APIResponse` endpoints check `success` flag and throw `MeeshyError.server`.

**Android port note**: Retrofit interface `AuthApi` + a thin `AuthService` wrapper. Inject via Hilt. Keep stateless.

---

## packages/MeeshySDK/Sources/MeeshySDK/Auth/MeeshyUser+ProfileMutation.swift

**Purpose**: `MeeshyUser` extension — `withProfileChanges(displayName:bio:avatar:)` immutable copy (PATCH semantics: `nil` = leave unchanged).

**Note**: Duplicates the 3-arg overload also declared in `AuthModels.swift` (`withProfileChanges` with 6 params). Minor tech debt — two near-identical helpers.

**Android port note**: Kotlin `data class.copy()` makes this entire file redundant. Drop it.

---

## packages/MeeshySDK/Sources/MeeshySDK/Cache/AVAsset+NaturalDisplaySize.swift

**Purpose**: AVFoundation extensions to compute a video track's rotation-corrected display size.

**Public API**: `AVAssetTrack.naturalDisplaySize() async throws -> CGSize`; `AVURLAsset.naturalDisplaySize(of:) async throws -> CGSize?`.

**Key behavior**: Detects portrait via `preferredTransform` (`abs(b)==1 && abs(c)==1`), swaps width/height. Cardinal-rotation idiom matching `MediaCompressor`.

**Android port note**: Use `MediaMetadataRetriever` (`METADATA_KEY_VIDEO_WIDTH/HEIGHT/ROTATION`) or `MediaExtractor`. Swap dimensions when rotation is 90/270.

---

## packages/MeeshySDK/Sources/MeeshySDK/Cache/AudioPlayerManager.swift

**Purpose**: `@MainActor ObservableObject` audio player (voice messages) — disk-cache-first then network streaming.

**Public API**: `@Published isPlaying/progress/duration`; callbacks `onWillPlay`/`onDidStop`; `play(urlString:)`, `playLocalFile(url:)`, `stop()`, `togglePlayPause()`.

**Key behaviors**:
- Resolves URL via `MeeshyConfig.resolveMediaURL`; checks `CacheCoordinator.audioLocalFileURL` for instant local playback; else streams via `AVPlayer` and caches in the background.
- Local file → `AVAudioPlayer` + 0.05s `Timer` progress; stream → `AVPlayer` + periodic time observer; observes duration/rate/end-of-playback via Combine.
- Configures `AVAudioSession` `.playback` for background audio.

**Android port note**: ExoPlayer/Media3 `ExoPlayer` with a `CacheDataSource` (SimpleCache) gives disk-cache-first + streaming for free. Expose state via `StateFlow`. `onWillPlay`/`onDidStop` → a `PlaybackCoordinator` to enforce single active player.

- [ ] Voice/audio message playback with progress + duration
- [ ] Disk-cache-first audio (instant replay)

---

## packages/MeeshySDK/Sources/MeeshySDK/Cache/CacheBackgroundFlushTask.swift

**Purpose**: `BGProcessingTask` entry point that drains the `CacheCoordinator` dirty set after the app is suspended/terminated.

**Public API**: `final class CacheBackgroundFlushTask: Sendable` — `static identifier = "me.meeshy.cache.background-flush"`, `register()`, `run(deadline:)`.

**Key behaviors**: 25s budget (under iOS's 30s expiration). Registered once at launch, submitted on `willTerminate`. Replaces a fragile `DispatchSemaphore.wait(timeout:4)`.

**Android port note**: Use `WorkManager` (one-time `OneTimeWorkRequest`) or a `lifecycle` `ProcessLifecycleOwner` `onStop`. Android does not kill as aggressively; a `CoroutineWorker` flushing the dirty set on background transition is the natural map. Plist identifier becomes a Worker tag.

---

## packages/MeeshySDK/Sources/MeeshySDK/Cache/CacheBox.swift

**Purpose**: Non-generic `NSObject` wrapper around `Data` so it can live in `NSCache` (requires reference types).

**Note**: Deliberately non-generic to dodge a Swift 6.3.2 optimizer crash — an iOS toolchain workaround.

**Android port note**: Not needed — Android caches (`LruCache`) hold any object. Drop entirely.

---

## packages/MeeshySDK/Sources/MeeshySDK/Cache/CacheCoordinator.swift

**Purpose**: `actor` singleton — the single entry point for all cached data. Owns ~26 typed `GRDBCacheStore`s + 4 `DiskCacheStore`s, plus in-memory translation/transcription/audio caches; subscribes to lifecycle for flush/eviction.

**Public API surface**:
- `actor CacheCoordinator` — `static shared`.
- GRDB stores: `conversations`, `messages`, `participants`, `profiles`, `feed`, `comments`, `stories`, `stats`, `notifications`, `affiliateTokens`, `shareLinks`, `trackingLinks`, `communityLinks`, `communities`, `drafts`, `statuses`, `friends`, `friendRequests`, `blockedUsers`, `userSearch`, `timeline`, `categories`, `userTags`, `userPreferences`, `conversationPreferences`.
- Disk stores: `images`, `audio`, `video`, `thumbnails`.
- Synchronous nonisolated helpers: `videoLocalFileURL`, `audioLocalFileURL`, `cachedImage`, `configureImageMemory(budgetBytes:)`.
- Translation/transcription/audio: `cachedTranslations`, `cachedTranscription`, `cachedAudioTranslations`, `cacheTranslation`, `cacheTranscription`, `cacheAudioTranslation`.
- Lifecycle: `start()`, `reset()`, `flushAll(deadline:)`, `evictUnderMemoryPressure()`, `invalidateAll()`, `invalidateTranslationCaches()`.
- `protocol ProfileCacheWriting` + extension `saveProfile`.
- Test helpers: `markDirtyForTest`, `dirtyCountForTest`.

**Key behaviors**:
- Sensitive stores constructed with `encrypted: true` (conversations, messages, profiles, notifications, friendRequests, blockedUsers, userPreferences, conversationPreferences).
- Per-namespace GRDB store isolation; stores NOT keyed by userId so `reset()` purges everything (incl. disk media) on logout to prevent cross-account leakage.
- In-memory translation cache: 500-entry LRU + 24h TTL enforced on read; incremental persistence to GRDB `TranslationCacheRecord`.
- Lifecycle: `willResignActive`/`didEnterBackground`/`willTerminate` → `flushAll`; `willTerminate` also submits the BGProcessingTask + a 4s foreground flush; memory warning → `evictUnderMemoryPressure`.
- FTS5 search-index backfill gated by a one-time `UserDefaults` flag.

**Android port note**: This is the architectural keystone. Map to a `CacheManager` singleton (Hilt) holding Room DAOs for the GRDB stores and a file-cache for media. Room replaces GRDB; SQLCipher for the encrypted stores. `actor` isolation → confine mutations to a single-threaded dispatcher or use a `Mutex`. Lifecycle hooks → `ProcessLifecycleOwner` + `WorkManager`. The 30-store fan-out is verbose but mechanical; keep the typed-store pattern.

- [ ] Unified two-tier cache for all domain data
- [ ] Encrypted cache for sensitive data
- [ ] Background/terminate flush of dirty cache
- [ ] Memory-pressure eviction
- [ ] Cache wipe on logout/account switch

---

## packages/MeeshySDK/Sources/MeeshySDK/Cache/CacheFirstLoader.swift

**Purpose**: Generic helper implementing cache-first / stale-while-revalidate over a `MutableCacheStore` + fetch closure.

**Public API**: `final class CacheFirstLoader<Store: MutableCacheStore>: @unchecked Sendable` — `load(fetch:setLoadState:apply:) async -> Task<Void,Never>?`.

**Key behaviors**:
- `.fresh` → apply + `LoadState.cachedFresh`, no revalidation.
- `.stale` → apply cached + `.cachedStale`, return a detached revalidation `Task` (caller cancels on teardown); on success apply fresh + `.loaded` + save.
- `.expired`/`.empty` → `.loading`, await fetch, apply + `.loaded` + save, or `.offline`/`.error`.
- All UI mutations on `@MainActor`.

**Android port note**: This is THE SWR primitive. Map to a generic `cacheFirstFlow()` returning `Flow<Resource<T>>` or a suspend function emitting `LoadState` updates. Network-monitor injection → an `Online` checker. The "return a cancelable Task" pattern → structured concurrency: the caller's `viewModelScope` auto-cancels.

---

## packages/MeeshySDK/Sources/MeeshySDK/Cache/CacheIdentifiable.swift

**Purpose**: `protocol CacheIdentifiable: Sendable { var id: String }` — marks models storable in `GRDBCacheStore`.

**Android port note**: Kotlin `interface CacheIdentifiable { val id: String }`.

---

## packages/MeeshySDK/Sources/MeeshySDK/Cache/CachePolicy.swift

**Purpose**: TTL/staleTTL/maxItemCount/storage-location policy + the predefined policy set.

**Public API**: `struct CachePolicy` — `ttl`, `staleTTL`, `maxItemCount`, `storageLocation` (`enum StorageLocation { grdb / disk(subdir,maxBytes) }`), `enum Freshness { fresh/stale/expired }`, `freshness(age:)`. Predefined statics: `conversations`, `messages` (6mo/600), `participants`, `userProfiles`, `mediaImages` (300MB), `mediaAudio` (200MB), `mediaVideo` (500MB), `thumbnails` (50MB), `feedPosts`, `comments`, `stories`, `notifications`, `userStats`, `linksAndTokens`, `statuses`, `preferences`, `communities`, `drafts` (30d, local-only). `TimeInterval` helpers `minutes/hours/days/months/years`.

**Key behavior**: `staleTTL > ttl` is clamped with a warning. Drafts set `staleTTL == ttl` so reads always land in `.fresh`.

**Android port note**: Kotlin `data class CachePolicy` with companion-object constants. Port the exact TTL values — they encode product-tuned freshness windows.

---

## packages/MeeshySDK/Sources/MeeshySDK/Cache/CacheResult.swift

**Purpose**: `enum CacheResult<T: Sendable>` — `.fresh(T,age)`, `.stale(T,age)`, `.expired`, `.empty`.

**Key behavior**: `.value` is `@deprecated` (collapsing freshness defeats SWR); `snapshot()` is the sanctioned internal accessor. UI must `switch` exhaustively.

**Android port note**: Kotlin `sealed class CacheResult<out T>`. Keep the discipline: do not add a generic `.value` shortcut for UI code.

---

## packages/MeeshySDK/Sources/MeeshySDK/Cache/CacheStoreProtocols.swift

**Purpose**: `ReadableCacheStore<Key,Value>` (+ `policy`, `load`, `invalidate`, `invalidateAll`) and `MutableCacheStore` (+ `save throws`, `update`, `mergeUpdate`).

**Key behavior**: `save` throws (strict — surfaces encryption failures rather than silently dropping). `mergeUpdate` falls back to L2/empty when L1 cold (unlike `update`).

**Android port note**: Kotlin `interface CacheStore<K,V>` with `suspend` functions; suspend funcs can throw naturally.

---

## packages/MeeshySDK/Sources/MeeshySDK/Cache/DecodedImageCache.swift

**Purpose**: Cost-based `NSCache` for decoded `CGImage`s (used by full-screen viewers); auto-evicts on memory warning.

**Public API**: `final class CGImageRef: NSObject`; `final class DecodedImageCache: @unchecked Sendable` — `static shared`, `get/set/remove`, `setTotalCostLimit`, `totalCostLimit`. Default 50MB / 300 items, cost = `bytesPerRow * height`.

**Android port note**: `LruCache<String, Bitmap>` sized in bytes (`sizeOf` override). Coil/Glite already provide a memory cache — prefer reusing the image-loader's cache rather than a bespoke one.

---

## packages/MeeshySDK/Sources/MeeshySDK/Cache/DiskCacheStore.swift

**Purpose**: `actor` L1 (`NSCache<…,CacheBox>`) + L2 (`FileManager`) media disk cache. The `.images/.audio/.video/.thumbnails` backend.

**Public API**: `actor DiskCacheStore: ReadableCacheStore` (Key=String, Value=Data) — `load`, `invalidate`, `invalidateAll`, `save`, `localFileURL`, `cachedData` (nonisolated), `cachedFileURL` (nonisolated sync), `isCached`, `data(for:)` (cache-or-download w/ in-flight dedup), `localFileURLOrThrow`, `store/remove/clearAll`, `evictExpired`, `evictOverBudget` (LRU by mod-date), `image(for:maxPixelSize:)`. Static UIImage `NSCache` (`cachedImage`, `clearImageCache`, `configureImageCache`, `cacheImageForPreview`). `enum DiskCacheError`.

**Key behaviors**:
- SHA256-prefix(8) file naming + extension. Thumbnails → `cachesDirectory`, others → `applicationSupportDirectory` under `MeeshyMedia/<subdir>`.
- `data(for:)` deduplicates concurrent downloads via `inFlightTasks`; validates `http/https`.
- `downsampledImage` via `CGImageSource` thumbnail (max 1200px) to bound decoded memory; `cacheIfWithinBudget` refuses bitmaps >50MB.
- SSRF: only http/https schemes; `file://` loaded directly.

**Android port note**: Coil/Glide disk cache + `DiskLruCache`, or a custom `File`-based store. Image downsampling → `BitmapFactory.Options.inSampleSize` or Coil's `size()`. In-flight dedup → a `Map<String, Deferred<…>>` guarded by Mutex. SHA-256 naming ports directly.

- [ ] Disk caching of images/audio/video/thumbnails with budget eviction
- [ ] Image downsampling to bound memory

---

## packages/MeeshySDK/Sources/MeeshySDK/Cache/FriendshipCache.swift

**Purpose**: `ObservableObject` in-memory friendship-graph cache (friend ids, sent/received pending) with optimistic mutations + persistence-invalidation.

**Public API**: `enum FriendshipStatus { friend / pendingSent(requestId) / pendingReceived(requestId) / none }`; `final class FriendshipCache: ObservableObject, @unchecked Sendable` — `static shared`, `@Published version`, `isHydrated`, `friendIds`, `friendCount`, `pendingReceivedCount`, `status(for:)`, `isFriend(_:)`, `hydrate(friendService:)`, optimistic mutations (`didSendRequest`/`didCancelRequest`/`didAcceptRequest`/`didRejectRequest`/`didReceiveRequest`/`didRemoveFriend`), rollbacks, `invalidatePersistedFriendCaches()`, `enum PersistenceKeys`, `clear()`.

**Key behaviors**:
- `NSLock`-guarded mutable state; monotonic `version` for change observation.
- `hydrate()` coalesces concurrent callers via an in-flight task + generation counter (defends against a real iOS 26 crash on warm-start double-hydration).
- Fetches sent+received in parallel, paginates 100/page.
- Mutations bump `version` on the main actor; persistence invalidation is explicit (not auto) to avoid racing optimistic GRDB saves.

**Android port note**: Singleton repository exposing `StateFlow<FriendshipState>`. `Mutex` replaces `NSLock`. Hydration coalescing → a shared `Deferred` / `Flow` with `shareIn`. The generation-counter dance is a Swift-concurrency artifact — coroutine cancellation handles it cleanly.

- [ ] Friendship status resolution (friend / pending sent / pending received)
- [ ] Optimistic friend-request actions with rollback

---

## packages/MeeshySDK/Sources/MeeshySDK/Cache/GRDBCacheStore.swift

**Purpose**: Generic `actor` cache store — L1 `Dictionary` + L2 GRDB SQLite, dirty tracking with debounced flush, LRU, optional encryption, cursor persistence.

**Public API**: `enum GRDBCacheError { encryptionFailed }`; `actor GRDBCacheStore<Key,Value>: MutableCacheStore` where `Value: CacheIdentifiable & Codable`. Methods: `save throws`, `load`, `update`, `upsert(item:for:merge:)`, `upsertPatch(for:itemId:mutate:)`, `mergeUpdate`, `invalidate`, `invalidateAll`, `flushDirtyKeys(deadline:)`, `dirtyKeyCount`, `seedDirtyForTest`, `evictL1`, `loadedKeys`, `saveCursor`, `loadCursor`.

**Key behaviors**:
- L1 `[Key:L1Entry{items,loadedAt}]` + `accessOrder` LRU (`maxL1Keys`=20); L2 GRDB tables `CacheEntry` + `DBCacheMetadata`.
- `save` writes L2 BEFORE L1 so a failed encrypted write never leaves uncommitted L1 data.
- Dirty tracking: `markDirty` schedules a 2s-debounced flush, capped at 10s max latency from first dirty.
- Optional AES encryption via `DatabaseEncryptionProviding`; decrypt-on-read failures return `nil` (skip row, SWR fallback) rather than throw.
- Cursor pagination metadata persisted alongside items so cold-start resumes scroll position.
- Per-key flush keeps dirty keys on failure for retry.

**Android port note**: Room `@Dao` for L2 + an in-memory `LinkedHashMap` (access-order=true gives free LRU) for L1. SQLCipher for encrypted stores. Debounced flush → a coroutine `Job` with `delay(2000)` cancel/relaunch, or `WorkManager`. `Codable` round-trip → kotlinx.serialization to a JSON/BLOB column.

---

## packages/MeeshySDK/Sources/MeeshySDK/Cache/LoadState.swift

**Purpose**: UI-facing state enums for cache-first screens.

**Public API**: `enum LoadState { idle/cachedStale/cachedFresh/loading/loaded/offline/error(String) }`; `enum PaginationState { idle/loadingMore/exhausted/error(String) }`; `struct PaginationCursor { nextCursor:String?, hasMore:Bool }`.

**Key behavior**: `cachedStale` is the workhorse — "no spinner when cache has data". `PaginationState` deliberately kept separate from `LoadState` (a list can be `.loaded` + `.loadingMore`).

**Android port note**: Kotlin `sealed interface LoadState` / `sealed interface PaginationState`. Drive Compose UI directly from these.

---

## packages/MeeshySDK/Sources/MeeshySDK/Cache/PhotoLibraryManager.swift

**Purpose**: Saves images/videos to a custom "Meeshy" album in the Photos library.

**Public API**: `final class PhotoLibraryManager: @unchecked Sendable` — `static shared`, `saveImage(Data/UIImage)`, `saveVideo(at:)`, `saveFromURL(_:)`, `requestAuthorization()`, `isAuthorized`.

**Key behavior**: Creates/fetches the "Meeshy" `PHAssetCollection`; `saveFromURL` resolves through `CacheCoordinator` media stores; video detection by extension.

**Android port note**: `MediaStore` API — insert into `MediaStore.Images`/`Video` with `RELATIVE_PATH` set to `Pictures/Meeshy` (Android 10+ scoped storage). Permission: `WRITE_EXTERNAL_STORAGE` pre-API29, none needed for own `MediaStore` inserts after.

- [ ] Save received media to device gallery (custom "Meeshy" album)

---

## packages/MeeshySDK/Sources/MeeshySDK/Cache/PreferenceCacheModels.swift

**Purpose**: Wrappers letting id-less preference data live in `GRDBCacheStore`.

**Public API**: `struct PreferenceValue<T: Codable & Sendable>: CacheIdentifiable` (`id`, `value`); `struct ConversationTagEntry: CacheIdentifiable, Equatable` (tag string IS the id, `var name`).

**Android port note**: Generic `data class PreferenceValue<T>(val id, val value)`. Trivial.

---

## packages/MeeshySDK/Sources/MeeshySDK/Cache/ThumbnailPrefetcher.swift

**Purpose**: `actor` decoded-thumbnail prefetcher — NSCache → disk → decode, batch prefetch with concurrency cap.

**Public API**: `actor ThumbnailPrefetcher` — `static shared`, `get(key:)`, `prefetchBatch([String])`, `saveToDisk(data:forKey:)`.

**Key behaviors**: 4-concurrent cap; in-flight set dedup; decode off-MainActor via `Task.detached(.utility)` + mmap (`mappedIfSafe`) + `CGImageSource` thumbnail (300px); SHA256 file naming under `cachesDirectory/meeshy_thumbnails`.

**Android port note**: Coil's `ImageLoader.enqueue` with a prefetch request, or a custom prefetcher with a bounded `Semaphore(4)`. Decode on `Dispatchers.IO`/`Default`.

- [ ] List thumbnail prefetching for smooth scroll

---

## packages/MeeshySDK/Sources/MeeshySDK/Cache/UserDisplayNameCache.swift

**Purpose**: Process-wide `username → displayName` lookup, populated opportunistically from many sources (messages, participants, mentions, users).

**Public API**: `struct MentionedUser` (Codable); `final class UserDisplayNameCache: @unchecked Sendable` — `static shared`, `displayName(for:)`, `subscript`, `allMappings()`, `track(username:displayName:)`, batch `trackFrom*` ingestors, `clear()`.

**Key behavior**: `NSLock`-guarded `[String:String]`, lowercased keys; skips entries where displayName == username.

**Android port note**: Singleton with a `ConcurrentHashMap<String,String>`. Used to resolve `@mention` display names without extra fetches.

---

## packages/MeeshySDK/Sources/MeeshySDK/Cache/VideoFrameExtractor.swift

**Purpose**: `actor` extracting frame thumbnails from videos (e.g. scrubber/preview strips) with LRU cache + in-flight dedup.

**Public API**: `actor VideoFrameExtractor` — `static shared`, `extractFrames(objectId:url:maxFrames:)`, `evict(objectId:)`, `evictAll()`.

**Key behaviors**: 20-entry LRU; `AVAssetImageGenerator` (max 80×80, preferred-transform applied, 0.5s tolerance); `maxFrames` (default 10) evenly spaced; extraction off-actor via `Task.detached(.utility)`; evicts all on memory warning.

**Android port note**: `MediaMetadataRetriever.getFrameAtTime()` or `MediaMetadataRetriever.getScaledFrameAtTime()` (API 27+). LRU via `LruCache`. Extract on `Dispatchers.IO`.

---

## packages/MeeshySDK/Sources/MeeshySDK/Configuration/MeeshyConfig.swift

**Purpose**: Centralized SDK config — API base URL, environment switching, media-URL resolution with SSRF protection.

**Public API**: `final class MeeshyConfig: @unchecked Sendable` — `static shared`; `enum ServerEnvironment { production/staging/localhost/custom }` (`label`, `origin`); `apiBaseURL`, `serverOrigin`, `socketBaseURL`, `appBundleId`; `static resolveMediaURL(_:)`; `configure(apiURL:bundleId:)`, `setUseLocalGateway(_:)`, `selectedEnvironment` (UserDefaults), `customHost`, `applyEnvironment(_:customHost:)`, `restoreEnvironment()`.

**Key behavior**: `resolveMediaURL` prepends server origin to relative URLs; validates scheme (https, or http only for localhost) and blocks private IP ranges (10/172.16-31/192.168/169.254/127) — SSRF defense.

**Android port note**: Singleton object / Hilt-provided config. Environment in `SharedPreferences`. `resolveMediaURL` SSRF logic is security-critical — port the private-IP checks verbatim. Default prod origin `https://gate.meeshy.me`.

---

## packages/MeeshySDK/Sources/MeeshySDK/Core/Logging.swift

**Purpose**: `os.Logger` category extensions — `network`, `auth`, `messages`, `media`, `socket`, `cache`, `ui` (subsystem `me.meeshy.app`).

**Android port note**: A `Timber`-based logger with tag constants, or a small `Logger` object per category.

---

## packages/MeeshySDK/Sources/MeeshySDK/Core/MeeshyError.swift

**Purpose**: The SDK's unified error taxonomy.

**Public API**: `enum NetworkError`, `enum AuthError`, `enum MessageError`, `enum MediaError` (each `LocalizedError`); `enum MeeshyError { network/auth/message/media/forbidden(reason)/server(statusCode,message)/unknown }` — `errorDescription`, `iconName`, `static from(_:)`, mappers from `APIError`/`URLError`/`DecodingError`/status code.

**Key behavior**: `403` maps to `.forbidden` (resource-level, NOT a session failure) — critically distinct from `.auth`; only `.auth` triggers re-auth/refresh. `401` → `.auth(.sessionExpired)`; `429`/`5xx` → `.server`.

**Android port note**: Kotlin `sealed class MeeshyError` with subtypes. The 403-vs-401 distinction is load-bearing — auth refresh must ignore 403. French error strings → move to `strings.xml` resources.

---

## packages/MeeshySDK/Sources/MeeshySDK/Crypto/DecryptionActor.swift

**Purpose**: `actor` that batch-decrypts E2EE message payloads concurrently.

**Public API**: `protocol DecryptionSessionProviding: Sendable` (`decryptMessage(_:from:)`); `struct DecryptionPayload` (messageId, senderId, ciphertext); `struct DecryptionResult` (messageId, plaintext?, error?); `actor DecryptionActor` — `init(provider:)`, `decrypt([DecryptionPayload]) -> [DecryptionResult]`.

**Key behavior**: Uses a `withTaskGroup` to decrypt all payloads in parallel; wraps each in `CryptoSignposts` for instrumentation; per-message error isolation.

**Android port note**: A class with a `decrypt(payloads): List<DecryptionResult>` using `coroutineScope { payloads.map { async { … } }.awaitAll() }`. The `DecryptionSessionProviding` protocol → an interface backed by the Signal-protocol library (libsignal). Confine to a single dispatcher if the Signal session store is not thread-safe.

- [ ] End-to-end encrypted message decryption (batched)

---

## packages/MeeshySDK/Sources/MeeshySDK/Diagnostics/CryptoSignposts.swift

**Purpose**: `os_signpost` instrumentation around decrypt operations + a thread-safe test hook.

**Public API**: `enum CryptoSignposts` — `enum Event { beginDecrypt/endDecrypt }`, `var testHook`, `beginDecrypt(messageId:)`, `endDecrypt(messageId:bytes:)`.

**Android port note**: `androidx.tracing.Trace.beginSection/endSection` or systrace. Test hook → an injectable listener interface.

---

## packages/MeeshySDK/Sources/MeeshySDK/MediaSessionCoordinator.swift

**Purpose**: `actor` coordinating shared `AVAudioSession` access (refcounted) and rebroadcasting system interruptions/route changes.

**Public API**: `actor MediaSessionCoordinator` — `static shared`; `enum AudioRole { playback/record/playAndRecord }`; `enum Event { interruptionBegan / interruptionEndedShouldResume / interruptionEndedShouldNotResume / routeChangedOldDeviceUnavailable / routeChangedOther }`; `nonisolated events: PassthroughSubject<Event,Never>`; `request(role:)`, `release()`, `deactivateForBackground()`.

**Key behaviors**: Refcounted activation; observes `AVAudioSession.interruptionNotification` + `routeChangeNotification`; `.playAndRecord` uses `.allowBluetoothHFP`.

**Android port note**: `AudioManager.requestAudioFocus`/`AudioFocusRequest` + `AUDIOFOCUS_GAIN`/`LOSS_TRANSIENT`. Route changes → `AudioDeviceCallback`. Refcounted focus management around a shared coordinator; expose events via `SharedFlow`. Headphone unplug → `ACTION_AUDIO_BECOMING_NOISY` broadcast.

---

## packages/MeeshySDK/Sources/MeeshySDK/MeeshySDK.swift

**Purpose**: SDK entry point — `enum MeeshySDK` with `version = "1.0.0"` and `initialize(apiURL:bundleId:)`.

**Android port note**: An `object MeeshySdk { fun initialize(...) }` or Hilt module init.

---

## packages/MeeshySDK/Sources/MeeshySDK/Models/AffiliateModels.swift

**Purpose**: Affiliate-program DTOs.

**Public API**: `struct AffiliateToken` (Codable, Identifiable, CacheIdentifiable — token, name, link, maxUses, currentUses, isActive, expiresAt, `_count`, clickCount; `var referralCount`; custom `init(from:)` defaulting `clickCount`); `struct AffiliateCount`; `struct AffiliateStats`; `struct CreateAffiliateTokenRequest`.

**Android port note**: kotlinx.serialization `data class`es; `_count` is an awkward server key — use `@SerialName("_count")`.

- [ ] Affiliate token creation & referral stats

---

## packages/MeeshySDK/Sources/MeeshySDK/Models/AgentAnalysisModels.swift

**Purpose**: DTOs for the AI agent's conversation analysis feature (personality/communication trait scoring, conversation summaries, message stats).

**Public API**: `TraitScore`; trait groups `CommunicationTraits`, `PersonalityTraits`, `InterpersonalTraits`, `EmotionalTraits` → `ParticipantTraits`; `RelationshipAttitude`; `ConversationAnalysis`; `ConversationSummaryAnalysis` (text, topics, tone, healthScore, engagement/conflict levels, emotions); `ParticipantProfile` (Identifiable — persona summary, tone, vocabulary, catchphrases, emojis, traits, relationshipMap, sentiment, `locked`); `AnalysisSnapshot` + `ParticipantSnapshot` (history); `ConversationMessageStatsResponse` + `ContentTypeCounts`, `ParticipantStatEntry`, `DailyActivityEntry`, `LanguageEntry`.

**Android port note**: All plain `data class`es — straightforward kotlinx.serialization port. This is a sizable, distinct feature surface (AI conversation analysis).

- [ ] AI conversation analysis (summary, health score, topics, emotions)
- [ ] Per-participant personality/communication trait profiles
- [ ] Conversation message statistics (content types, activity, languages)

---

## packages/MeeshySDK/Sources/MeeshySDK/Models/CommunityLinkModels.swift

**Purpose**: `CommunityLink` — a derived view of a user's communities exposing share URLs.

**Public API**: `struct CommunityLink` (Codable, Identifiable, CacheIdentifiable — name, identifier, computed `joinUrl = "<baseUrl>/join/<identifier>"`, memberCount, isActive, createdAt); `struct CommunityLinkStats`.

**Android port note**: `data class`. `joinUrl` computed in the constructor — replicate or compute as a property.

---

## packages/MeeshySDK/Sources/MeeshySDK/Models/CommunityModels.swift

**Purpose**: Community domain DTOs + role-permission mapping.

**Public API**: deprecated `typealias CommunityRole = MemberRole`; `enum CommunityPermission` (8 cases); `enum CommunityPermissions.forRole(_:) -> Set<CommunityPermission>`; `APICommunityUser` (`var name`), `APICommunityMember` (`var communityRole`), `APICommunityCount`; `struct APICommunity` (Codable, Identifiable, CacheIdentifiable — supports both `_count` object and flat `memberCount/conversationCount`) + `toCommunity()`; `APICommunitySearchResult` + `toCommunity()`; `CreateCommunityRequest`, `UpdateCommunityRequest`, `InviteMemberRequest`, `IdentifierAvailability`.

**Key behavior**: `CommunityPermissions.forRole` is the authorization matrix (creator/admin = all; moderator = invite/remove/moderate/create/edit conversations; member = create conversations only). `toCommunity()` falls back across `memberCount`/`_count`/`members.count`.

**Android port note**: `data class`es. Permission matrix → an `object CommunityPermissions` with a `when(role)` map — port verbatim, it is authorization logic.

- [ ] Community creation/update/invite
- [ ] Role-based community permissions

---

## packages/MeeshySDK/Sources/MeeshySDK/Models/ConversationDraft.swift

**Purpose**: Lightweight per-conversation message draft persisted via `CacheCoordinator.drafts` (survives navigation/background/kill).

**Public API**: `struct ConversationDraft` (Codable, Sendable, CacheIdentifiable, Equatable — `conversationId` (= `id`), `text`, `updatedAt`).

**Android port note**: Room entity keyed by `conversationId`, or a `data class` in the drafts cache store. Local-only — never synced.

- [ ] Persistent per-conversation message drafts

---

## packages/MeeshySDK/Sources/MeeshySDK/Models/ConversationModels.swift

**Purpose**: API conversation DTOs + `toConversation()` mapping to the domain model.

**Public API**: `APIConversationUserNested`, `APIConversationUser` (`var name`, `resolvedAvatar`, `resolvedUserId`), `APIMessageCount`, `APIConversationLastMessage`, deprecated `typealias APIConversationMember = APIParticipant`, `struct APIConversationPreferences` (Codable — pin/mute/archive/deletedForUserAt/tags/categoryId/reaction/customName/mentionsOnly), `struct APIConversation` (Decodable — full conversation payload), `UpdateConversationResponse` + `toAPIConversation()`, `APIConversation.toConversation(currentUserId:)`.

**Key behaviors**: `toConversation` resolves the direct-conversation display name from the other participant (or last-message sender), maps participant avatar/username, derives current-user role, builds tags with cycling colors, maps last-message attachments + recent-message previews, defaults `encryptionMode` to `e2ee` for direct conversations.

**Android port note**: kotlinx.serialization DTOs + a `toConversation()` mapper extension. The display-name resolution for direct chats is product logic — port carefully.

---

## packages/MeeshySDK/Sources/MeeshySDK/Models/CoreModels.swift

**Purpose**: The central domain-model file — conversations, messages, attachments, reactions, tags, sections, feed item, filters.

**Public API surface** (large):
- `MeeshyConversationTag` (Identifiable, Hashable, Codable — `estimatedWidth`, static `colors`, `samples`).
- `MeeshyConversationSection` (static `pinned/work/family/friends/groups/other`, `allSections`).
- `RecentMessagePreview` (Codable).
- `struct MeeshyConversation` (Identifiable, Hashable, Codable, CacheIdentifiable) — ~45 fields; `enum ConversationType { direct/group/public/global/community/channel/bot/broadcast }`; `colorPalette`, computed `accentColor`/`name`/`displayName`/`isArchived`/`lastSeenText`/`renderFingerprint`; static `computeColorPalette`. Hash/== by `id` only.
- `MeeshyCommunity` (domain model).
- `struct MeeshyMessage` (Identifiable, Codable, CacheIdentifiable) — full message with `clientMessageId` (idempotent dedup), `effects`, `enum DeliveryStatus { sending/invisible/clock/slow/sent/delivered/read/failed }` with `isBetterThan(_:)` monotonicity, `enum MessageType`, `enum MessageSource`; computed `isViewOnce`/`isBlurred` (via effects flags), `isDeleted`, `isEphemeralActive`, `cachedTimeString`. Custom Codable with legacy `isViewOnce/isBlurred` → effects migration.
- `typealias MeeshyChatMessage = MeeshyMessage`.
- `enum EphemeralDuration` (30s/1m/5m/1h/24h).
- `struct MeeshyMessageAttachment` (Identifiable, Codable) — exhaustive media metadata incl. `EmbeddedTranscription`/`EmbeddedAudioTranslation`, computed `type`, factory helpers, `durationFormatted`, `fileSizeFormatted`.
- `ReplyReference`, `ForwardReference`, `MeeshyReaction` (deprecated `userId`), `MeeshyReactionSummary` (typealias `MeeshyMessageReaction`), `ReactionUserDetail`, `ReactionGroup`, `ReactionSyncResponse`.
- `MeeshyFeedItem`, `enum MeeshyConversationFilter` (9 cases w/ colors), `SharedContact`.
- `ConversationColorPalette` Codable/Hashable conformance.

**Key behaviors**:
- `DeliveryStatus.isBetterThan` defines a strict monotonic ordering so a stale socket event can never downgrade a message's status — critical for delivery-receipt correctness.
- `renderFingerprint` hashes visible fields for list-cell `Equatable` diffing (perf — avoids re-render).
- `clientMessageId` (`cid_<uuid>`) drives optimistic-message reconciliation.
- Effects-flag legacy migration in `init(from:)`.

**Android port note**: Kotlin `data class`es with kotlinx.serialization. `DeliveryStatus.isBetterThan` is load-bearing — port the comparison verbatim. `renderFingerprint` → a Compose-stable key / `equals` for `LazyColumn` item diffing. Custom `Codable` migration → a kotlinx-serialization `JsonTransformingSerializer` or post-decode fixup. This is the model backbone — single source of truth.

- [ ] Conversation list with types, tags, sections, filters
- [ ] Rich messages: attachments, reactions, replies, forwards
- [ ] Delivery status with monotonic upgrade (sent/delivered/read/...)
- [ ] Ephemeral / view-once / blurred messages
- [ ] Message effects (shake/zoom/confetti/glow/etc.)
- [ ] Optimistic message send with client-id reconciliation

---

## packages/MeeshySDK/Sources/MeeshySDK/Models/FeedModels.swift

**Purpose**: Social feed domain models — posts, comments, media, reposts.

**Public API**: `enum FeedMediaType`; `struct PostTranslation`; `struct FeedMedia` (Identifiable, Codable — type/url/thumb/dimensions/duration/location/transcription; factory helpers; `toMessageAttachment()` bridge); `struct RepostContent` (Identifiable, Codable — quote/repost payload, storyEffects, media, translations); `struct FeedComment` (Identifiable, Codable, CacheIdentifiable — `effectFlags`, `displayContent`, `effects`); `struct FeedPost` (Identifiable, Codable, CacheIdentifiable, Equatable, Hashable — author, content, likes, isLiked, comments, repost, media, translations, `displayContent`, `availableLanguages`).

**Key behaviors**: `authorColor` deterministically derived (`DynamicColorGenerator.colorForPost`/`colorForName`); `displayContent` returns `translatedContent ?? content` (Prisme Linguistique); custom Codable round-trips for cache persistence; `FeedMedia.toMessageAttachment()` bridges to reuse message media players.

**Android port note**: `data class`es. Deterministic author color → a shared color generator. Reuse media-player components between feed and chat via the bridge mapper pattern.

- [ ] Social feed (posts, comments, reposts/quotes)
- [ ] Feed media with translations & transcription
- [ ] Like / comment interactions

---

## packages/MeeshySDK/Sources/MeeshySDK/Models/FriendModels.swift

**Purpose**: Friend-request domain DTOs.

**Public API**: `struct FriendRequest` (Codable, CacheIdentifiable, Identifiable, Equatable — sender/receiver, status, respondedAt); `struct FriendRequestUser` (Codable, CacheIdentifiable — `var name` resolution; manual `Equatable`); `SendFriendRequest`, `RespondFriendRequest` (`init(accepted:)` → "accepted"/"rejected"), `EmailInvitationRequest`/`EmailInvitationResponse`.

**Android port note**: `data class`es. `RespondFriendRequest` maps a bool to a status string — keep.

- [ ] Friend requests (send / respond / email invite)

---

## packages/MeeshySDK/Sources/MeeshySDK/Models/LanguageData.swift

**Purpose**: Static language metadata table (translation targets) + UI-language subset.

**Public API**: `struct LanguageInfo` (code, name, nativeName, flag emoji, colorHex); `enum LanguageData` — `allLanguages` (~85 languages incl. African/Cameroon languages), `interfaceLanguages` (fr/en/es/ar), `info(for:)`.

**Android port note**: A Kotlin `object LanguageData` with a `List<LanguageInfo>`, or a generated resource. ~85 entries — port the whole table; it backs the language pickers and the Prisme Linguistique.

- [ ] Language picker (translation target & UI language)

---

## packages/MeeshySDK/Sources/MeeshySDK/Models/LastMessageSummaryKind.swift

**Purpose**: Centralized decision for how to summarize a conversation's last message in a list row.

**Public API**: `enum LastMessageSummaryKind { standard/hidden/viewOnce/expired/ephemeralActive }`; `MeeshyConversation.lastMessageSummaryKind(now:)`.

**Key behavior**: Expired (past `expiresAt`) > blurred > view-once > active-ephemeral > standard. Shared by conversation list and search results; `now` injectable for testing.

**Android port note**: `enum class` + an extension function on the conversation model. Pure logic — port verbatim, keep `now` injectable.

---

## packages/MeeshySDK/Sources/MeeshySDK/Models/LocationModels.swift

**Purpose**: Static + live location sharing DTOs and the active-session model.

**Public API**: `MeeshyLocationCoordinate` (+ `clLocationCoordinate`); static share `LocationSharePayload`/`LocationSharedEvent`; `enum LiveLocationDuration` (15m–8h); live `LiveLocationStartPayload`/`StartedEvent`, `UpdatePayload`/`UpdatedEvent`, `StoppedEvent`; `struct ActiveLiveLocation` (Identifiable — `isExpired`, `remainingTime`, `coordinate`).

**Android port note**: `data class`es; `CLLocationCoordinate2D` → `com.google.android.gms.maps.model.LatLng` (or a plain pair). Live location uses socket events — wire to the socket layer.

- [x] Static location sharing in chat (`chat-bubble-location` 2026-07-09 — DTOs `me.meeshy.sdk.model.Location`, `BubbleLocation` render)
- [~] Live location sharing (timed sessions) — pure session/duration/countdown core + badge/picker UI done (`chat-live-location-sessions` 2026-07-16: `ActiveLiveLocation`/`LiveLocationDuration`/`LiveLocationCountdown`/`LiveLocationSessions`); socket start/update/stop wiring pending

---

## packages/MeeshySDK/Sources/MeeshySDK/Models/MemberRole.swift

**Purpose**: `enum MemberRole { creator/admin/moderator/member }` — hierarchical role with `level`, `displayName`, `icon`, `hasMinimumRole(_:)`, `Comparable`.

**Key behavior**: Levels 40/30/20/10; aligned with `packages/shared/types/role-types.ts`.

**Android port note**: `enum class MemberRole` with a `level` property; implement `Comparable`. SF Symbol `icon` → Material icon names.

---

## packages/MeeshySDK/Sources/MeeshySDK/Models/MentionCandidate.swift

**Purpose**: `struct MentionCandidate` (Identifiable, Equatable, Sendable — id, username, displayName, avatarURL) for the @-mention autocomplete panel.

**Android port note**: `data class`. Backs the mention autocomplete UI.

- [ ] @-mention autocomplete

---

## packages/MeeshySDK/Sources/MeeshySDK/Models/MessageEffects.swift

**Purpose**: Message visual/lifecycle effects model — a `UInt32` bitfield + per-effect parameters.

**Public API**: `struct MessageEffectFlags: OptionSet, Codable` — lifecycle bits 0-2 (`ephemeral/blurred/viewOnce`), appearance bits 8-13 (`shake/zoom/explode/confetti/fireworks/waoo`), persistent bits 16-19 (`glow/pulse/rainbow/sparkle`); convenience masks + `hasLifecycle/Appearance/PersistentEffect`/`hasAnyEffect`. `struct MessageEffects` (Codable, Hashable — flags + params: ephemeralDuration, maxViewOnceCount, blurRevealDuration, zoomScale, explodeStyle, glow/pulse/rainbow/sparkle params; static `none`). `enum ExplodeStyle { burst/shatter/dissolve }`.

**Key behavior**: Bit assignments are the cross-platform source of truth, shared with `packages/shared/types/message-effect-flags.ts` — Android MUST use identical bit positions.

**Android port note**: Kotlin — represent `MessageEffectFlags` as an `value class MessageEffectFlags(val rawValue: UInt)` with `infix fun has`/bitwise helpers, or an `EnumSet` mapped to/from the bitfield. The exact bit values are wire-format — port verbatim.

- [ ] Message effects with cross-platform bitfield encoding

---

## Architecture observations

**State management**: `@MainActor` `ObservableObject` singletons (`AuthManager`, `FriendshipCache`, `AudioPlayerManager`) expose `@Published` state + Combine publishers. Caches use `actor` isolation for thread safety. Android map: Hilt singletons exposing `StateFlow`/`SharedFlow`; `actor` → single-dispatcher confinement or `Mutex`.

**Two-tier cache + SWR is the defining architecture**. `CacheCoordinator` (actor) is the single entry point owning ~26 typed `GRDBCacheStore`s (L1 `Dictionary` + L2 GRDB SQLite, dirty-tracked, debounced flush, LRU, optional AES) and 4 `DiskCacheStore`s (L1 NSCache + L2 files). `CacheFirstLoader` + `CacheResult` + `LoadState` enforce the cache-first / stale-while-revalidate discipline from the architecture bible: cached data shows immediately (no spinner), `.stale` triggers a silent background revalidate. Android rebuild should reproduce this faithfully with Room (+ SQLCipher) and a `cacheFirstFlow()` primitive — it is the source of the "instant app" feel.

**Security model**: per-user namespaced Keychain token storage; sensitive caches (conversations/messages/profiles/notifications/friend-requests/blocked/preferences) are encrypted; `reset()` purges ALL stores (incl. disk media) on logout because stores are not userId-namespaced — Android must replicate this wipe to prevent cross-account leakage. SSRF defense in `MeeshyConfig.resolveMediaURL` (scheme + private-IP blocking). E2EE decryption is batched via a `DecryptionActor`.

**Concurrency hazards already solved (do not regress)**: `FriendshipCache.hydrate()` coalesces concurrent callers (a real iOS-26 crash fix); `AuthManager` guards against concurrent token refresh; `GRDBCacheStore` writes L2 before L1 so failed encrypted writes never leave uncommitted L1 data; `DiskCacheStore` deduplicates in-flight downloads. Coroutine structured concurrency makes most of these naturally simpler on Android, but the L2-before-L1 ordering and download dedup must be kept.

**Cross-platform contracts**: `MessageEffectFlags` bit positions, `MemberRole` levels, and `MeeshyUser.preferredContentLanguages` resolution order are shared-source-of-truth with `packages/shared` — port verbatim, they are wire/behavior contracts.

**Tech debt / do-not-carry-over**: `CacheBox` and `withProfileChanges` duplication and the empty `deinit` workarounds exist purely to dodge Swift 6.3.2 optimizer bugs — drop them entirely on Android. The two near-identical `withProfileChanges` overloads collapse to `data class.copy()`. `DiskCacheStore` carries a comment admitting the memory-warning observer cannot fully clear its instance NSCache — Android's `ComponentCallbacks2.onTrimMemory` handles this cleanly. French-language error strings hardcoded in `MeeshyError` should move to `strings.xml`.
