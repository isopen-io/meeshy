# Politique média iOS — download-first messages, cache adoption optimiste, story smart streaming

Date : 2026-05-20
Statut : design validé par l'utilisateur (5 itérations clarifying — couverture politique configurable + adoption optimiste + stories prefix-buffer)
Branche prévue : `feat/ios-media-download-policy`

## 1. Problèmes adressés

Trois douleurs distinctes mais liées dans la couche média iOS :

### 1.1 Bug — Switch langue audio joue en streaming sans cache local

Quand l'utilisateur change de langue d'un audio (pill langue dans le footer du player), `AudioPlayerView.switchToLanguage(_:)` appelle directement `player.play(urlString: translated.url)` sans consulter l'`availability` de la nouvelle URL. Si la version traduite n'est pas cachée localement, `AudioPlaybackManager.play()` la télécharge silencieusement via `CacheCoordinator.shared.audio.data(for:)` — comportement non aligné avec le pattern « bouton download visible quand non-cached » qui régit `handlePlayTap()`.

### 1.2 Absence de politique de pré-téléchargement automatique configurable

Les médias se comportent inconsistant selon le type :
- **Audio** : streamé via `CacheCoordinator.audio.data(for:)` qui télécharge + cache silencieusement.
- **Vidéo** : `SharedAVPlayerManager.load()` fallback streaming direct (`AVPlayer(url:)` ligne 65) avec background cache parallèle. Pas de gating.
- **Image** : `CachedAsyncImage` / `ProgressiveCachedImage` auto-fetch sans état "needs download" explicite.

L'utilisateur n'a aucun contrôle sur quand un média se télécharge automatiquement. Pas de respect du réseau (data mobile vs wifi). Pas de préférences persistées.

### 1.3 Téléchargement inutile des médias qu'on vient d'envoyer

À l'envoi optimiste d'un audio/image/vidéo :
1. Fichier local créé : `file:///Documents/Meeshy/.../audio.m4a`
2. Attachment optimiste avec `fileUrl = file://...`
3. Upload + réponse serveur : `fileUrl = https://media.meeshy.me/.../uploaded.m4a`
4. `MessagePersistenceActor.upsertFromAPIMessages` UPDATE remplace `attachmentsJson` — l'URL `file://` devient `https://...`

À l'étape 4, la donnée existe encore sur disque mais n'est jamais indexée dans le cache typed sous la clé canonique HTTPS. `isCached(https://...)` retourne `false` → l'utilisateur doit attendre un re-téléchargement pour écouter/voir le média qu'il vient d'envoyer.

### 1.4 Stories : streaming direct sans buffer prévisible

`StoryViewerView` (via `SharedAVPlayerManager.load()` ligne 65) fait du streaming AVPlayer direct sur les médias story qui ne sont pas pré-cachés par `StoryMediaLoader.shared`. Pas de prefetch garanti avant lecture. Auto-advance peut se déclencher avant que la vidéo soit lisible → glitch visuel. Pas de placeholder lisible (ThumbHash/Thumbnail) pendant le buffering initial.

## 2. Cause racine (vérifiée par lecture de code)

| Problème | Code source |
|---|---|
| 1.1 Switch langue | `packages/MeeshySDK/Sources/MeeshyUI/Media/AudioPlayerView.swift` l. 417-426 : `switchToLanguage(_:)` appelle `player.play(urlString:)` sans consulter `availability`. Asymétrique avec `handlePlayTap()` (l. 689-702) qui passe par le gate `availability` (l. 671). |
| 1.2 Pas de politique | Aucune entité `NetworkConditionMonitor` ni `MediaDownloadPreferences*` dans le SDK ou l'app. `AttachmentDownloader` existe (apps/ios/.../ConversationMediaViews.swift l. 165-300) mais doit être déclenché manuellement par `onDownload` callback. |
| 1.3 Adoption manquante | `DiskCacheStore` (`packages/MeeshySDK/Sources/MeeshySDK/Cache/DiskCacheStore.swift`) n'expose pas de méthode `adopt` ; le flow `MessagePersistenceActor.upsertFromAPIMessages` ne tente aucune migration de `file://` vers cache typed. |
| 1.4 Stories streaming | `SharedAVPlayerManager.load()` (`packages/MeeshySDK/Sources/MeeshyUI/Media/SharedAVPlayerManager.swift` l. 33-70) a un fallback streaming réseau ligne 65 (`AVPlayer(url:)`). Les story slide renderers passent par ce manager sans logique de buffer minimal. `StoryMediaLoader.shared` pré-cache mais sans garanties de prefetch minimum. |

## 3. Principe directeur

Politique en **trois sous-systèmes indépendants mais cohérents** :

- **Messages** (audio, vidéo) : download-first strict. L'utilisateur configure quand un média se télécharge automatiquement selon le type et l'état réseau ; sinon button DL manuel avec taille visible.
- **Optimiste** : ce qu'on vient d'envoyer est déjà local. Le cache l'adopte sous la clé canonique HTTPS au moment de la réconciliation — zéro re-téléchargement.
- **Stories** : streaming intelligent prefix-buffer (5s) + persistence parallèle. AVPlayer joue dès que le buffer initial est prêt, ThumbHash/Thumbnail comme placeholder pendant l'amorce.

Chaque sous-système est mergeable indépendamment (commits + tasks séparés).

## 4. Sous-système A — Politique download-first messages

### 4.1 `NetworkConditionMonitor` (SDK)

Fichier nouveau : `packages/MeeshySDK/Sources/MeeshySDK/Networking/NetworkConditionMonitor.swift`

```swift
import Network
import Combine

public enum NetworkCondition: String, Equatable, Sendable, Codable {
    case offline       // path !isSatisfied
    case badCellular   // cellular avec Low Data Mode OU expensive sans wifi
    case goodCellular  // cellular sans Low Data Mode, non-constrained
    case wifi          // wifi non-constrained
}

@MainActor
public final class NetworkConditionMonitor: ObservableObject {
    @MainActor public static let shared = NetworkConditionMonitor()

    @Published public private(set) var condition: NetworkCondition = .offline

    // `nonisolated(unsafe)` requis pour Swift 6 strict concurrency :
    // `NWPathMonitor` est configuré une fois à l'init et jamais muté ensuite.
    // Le `pathUpdateHandler` s'exécute sur la `queue` non-main qui hop ensuite
    // sur MainActor via Task pour publier `condition`.
    nonisolated(unsafe) private let monitor = NWPathMonitor()
    nonisolated(unsafe) private let queue = DispatchQueue(label: "me.meeshy.network-condition", qos: .utility)

    private init() {
        monitor.pathUpdateHandler = { [weak self] path in
            let resolved = Self.resolve(path: path)
            Task { @MainActor in self?.condition = resolved }
        }
        monitor.start(queue: queue)
    }

    /// Pure resolution exposed for tests.
    public static func resolve(path: NWPath) -> NetworkCondition {
        guard path.status == .satisfied else { return .offline }
        if path.usesInterfaceType(.wifi) && !path.isConstrained { return .wifi }
        if path.usesInterfaceType(.cellular) {
            return path.isConstrained ? .badCellular : .goodCellular
        }
        // Wired, loopback, other unconstrained interfaces → traité comme wifi
        if !path.isConstrained && !path.isExpensive { return .wifi }
        return .badCellular
    }

    /// Convenience derived from condition.
    public var isOnline: Bool { condition != .offline }
}
```

Heuristique pragmatique sans speed test actif (iOS ne donne pas le débit). `isConstrained` couvre Low Data Mode + faibles débits annoncés par OS. Tests purs via `NetworkConditionMonitor.resolve(path:)` (pas besoin de mocker `NWPathMonitor`).

### 4.2 `AutoDownloadPolicy` + `MediaDownloadPreferences` (SDK)

Fichier nouveau : `packages/MeeshySDK/Sources/MeeshySDK/Networking/MediaDownloadPreferences.swift`

```swift
public enum AutoDownloadPolicy: String, Codable, CaseIterable, Equatable, Sendable {
    case always              // tout le temps, même bad cellular
    case wifiAndGoodCellular // wifi OU bon cellulaire
    case wifiOnly            // wifi seulement
    case never               // jamais auto, manuel uniquement

    public var localizedDescription: String {
        switch self {
        case .always:              return String(localized: "media.policy.always", bundle: .module)
        case .wifiAndGoodCellular: return String(localized: "media.policy.wifiAndGoodCellular", bundle: .module)
        case .wifiOnly:            return String(localized: "media.policy.wifiOnly", bundle: .module)
        case .never:               return String(localized: "media.policy.never", bundle: .module)
        }
    }
}

public enum MediaKind: String, Equatable, Sendable, Codable {
    case image
    case audio
    case audioTranslation
    case video
}

public struct MediaDownloadPreferences: Codable, Equatable, Sendable {
    public var image: AutoDownloadPolicy
    public var audio: AutoDownloadPolicy
    public var audioTranslation: AutoDownloadPolicy
    public var video: AutoDownloadPolicy

    public static let defaults = MediaDownloadPreferences(
        image: .wifiAndGoodCellular,
        audio: .wifiAndGoodCellular,
        audioTranslation: .wifiOnly,
        video: .wifiOnly
    )

    public func policy(for kind: MediaKind) -> AutoDownloadPolicy {
        switch kind {
        case .image:            return image
        case .audio:            return audio
        case .audioTranslation: return audioTranslation
        case .video:            return video
        }
    }
}
```

Défauts choisis : wifi auto pour tout ; cellular bon pour images + audios uniquement (audio translations + vidéos = wifi only car volumineux + non critiques en cellulaire).

### 4.3 `MediaDownloadPolicyEngine` (SDK)

Fichier nouveau : `packages/MeeshySDK/Sources/MeeshySDK/Networking/MediaDownloadPolicyEngine.swift`

```swift
public enum MediaDownloadPolicyEngine {
    /// Pure decision function : faut-il auto-download ce média maintenant ?
    /// Table de vérité 4 (condition) × 4 (policy) = 16 cas. Sortie ne dépend
    /// que des inputs, sans I/O ni état. Testable directement.
    public static func shouldAutoDownload(
        kind: MediaKind,
        condition: NetworkCondition,
        prefs: MediaDownloadPreferences
    ) -> Bool {
        guard condition != .offline else { return false }
        let policy = prefs.policy(for: kind)
        switch policy {
        case .never:               return false
        case .always:              return true
        case .wifiOnly:            return condition == .wifi
        case .wifiAndGoodCellular: return condition == .wifi || condition == .goodCellular
        }
    }
}
```

16 cas couverts par tests (4 conditions × 4 policies). Tests purs Swift Testing.

### 4.4 `MediaDownloadPreferencesStore` (MeeshyUI)

Fichier nouveau : `packages/MeeshySDK/Sources/MeeshyUI/Networking/MediaDownloadPreferencesStore.swift`

Placé dans `MeeshyUI` (pas dans `apps/ios`) pour que les composants UI du SDK (`CachedAsyncImage`, `ProgressiveCachedImage`) puissent le consulter sans dépendance app. `MeeshyUI` peut dépendre de `Foundation.UserDefaults` (cross-platform Apple). Voir §4.11 pour le pattern de consommation.

```swift
import Foundation
import MeeshySDK
import Combine

@MainActor
public final class MediaDownloadPreferencesStore: ObservableObject {
    // `@MainActor` explicite sur `shared` : tous les accès doivent être main.
    // Les composants UI (`CachedAsyncImage`, `AudioMediaView`, `VideoMediaView`)
    // sont rendus dans des body SwiftUI → MainActor garanti. Tout autre call
    // site doit explicitement hop sur main avant accès.
    @MainActor public static let shared = MediaDownloadPreferencesStore()

    @Published public var preferences: MediaDownloadPreferences

    private static let storageKey = "me.meeshy.mediaDownloadPreferences"
    private var cancellables = Set<AnyCancellable>()

    private init() {
        self.preferences = Self.loadFromDefaults() ?? .defaults
        // Persist on every change (debounced 100ms via Combine).
        $preferences
            .dropFirst()
            .debounce(for: .milliseconds(100), scheduler: DispatchQueue.main)
            .sink { Self.saveToDefaults($0) }
            .store(in: &cancellables)
    }

    private static func loadFromDefaults() -> MediaDownloadPreferences? {
        guard let data = UserDefaults.standard.data(forKey: storageKey) else { return nil }
        return try? JSONDecoder().decode(MediaDownloadPreferences.self, from: data)
    }

    private static func saveToDefaults(_ prefs: MediaDownloadPreferences) {
        guard let data = try? JSONEncoder().encode(prefs) else { return }
        UserDefaults.standard.set(data, forKey: storageKey)
    }
}
```

Tests : roundtrip JSON, défauts au premier lancement, debounce.

### 4.5 `MediaDownloadSettingsView` (app)

Fichier nouveau : `apps/ios/Meeshy/Features/Main/Views/Settings/MediaDownloadSettingsView.swift`

Liste de 4 rows (Image, Audio, Audio translation, Vidéo). Chaque row = `NavigationLink` vers `MediaDownloadPolicyPickerView` qui montre les 4 options en `Picker` style avec descriptions. Bind sur `MediaDownloadPreferencesStore.shared.preferences.{kind}`.

Localisation FR/EN dans `Localizable.strings`. Branchement dans la navigation Settings existante (à identifier à l'implémentation — probablement `SettingsView.swift`).

### 4.6 `AudioPlayerView.switchToLanguage` — fix bug 1.1 (SDK)

Modifier `packages/MeeshySDK/Sources/MeeshyUI/Media/AudioPlayerView.swift` :

```swift
private func switchToLanguage(_ code: String) {
    // Stop playback immediately — the parent (AudioMediaView) re-resolves
    // availability for the new URL and will either trigger auto-download
    // (if policy allows) or display the download button.
    player.stop()

    withAnimation(.spring(response: 0.25, dampingFraction: 0.8)) {
        selectedAudioLanguage = code
    }
    // Plus de player.play(urlString:) ici — user retappe play, qui passera
    // par handlePlayTap() qui est gated par `availability`.
}
```

**UX impact** : changer de langue ne joue plus immédiatement. L'utilisateur retappe play. Décision conscient/aligné avec policy stricte. Documenté dans le code + release notes.

### 4.7 `AudioMediaView` — gating per-URL + auto-DL (app)

Modifier `apps/ios/Meeshy/Features/Main/Views/ConversationMediaViews.swift` :

```swift
extension AudioMediaView {
    /// URL de la langue actuellement sélectionnée. Drive resolveAvailability
    /// et le déclencheur d'auto-DL.
    private var currentAudioUrl: String {
        if let lang = selectedAudioLangCode,
           let translated = translatedAudios.first(where: { $0.targetLanguage.lowercased() == lang.lowercased() }) {
            return translated.url
        }
        return attachment.fileUrl
    }

    /// MediaKind selon l'URL courante : orig = audio, traduit = audioTranslation.
    /// `selectedAudioLangCode == nil` représente la langue originale (pas de pill
    /// sélectionnée). La présence d'un match dans `translatedAudios` discrimine
    /// — éviter de comparer avec `message.originalLanguage` qui peut différer
    /// du sentinel "orig" interne d'AudioPlayerView.
    private var currentMediaKind: MediaKind {
        guard let lang = selectedAudioLangCode,
              translatedAudios.contains(where: { $0.targetLanguage.lowercased() == lang.lowercased() })
        else { return .audio }
        return .audioTranslation
    }

    /// Taille à utiliser pour cette URL (orig = attachment.fileSize, traduit = translated.fileSize fallback 0).
    private var currentFileSize: Int64 {
        if let lang = selectedAudioLangCode,
           let translated = translatedAudios.first(where: { $0.targetLanguage.lowercased() == lang.lowercased() }) {
            return Int64(translated.fileSize)
        }
        return Int64(attachment.fileSize)
    }
}

// Dans body, .task(id: currentAudioUrl) :
.task(id: currentAudioUrl) {
    await resolveAvailability()

    // Auto-DL si policy permet + non encore cached + non en cours
    if resolvedAvailability == .needsDownload, !downloader.isDownloading {
        let condition = NetworkConditionMonitor.shared.condition
        let prefs = MediaDownloadPreferencesStore.shared.preferences
        if MediaDownloadPolicyEngine.shouldAutoDownload(
            kind: currentMediaKind, condition: condition, prefs: prefs
        ) {
            downloader.startTranslatedAudio(
                url: currentAudioUrl,
                fileSize: currentFileSize,
                cacheKey: currentAudioUrl
            )
        }
    }
}
```

`resolveAvailability` modifié pour utiliser `currentAudioUrl` :

```swift
private func resolveAvailability() async {
    let urlString = currentAudioUrl
    if urlString.hasPrefix("file://") { /* unchanged */ return }
    let resolved = MeeshyConfig.resolveMediaURL(urlString)?.absoluteString ?? urlString
    let cached = await CacheCoordinator.shared.audio.isCached(resolved)
    resolvedAvailability = AudioAvailability.resolve(
        isLocalFile: false, localFileExists: false, isServerCached: cached
    )
}
```

### 4.8 `AttachmentDownloader.startTranslatedAudio` — nouvelle méthode (app)

Étendre `AttachmentDownloader` avec une méthode prenant URL+size+type explicites :

```swift
extension AttachmentDownloader {
    /// Download d'un audio traduit (URL HTTPS distincte de l'attachment original).
    /// `fileSize == 0` autorisé (header Content-Length sera lu en cours de DL).
    func startTranslatedAudio(url: String, fileSize: Int64, cacheKey: String) {
        guard !isDownloading, !isCached else { return }
        let resolved = MeeshyConfig.resolveMediaURL(url)?.absoluteString ?? url
        // Reuse downloadFlow logic, with cacheKey = resolved URL, type = .audio
        startDownloadFlow(
            urlString: resolved,
            expectedSize: fileSize,
            cacheStore: .audio,
            cacheKey: resolved
        )
    }
}
```

Refactoring intérieur de `AttachmentDownloader.start(attachment:onShare:)` pour partager `startDownloadFlow(urlString:expectedSize:cacheStore:cacheKey:)` entre les 2 paths. Pas de duplication.

### 4.9 `VideoMediaView` (nouveau, app) + `InlineVideoPlayerView` gated (SDK)

Fichier nouveau : `apps/ios/Meeshy/Features/Main/Views/VideoMediaView.swift`

Wrapper miroir d'`AudioMediaView` pour vidéo :
- `@State private var resolvedAvailability: VideoAvailability = .needsDownload`
- `@StateObject private var downloader = AttachmentDownloader()`
- `.task(id: attachment.fileUrl)` → resolve via `CacheCoordinator.shared.video.isCached(...)` + auto-DL si policy permet
- Rend `InlineVideoPlayerView` avec `availability:` + `onDownload:` params

`VideoAvailability` enum (nouveau SDK file, miroir d'`AudioAvailability`) : `.ready` / `.needsDownload` / `.downloading(progress:)`.

Modifier `InlineVideoPlayerView` (SDK) : 
- Nouveau param `availability: VideoAvailability`, `onDownload: (() -> Void)?`
- `startPlayback()` gated par `availability == .ready`
- Play icon central remplacé par download icon (avec taille `attachment.fileSize`) quand `.needsDownload` ou `.downloading`

### 4.10 `SharedAVPlayerManager.load()` — suppression streaming fallback (SDK)

Modifier `packages/MeeshySDK/Sources/MeeshyUI/Media/SharedAVPlayerManager.swift` lignes 33-70 :

```swift
public func load(urlString: String) {
    // ... existing prerolled + cached path UNCHANGED (l. 47-63) ...

    // PREVIOUSLY (l. 64-69): streaming fallback. REMOVED.
    // Now: if not cached, signal needs-download. Tous les call sites doivent
    // gater via `availability == .ready` AVANT d'appeler `.load(urlString:)`.

    // Si on arrive ici sans cache, c'est une erreur du caller (didn't gate).
    // On log défensivement et n'instancie PAS d'AVPlayer streaming.
    Logger.media.warning(
        "SharedAVPlayerManager.load called for non-cached URL — caller should gate via availability"
    )
}
```

**3 call sites à gater obligatoirement** (Sonnet review) :

| Call site | Fichier | Action |
|---|---|---|
| `InlineVideoPlayerView.startPlayback()` (l. 194) | `packages/MeeshySDK/Sources/MeeshyUI/Media/InlineVideoPlayerView.swift` | Déjà couvert par §4.9 (gate via `VideoAvailability` injectée par `VideoMediaView`) |
| `VideoFullscreenPlayerView` (l. ~185) | `packages/MeeshySDK/Sources/MeeshyUI/Media/VideoFullscreenPlayerView.swift` | **Ajouter param `availability:` + bouton DL si `.needsDownload`**. Tap "Download" → trigger `AttachmentDownloader` propagated from parent. Sans gating, plein écran sur vidéo non cachée = écran noir. |
| `ConversationMediaGalleryView` (l. ~245) | `apps/ios/Meeshy/Features/Main/Views/ConversationMediaGalleryView.swift` | **Pré-resolve availability par item** dans la galerie. Item non cached → afficher download badge avec taille. Tap = trigger DL inline. |

**Stories** : ne passent pas par `SharedAVPlayerManager` dans le code actuel (Sonnet review §5.2 — vrai pipeline = `StoryReaderPrefetcher` + `StoryMediaLoader.shared.preloadAndCachePlayer`). La suppression du fallback **n'impacte donc pas les stories**. Le sous-système C est traité indépendamment en §6.

### 4.11 Images — status quo conditionnel sur engine

`CachedAsyncImage` et `ProgressiveCachedImage` (SDK) consultent `MediaDownloadPolicyEngine` :
- Si `shouldAutoDownload(kind: .image, ...)` retourne `true` → comportement actuel (load progressif via `CacheCoordinator.shared.images.image(for:)`).
- Sinon → s'arrête à la couche ThumbHash + thumbnail (synchronous-only check). Pas de fetch network. Le `DownloadBadgeView` overlay (qui existe déjà pour images dans `BubbleGridCell`) permet tap → manuel DL.

Implémentation : nouvelle propriété `autoLoadFullImage: Bool` calculée à l'init du component depuis `MediaDownloadPolicyEngine` + `NetworkConditionMonitor.shared.condition` + `MediaDownloadPreferencesStore.shared.preferences`. Si `false`, le `.task` async de chargement full est skipped.

**Note d'implémentation** : `MediaDownloadPreferencesStore` est déjà placé dans `MeeshyUI` (voir §4.4). Le `CachedAsyncImage` y accède via `MediaDownloadPreferencesStore.shared.preferences` + `NetworkConditionMonitor.shared.condition`. Pas de paramètre supplémentaire à propager aux call sites existants.

### 4.12 `DownloadBadgeView` — taille toujours visible

Le `DownloadBadgeView` actuel affiche déjà `attachment.fileSize` quand idle (lignes 50-54 de `ConversationMediaViews.swift`). On vérifie en smoke que la taille est visible pour les 3 types (image, audio, vidéo). Aucun changement de code requis sauf si le badge est masqué pour les images cached — à vérifier au tournage.

## 5. Sous-système B — Adoption cache pour attachments optimistes

### 5.1 `DiskCacheStore.adopt(localFile:for:)` (SDK)

Étendre `packages/MeeshySDK/Sources/MeeshySDK/Cache/DiskCacheStore.swift` :

```swift
extension DiskCacheStore {
    /// Adopte un fichier local existant comme entrée cache sous une clé donnée.
    /// Move-if-same-volume, fallback copy + remove. Idempotent : si la clé
    /// existe déjà, no-op (la version cachée a priorité).
    /// Note : on ne seede PAS le `memoryCache` ici pour éviter une lecture
    /// `Data(contentsOf:)` bloquante dans l'actor. L'audio sera relu au
    /// premier `data(for:)` (cache hit disque → NSCache hot après).
    public func adopt(localFile localURL: URL, for canonicalKey: String) async {
        // Utilise le hash interne SHA256-8bytes + extension (`Self.fileKey(for:)`)
        // pour rester compatible avec `isCached`, `load`, `localFileURL`.
        let key = Self.fileKey(for: canonicalKey)
        let destination = cacheDirectory.appendingPathComponent(key)

        // Idempotent : si la clé est déjà cachée, on garde la version existante.
        if FileManager.default.fileExists(atPath: destination.path) {
            return
        }

        do {
            // Try move (atomic, same-volume only).
            try FileManager.default.moveItem(at: localURL, to: destination)
        } catch {
            // Fallback : copy + remove source.
            do {
                try FileManager.default.copyItem(at: localURL, to: destination)
                try? FileManager.default.removeItem(at: localURL)
            } catch {
                Logger.cache.error("DiskCacheStore.adopt failed: \(error.localizedDescription)")
                return
            }
        }
    }
}
```

`CacheCoordinator.shared.audio.adopt(...)`, `.video.adopt(...)`, `.images.adopt(...)` deviennent disponibles.

Cas spécial **images** : seed le `DiskCacheStore._imageCache` (static NSCache d'UIImage) pour le rendu instantané `ProgressiveCachedImage` au prochain affichage :

```swift
extension DiskCacheStore {
    public func adoptImage(localFile localURL: URL, for canonicalKey: String) async {
        await adopt(localFile: localURL, for: canonicalKey)
        // `cacheImageForPreview` est nonisolated static → safe à appeler depuis
        // l'actor. Il fait lui-même `Self.fileKey(for: canonicalKey)` interne.
        let key = Self.fileKey(for: canonicalKey)
        let destination = cacheDirectory.appendingPathComponent(key)
        if let image = UIImage(contentsOfFile: destination.path) {
            DiskCacheStore.cacheImageForPreview(image, key: canonicalKey)
        }
    }
}
```

### 5.2 `OptimisticAttachmentAdopter` (app)

Fichier nouveau : `apps/ios/Meeshy/Features/Main/Services/OptimisticAttachmentAdopter.swift`

```swift
import Foundation
import MeeshySDK

enum OptimisticAttachmentAdopter {
    /// Au moment d'un UPDATE message dans MessagePersistenceActor : si le
    /// fileUrl bascule file:// → https://, déplace la donnée locale vers le
    /// cache typed sous la nouvelle clé canonique.
    /// No-op si conditions non remplies (file failed upload, message reçu, etc.).
    static func adoptIfNeeded(
        new: MeeshyMessageAttachment,
        previousFileUrl: String?
    ) async {
        guard let previous = previousFileUrl,
              previous.hasPrefix("file://"),
              new.fileUrl.hasPrefix("http") else { return }

        guard let localURL = URL(string: previous),
              FileManager.default.fileExists(atPath: localURL.path) else { return }

        let canonicalKey = MeeshyConfig.resolveMediaURL(new.fileUrl)?.absoluteString ?? new.fileUrl

        switch new.type {
        case .audio:
            await CacheCoordinator.shared.audio.adopt(localFile: localURL, for: canonicalKey)
        case .image:
            await CacheCoordinator.shared.images.adoptImage(localFile: localURL, for: canonicalKey)
        case .video:
            await CacheCoordinator.shared.video.adopt(localFile: localURL, for: canonicalKey)
        case .file, .location:
            // Pas de cache typed pour file/location dans CacheCoordinator.
            return
        }
        Logger.cache.info("Adopted local attachment \(previous) → cache key \(canonicalKey)")
    }
}
```

### 5.3 Branchement dans `MessagePersistenceActor.updateServerAckedFields`

Modifier `packages/MeeshySDK/Sources/MeeshySDK/Persistence/MessagePersistenceActor.swift:543` (`updateServerAckedFields`) — **pas** `upsertFromAPIMessages`. C'est le premier moment où l'URL HTTPS canonique arrive via le socket ACK, alors que le fichier local optimiste existe encore.

`updateServerAckedFields(localId:content:attachmentsJson:reactionsJson:...)` reçoit `attachmentsJson: Data?` (JSON encodé). On doit :
1. SELECT le `attachmentsJson` actuel (l'optimiste avec `file://`) via le dbWriter
2. Décoder old + new `[MeeshyMessageAttachment]`
3. Pairer (index + fallback `originalName + mimeType`) et adopter
4. Laisser l'UPDATE SQL existant écraser `attachmentsJson` normalement

```swift
public func updateServerAckedFields(
    localId: String,
    content: String?,
    attachmentsJson: Data?,
    // ... autres params inchangés ...
) throws {
    // Read old attachments AVANT l'UPDATE (avant que `attachmentsJson` soit
    // remplacé). Skip si nouveaux attachments == nil (pas de changement).
    let oldAttachments: [MeeshyMessageAttachment] = (try? dbWriter.read { db in
        try? MessageRecord.filter(Column("localId") == localId)
            .fetchOne(db)?
            .attachmentsJson
            .flatMap { try? JSONDecoder().decode([MeeshyMessageAttachment].self, from: $0) }
    }) ?? []

    let newAttachments: [MeeshyMessageAttachment] = attachmentsJson
        .flatMap { try? JSONDecoder().decode([MeeshyMessageAttachment].self, from: $0) }
        ?? []

    // Adoption pré-UPDATE : déplace les fichiers locaux file:// vers le cache
    // typed sous la clé HTTPS canonique. Fire-and-forget (Task non bloqué par
    // l'UPDATE SQL, qui doit se faire de toute façon).
    Task {
        await Self.adoptChangedAttachments(old: oldAttachments, new: newAttachments)
    }

    // ... reste de la méthode inchangé : UPDATE SQL ...
}

private static func adoptChangedAttachments(
    old: [MeeshyMessageAttachment],
    new: [MeeshyMessageAttachment]
) async {
    for newAtt in new {
        // Pairing : 1) par id local optimiste (= localAttachmentId si présent) ;
        // 2) par index ; 3) par originalName + mimeType (fallback ordre serveur différent).
        let oldAtt = old.first(where: { $0.id == newAtt.id })
            ?? (new.firstIndex(of: newAtt).flatMap { idx in idx < old.count ? old[idx] : nil })
            ?? old.first(where: { $0.originalName == newAtt.originalName && $0.mimeType == newAtt.mimeType })

        guard let previous = oldAtt else { continue }
        await OptimisticAttachmentAdopter.adoptIfNeeded(
            new: newAtt, previousFileUrl: previous.fileUrl
        )
    }
}
```

**Pairing à 3 niveaux** :
1. **Par id** (le plus fiable) : si l'optimistic-attachment-id est préservé entre les versions.
2. **Par index** (rapide) : suppose même ordre.
3. **Par `originalName + mimeType`** (fallback robuste) : couvre les réorderings serveur.

**Note d'audit** : la vérification du contrat exact d'ordre des attachments serveur reste à confirmer lors de l'implémentation (lire l'API gateway concerné). Le pairing à 3 niveaux protège contre les 3 cas.

### 5.4 Tests sous-système B

- `DiskCacheStoreAdoptionTests` : adopt fichier existant → `isCached(key) == true` ; adopt 2× même clé → idempotent ; cleanup source fichier après move ; memory cache hot après adopt.
- `OptimisticAttachmentAdopterTests` : file:// → https:// audio adopte vers `CacheCoordinator.shared.audio` ; image idem vers `.images` + `_imageCache` seeded ; vidéo idem vers `.video` ; file/location no-op ; reçu (previous nil) no-op ; failed upload (new toujours file://) no-op.

## 6. Sous-système C — Stories smart streaming prefix-buffer

### 6.1 `StoryMediaPlaybackState` (SDK)

Fichier nouveau : `packages/MeeshySDK/Sources/MeeshyUI/Stories/StoryMediaPlaybackState.swift`

```swift
public enum StoryMediaPlaybackState: Equatable, Sendable {
    case loadingPlaceholder   // buffer < preferredPrefixSeconds, show ThumbHash → Thumbnail
    case readyToPlay          // buffer ≥ preferredPrefixSeconds, AVPlayer prêt
    case playing
    case paused
    case failed(reason: String)
}
```

### 6.2 `StoryMediaPlayerCoordinator` (SDK)

Fichier nouveau : `packages/MeeshySDK/Sources/MeeshyUI/Stories/StoryMediaPlayerCoordinator.swift`

```swift
import AVFoundation
import Combine
import MeeshySDK

@MainActor
public final class StoryMediaPlayerCoordinator: ObservableObject {
    @Published public private(set) var state: StoryMediaPlaybackState = .loadingPlaceholder
    @Published public private(set) var bufferedSeconds: Double = 0

    public let preferredPrefixSeconds: TimeInterval = 5.0
    public let bufferTimeoutSeconds: TimeInterval = 15.0

    public private(set) var player: AVPlayer?
    private var playerItem: AVPlayerItem?
    private var observers: [NSKeyValueObservation] = []
    private var backgroundCacheTask: Task<Void, Never>?
    private var bufferTimeoutTask: Task<Void, Never>?

    public init() {}

    public func load(url: String, kind: MediaKind) {
        stop()

        let canonical = MeeshyConfig.resolveMediaURL(url)?.absoluteString ?? url

        // Path A : si déjà cached → AVPlayer depuis fichier local → readyToPlay immédiat.
        let store: DiskCacheStore = (kind == .video) ? CacheCoordinator.shared.video : CacheCoordinator.shared.audio
        if let localURL = store.cachedFileURL(for: canonical) {
            setupPlayer(url: localURL, isLocal: true)
            state = .readyToPlay
            return
        }

        // Path B : streaming AVPlayer + background download.
        guard let remoteURL = URL(string: canonical) else {
            state = .failed(reason: "Invalid URL")
            return
        }

        // AVPlayer avec preferredForwardBufferDuration = 5s.
        let item = AVPlayerItem(url: remoteURL)
        item.preferredForwardBufferDuration = preferredPrefixSeconds
        setupPlayerItem(item)

        // Background URLSession download → persist en cache pour les visions suivantes.
        backgroundCacheTask = Task.detached(priority: .utility) {
            _ = try? await store.data(for: canonical)
        }
    }

    public func play() {
        guard state == .readyToPlay || state == .paused else { return }
        player?.play()
        state = .playing
    }

    public func pause() {
        player?.pause()
        if state == .playing { state = .paused }
    }

    public func stop() {
        backgroundCacheTask?.cancel()
        backgroundCacheTask = nil
        bufferTimeoutTask?.cancel()
        bufferTimeoutTask = nil
        observers.forEach { $0.invalidate() }
        observers.removeAll()
        player?.pause()
        player = nil
        playerItem = nil
        bufferedSeconds = 0
        state = .loadingPlaceholder
    }

    /// Buffer timeout : si après `bufferTimeoutSeconds` le buffer n'a pas
    /// atteint `preferredPrefixSeconds`, transition vers `.failed`. Évite que
    /// le viewer reste bloqué en ThumbHash indéfiniment sur réseau lent.
    private func scheduleBufferTimeout() {
        bufferTimeoutTask?.cancel()
        bufferTimeoutTask = Task { [weak self] in
            try? await Task.sleep(nanoseconds: UInt64((self?.bufferTimeoutSeconds ?? 15) * 1_000_000_000))
            guard !Task.isCancelled, let self else { return }
            if self.state == .loadingPlaceholder {
                self.state = .failed(reason: "Buffer timeout — réseau insuffisant")
            }
        }
    }

    // MARK: - Private setup

    private func setupPlayer(url: URL, isLocal: Bool) {
        let item = AVPlayerItem(url: url)
        setupPlayerItem(item)
    }

    private func setupPlayerItem(_ item: AVPlayerItem) {
        playerItem = item
        let player = AVPlayer(playerItem: item)
        self.player = player

        let statusObs = item.observe(\.status) { [weak self] item, _ in
            Task { @MainActor in self?.handleStatusChange(item.status) }
        }
        let bufferObs = item.observe(\.loadedTimeRanges) { [weak self] item, _ in
            Task { @MainActor in self?.handleBufferChange(item.loadedTimeRanges) }
        }
        observers = [statusObs, bufferObs]

        scheduleBufferTimeout()
    }

    private func handleStatusChange(_ status: AVPlayerItem.Status) {
        // Guard contre les callbacks tardifs après un `stop()` qui a effacé
        // playerItem.
        guard playerItem != nil else { return }
        if status == .failed {
            state = .failed(reason: playerItem?.error?.localizedDescription ?? "Unknown")
            bufferTimeoutTask?.cancel()
        }
    }

    private func handleBufferChange(_ ranges: [NSValue]) {
        // Guard contre les callbacks tardifs après un `stop()`.
        guard playerItem != nil, !ranges.isEmpty else { return }
        // `range.start == 0` filter : valide pour MP4 statique (cas Meeshy).
        // Si HLS adaptive est ajouté au futur, ce filter sera trop strict —
        // les segments peuvent commencer à un PTS non-zéro. Vérifier le format
        // serveur lors de l'implémentation.
        let buffered = ranges.compactMap { value -> Double? in
            let range = value.timeRangeValue
            guard range.start.seconds == 0 else { return nil }
            return range.duration.seconds
        }.max() ?? 0
        bufferedSeconds = buffered
        if buffered >= preferredPrefixSeconds, state == .loadingPlaceholder {
            state = .readyToPlay
            bufferTimeoutTask?.cancel()
        }
    }
}
```

### 6.2.1 ⚠️ TODO d'audit pré-implémentation — pipeline story réel

**Sonnet review §5.2** a identifié que `StoryViewerView` n'utilise **PAS** `SharedAVPlayerManager.load()` directement. Le vrai pipeline existant est :
- `StoryReaderPrefetcher` (`@State` dans `StoryViewerView`) qui orchestre le prefetch des slides
- `StoryMediaLoader.shared.preloadAndCachePlayer(url:)` (appelée depuis `StoryViewModel.swift:326`)
- `preloadedVideoURLs` / `preloadedAudioURLs` dans le state du viewer

**À auditer avant d'écrire le plan d'impl du sous-système C** :
1. Lire `StoryReaderPrefetcher.swift` + `StoryMediaLoader.swift` + `StoryViewerView+Content.swift`.
2. Comprendre comment `preloadedVideoURLs` est consommé par les slide renderers actuels.
3. Décider :
   - **Option A — Remplacer** le pipeline existant par `StoryMediaPlayerCoordinator` (rupture, à valider avec l'utilisateur).
   - **Option B — Compléter** : `StoryMediaPlayerCoordinator` consomme `StoryMediaLoader.shared.cachedPlayer(for:)` si disponible (préroll existant), sinon démarre son propre buffering. Le `StoryReaderPrefetcher` reste responsable du déclenchement par slide à venir.
   - **Option C — Refactoriser** `StoryMediaLoader.preloadAndCachePlayer` pour qu'il utilise déjà la stratégie 5s prefix + thumbnail placeholder (au lieu d'introduire un nouveau coordinator).

Le choix dépend du code lu. **Le sous-système C est marqué comme « à finaliser après audit » dans le découpage 3-PRs (§15)**. Le plan d'implémentation des PRs A et B peut être écrit immédiatement ; le plan de PR C attend l'audit.

### 6.3 Story viewer slide renderers — integration

Modifier les slide renderers dans `StoryViewerView` (apps/ios) pour utiliser `StoryMediaPlayerCoordinator` au lieu de `SharedAVPlayerManager` directement :

```swift
@StateObject private var coordinator = StoryMediaPlayerCoordinator()

var body: some View {
    ZStack {
        // Placeholder : ThumbHash → Thumbnail si cached
        if coordinator.state == .loadingPlaceholder {
            placeholder
        } else if let player = coordinator.player {
            AVPlayerLayerView(player: player)
                .transition(.opacity)
        }
    }
    .task(id: slide.media.fileUrl) {
        coordinator.load(url: slide.media.fileUrl, kind: slide.media.isVideo ? .video : .audio)
    }
    .onChange(of: coordinator.state) { _, newState in
        if newState == .readyToPlay && isCurrentSlide {
            coordinator.play()
        }
    }
}

@ViewBuilder
private var placeholder: some View {
    if let thumbHash = slide.media.thumbHash, let img = ThumbHashDecoder.decode(thumbHash) {
        Image(uiImage: img).resizable().scaledToFill()
    } else if let thumbUrl = slide.media.thumbnailUrl {
        CachedAsyncImage(url: thumbUrl) { Color.gray.shimmer() }
    } else {
        Color.gray.shimmer()
    }
}
```

### 6.4 Auto-advance gating

Le timer auto-advance du `StoryViewerView` consulte `coordinator.state` : si `.loadingPlaceholder`, ne décrémente pas le timer. Reprend dès `.readyToPlay`.

### 6.5 Préférences utilisateur respectées

Avant de loader, le `StoryViewerView` consulte `MediaDownloadPolicyEngine.shouldAutoDownload(kind: .video/.audio, condition:, prefs:)` :
- Si `true` (défaut wifi/goodCellular) → `coordinator.load(...)` immédiat.
- Sinon → afficher ThumbHash + bouton "Charger" overlay. Tap → `coordinator.load(...)`.

### 6.6 Tests sous-système C

- `StoryMediaPlayerCoordinatorTests` (Swift Testing) : 
  - `load` avec URL cached → `state == .readyToPlay` immédiat
  - `load` avec URL non cachée → `state == .loadingPlaceholder` initial, transition `.readyToPlay` quand `bufferedSeconds ≥ 5`
  - `state == .failed` quand AVPlayerItem.status == .failed
  - `stop()` clean tous les observers + background tasks
- Smoke story viewer : ouvrir story vidéo non cachée → ThumbHash placeholder → thumbnail si cached → vidéo après ~5s buffer → auto-advance pause confirmé.
- Smoke répétition : ouvrir story déjà vue → instant playback depuis cache.

## 7. Cross-cutting — Backend follow-up

**Hors scope iOS immédiat.** Documenté comme suivi nécessaire.

Étendre `MessageTranslatedAudio` schema avec `fileSize: Int`. Coordination cross-stack :

| Service | Action |
|---|---|
| `services/translator` | Populate `fileSize` (bytes) après génération TTS audio. Renvoyer dans `translation:completed` payload. |
| `services/gateway` | Forwarder `fileSize` dans le socket event + REST endpoint translations. Étendre `messageTranslatedAudioSchema` Zod. |
| `packages/shared/types` | `messageTranslatedAudioSchema` += `fileSize: z.number().int().nonnegative().default(0)`. |
| iOS SDK | `MessageTranslatedAudio.fileSize: Int` (default `0`). Code consommateur déjà gracieux pour `fileSize == 0` (`DownloadBadgeView.totalSizeText` retourne `""`). |

L'implémentation iOS est livrable **sans attendre** ce backend. Les audios traduits affichent simplement pas de taille tant que la coordination backend n'est pas livrée.

## 8. Matrice non-régression (comportement)

| Cas | Avant | Après |
|---|---|---|
| Tap play audio orig cached | Joue | Identique |
| Tap play audio orig non-cached | Button DL → download → joue | Identique |
| **Switch langue audio non-cached** | **Streame silencieusement** | **Switch langue → stop player → button DL (avec taille si backend livré) → user tape → DL → joue** |
| Switch langue audio cached | Joue instantanément | **Switch langue → stop player → user retappe play → joue** (regression UX consciente) |
| Audio reply (Task précédente mergée) | Citation dans topSlot du widget audio | Identique + maintenant gated par availability per language |
| Tap play vidéo inline non-cached | Stream + background cache | **Affiche button DL + taille → user tape → DL → joue depuis local** |
| Tap play vidéo inline cached | Joue depuis local | Identique |
| Image dans bulle/feed | Auto-progressif | Auto-progressif **si policy permet**. Sinon ThumbHash + thumb + button DL manuel |
| Envoi audio optimiste → reçu serveur | Local file remplacé par https; ré-DL au play | **Adoption cache : 0 ré-DL, joue instantanément depuis cache local sous clé HTTPS** |
| Envoi image optimiste | Ré-fetch image au display de la version serveur | **Adoption cache : rendu instantané depuis `_imageCache`** |
| Envoi vidéo optimiste | Ré-stream au tap play | **Adoption cache : joue instantanément depuis local** |
| Story ouverte (vidéo non cachée) | Stream direct via SharedAVPlayerManager | **ThumbHash → Thumbnail → vidéo après ≥ 5s buffer. Auto-advance pause pendant** |
| Story ouverte (vidéo cachée) | Joue depuis local via SharedAVPlayerManager | **Joue depuis local via `StoryMediaPlayerCoordinator` (cache path)** |
| Settings UI Téléchargement | N'existait pas | **Nouvelle section Préférences : 4 rows (Image/Audio/Audio Trad/Vidéo) × 4 options** |

## 9. Edge cases

- **Upload failed** : `attachment.fileUrl` reste `file://`. `OptimisticAttachmentAdopter.adoptIfNeeded` no-op. Fichier local préservé pour retry.
- **Message reçu (pas envoyé)** : `previousFileUrl == nil`. `adoptIfNeeded` no-op.
- **Adoption + suppression rapide** : cache contient encore la donnée sous clé canonique → evicted normalement par budget LRU. Pas de fuite.
- **Adoption idempotente** : 2 appels → second no-op.
- **Pairing attachments optimiste/serveur par ordre différent** : si gateway renvoie ordre différent, le pairing index peut adopter le mauvais fichier. Fallback : matcher par `originalName + mimeType`. À implémenter défensivement.
- **Concurrence** : `DiskCacheStore` actor → sérialisation naturelle.
- **`switchToLanguage` pendant playback en cours** : `player.stop()` arrête nettement.
- **`StoryMediaPlayerCoordinator.load` appelé 2× rapide** : `stop()` interne nettoie l'ancien state avant rebind.
- **Story déjà préchargée par `StoryMediaLoader.shared`** : le coordinator peut consulter `StoryMediaLoader.shared.cachedPlayer(for:)` en plus du disk cache. Bonus de performance, optionnel.
- **Background app return** : `NWPathMonitor` reste actif. `MediaDownloadPreferencesStore` lit ses defaults au moment où consulté. Pas de désync.
- **NWPathMonitor cost** : 1 singleton partagé. Léger.
- **`fileSize == 0`** : `AttachmentDownloader.fmt(0)` retourne `"0B"` — il faut gérer côté `DownloadBadgeView.totalSizeText` (retourner `""` si toutes les sources sont 0). Déjà géré (vérifié exploration).
- **`AVPlayer.loadedTimeRanges` flakiness** : double-check sur `playerItem.status == .readyToPlay`. Timeout défensif (15s) → state `.failed` si pas de buffer.

## 10. Risques mitigés

| Risque | Mitigation appliquée |
|---|---|
| `SharedAVPlayerManager` partagé Story ↔ Conversation | **Séparation des paths** : stories → `StoryMediaPlayerCoordinator` autonome ; conversations → `SharedAVPlayerManager` sans streaming fallback. |
| Heuristique `goodCellular` imparfaite | Documenté. Follow-up speed test (HEAD chrono) si feedback. |
| `AVAssetResourceLoaderDelegate` complexité | Pas utilisé. AVPlayer natif buffer (5s `preferredForwardBufferDuration`) + URLSession parallèle pour persist disk. UX équivalente, complexité réduite. |
| `loadedTimeRanges` flakiness | KVO + double-check `playerItem.status == .readyToPlay`. Timeout 15s vers `.failed`. |
| Range requests serveur (gateway/Traefik) | Supporté par défaut Traefik sur fichiers statiques. Smoke à valider. |
| Story audio + AVPlayer vs AVAudioPlayer | Audio story = AVPlayer (supports partial). Audio message standard = AVAudioPlayer (full data, conforme policy). Deux paths bien distincts. |
| UX regression switch langue ne joue plus immédiatement | Décision consciente alignée policy. Documenté dans release notes. Follow-up possible : auto-trigger DL au switch + auto-play à la fin (si retour utilisateur négatif). |
| Migration utilisateurs existants | Pas de migration nécessaire — `MediaDownloadPreferences.defaults` appliqué au premier lancement. |
| Pairing attachments index optimiste/serveur | Fallback `originalName + mimeType` si index échoue. |
| `MediaDownloadPreferencesStore` accessible depuis SDK images | Déplacement du Store dans `MeeshyUI` target (UserDefaults accessible). |

## 11. Tests (synthèse)

### Sous-système A
- `NetworkConditionMonitorTests` : `resolve(path:)` pur, 4 cas couverts.
- `MediaDownloadPolicyEngineTests` : table 4×4 = 16 cas + offline gate.
- `MediaDownloadPreferencesStoreTests` : roundtrip JSON, défauts, debounce.
- `AudioMediaViewTests` : `currentAudioUrl` switch langue, `resolveAvailability` re-resolve, auto-DL si policy permet.
- `VideoMediaViewTests` (nouveau) : miroir d'AudioMediaView.
- `AttachmentDownloaderTests` : `startTranslatedAudio` cache sous bonne clé, progress reporté.

### Sous-système B
- `DiskCacheStoreAdoptionTests` : adopt fichier existant ; idempotence ; cleanup source ; memory cache hot.
- `OptimisticAttachmentAdopterTests` : file:// → https:// audio/image/vidéo ; reçu no-op ; failed upload no-op ; file/location no-op.

### Sous-système C
- `StoryMediaPlayerCoordinatorTests` : load cached = readyToPlay immédiat ; load streaming → buffering → readyToPlay quand ≥ 5s ; status failed ; stop clean.

### Smoke visuel (manuel)
1. Audio orig non cached → button DL + taille → tap → DL progress → joue ✓
2. Switch langue audio non cached → stop + button DL + taille (si backend livré) → tap → DL → joue ✓
3. Switch langue audio cached → stop + tap play → joue ✓
4. Vidéo inline non cachée → button DL + taille → tap → DL → joue ✓
5. Envoi audio → réconciliation → joue instantanément sans re-DL ✓
6. Envoi image → réconciliation → rendu instantané ✓
7. Story vidéo non cachée → ThumbHash → vidéo après ~5s buffer → auto-advance pause confirmée ✓
8. Story vidéo cachée 2ème vue → instant playback ✓
9. Settings → toggle vidéo à "never" → vidéos restent en button DL même en wifi ✓
10. Bad cellular simulé (Low Data Mode) → audios + vidéos restent en button DL ✓

## 12. Critères de succès

Après merge :
1. Tous les tests `MeeshyTests` + `MeeshySDKTests` + `MeeshyUITests` passent (`./apps/ios/meeshy.sh test` + xcodebuild SDK).
2. La matrice §8 est validée par le smoke §11.
3. Le bug §1.1 (switch langue streaming) ne se reproduit plus.
4. Un audio/image/vidéo qu'on vient d'envoyer joue instantanément sans re-téléchargement.
5. Les stories ne montrent plus jamais un AVPlayer noir avant lecture — toujours ThumbHash/Thumbnail puis vidéo.
6. Settings → Téléchargement automatique : 4 rows fonctionnelles, valeurs persistées entre lancements.
7. `MediaDownloadPolicyEngine.shouldAutoDownload(...)` est consulté à 100 % des chemins d'auto-DL — aucun téléchargement silencieux hors politique.

## 13. Hors scope (suivis)

- **Backend `MessageTranslatedAudio.fileSize`** : coordination translator + gateway + shared types. Spec et plan séparés.
- **Speed test cellulaire actif** : si l'heuristique `goodCellular` génère trop de faux positifs.
- **Cache adoption pour `file` et `location`** : pas de cache typed actuel. Si demande future, ajout d'un `CacheCoordinator.shared.files`.
- **Bouton "Pause download"** dans `DownloadBadgeView` : pas demandé, follow-up éventuel.
- **Téléchargements en parallèle limités** : URLSession queue dimensionnée. Pas d'optimisation explicite ici.
- **Story audio via AVAudioPlayer (regression possible)** : si `AVPlayer` audio s'avère moins fluide que `AVAudioPlayer` pour stories, fallback nécessaire.
- **Annulation de DL en cours quand réseau change** : voir §14.2 — décision explicite = le DL continue (cohérent avec WhatsApp / Telegram).

## 14. Décisions explicites (Sonnet review §3)

### 14.1 Tap image fullscreen avec policy `.never`

L'utilisateur a la préférence Image = `.never`. Une image dans une bulle reste donc en ThumbHash + badge DL (pas d'auto-DL). Si l'utilisateur **tape** sur l'image (pour fullscreen), `ImageFullscreen` est ouvert.

**Comportement attendu** : tap = action utilisateur explicite ⇒ déclenche un DL manuel **indépendamment de la policy**. La policy régit l'auto-DL, pas les actions utilisateur explicites. Le download badge dans `ImageFullscreen` permet aussi un DL manuel si nécessaire.

Implémentation : `ImageFullscreen.body` invoque `AttachmentDownloader.start(...)` à l'`onAppear` si l'image n'est pas cached, **ignorant** la policy. Documenté dans le commentaire de l'`onAppear`.

### 14.2 Réseau change pendant DL (wifi → cellular sur policy `.wifiOnly`)

**Décision** : le DL en cours **continue**. La policy régit le **déclenchement**, pas la **continuation**. Cohérent avec le comportement de WhatsApp / Telegram. Évite la complexité de gérer l'annulation propre + reprise.

Documenté dans `AttachmentDownloader.startDownloadFlow` via un commentaire :
```swift
// Note : si le réseau bascule wifi → cellular pendant un DL, on continue.
// L'utilisateur a déjà engagé la bande passante ; annuler créerait plus de
// confusion que de bénéfice. Pour les très gros DL (vidéo > 50MB), follow-up
// possible : prompt user "votre connexion a changé, continuer ?".
```

Pas d'observation `NetworkConditionMonitor.condition` dans `AttachmentDownloader`.

### 14.3 Message optimiste supprimé avant adoption

Si l'utilisateur supprime un message optimiste avant le socket ACK (rare mais possible), `OptimisticAttachmentAdopter.adoptIfNeeded` peut être appelé pour un message dont `deletedAt != nil`. Le fichier est adopté dans le cache typed sous la clé HTTPS d'un message supprimé.

**Décision** : on accepte l'adoption (effets de bord négligeables) — le LRU evict le fichier rapidement (pas de retention pression). Le coût d'ajouter une vérification `deletedAt` à `OptimisticAttachmentAdopter` n'est pas justifié.

Documenté en commentaire de `OptimisticAttachmentAdopter.adoptIfNeeded`.

## 15. Découpage en 3 PRs séquentielles (Sonnet review §2.3)

Le spec décrit 3 sous-systèmes architecturalement indépendants. Le plan d'implémentation les livre en **3 PRs séquentielles** avec critères de merge distincts.

### PR A — Politique download-first messages

**Scope** : §4 entièrement. Inclut :
- `NetworkConditionMonitor` + `MediaDownloadPreferences` + `MediaDownloadPolicyEngine` + `MediaDownloadPreferencesStore`
- `MediaDownloadSettingsView` (Settings UI)
- Fix `AudioPlayerView.switchToLanguage()` (§4.6) — bug §1.1
- `AudioMediaView.currentAudioUrl` + auto-DL per condition (§4.7)
- `AttachmentDownloader.startTranslatedAudio` (§4.8)
- `VideoMediaView` + `VideoAvailability` + `InlineVideoPlayerView` gated (§4.9)
- Gating `VideoFullscreenPlayerView` + `ConversationMediaGalleryView` (§4.10)
- `SharedAVPlayerManager.load()` streaming fallback supprimé (§4.10)
- `CachedAsyncImage` / `ProgressiveCachedImage` consultent engine (§4.11)

**Critères de merge PR A** :
- 16 tests `MediaDownloadPolicyEngine` passent
- Smoke scénarios §11.1-4 + §11.9-10 validés
- `switchToLanguage` ne streame plus (smoke 2-3)
- Bug §1.1 corrigé sur device
- Tous les tests existants `MeeshyTests` + `MeeshySDKTests` passent

### PR B — Adoption cache optimiste

**Scope** : §5 entièrement (corrigé pour cibler `updateServerAckedFields`). Inclut :
- `DiskCacheStore.adopt(localFile:for:)` + `adoptImage` (§5.1)
- `OptimisticAttachmentAdopter.adoptIfNeeded` (§5.2)
- Branchement dans `MessagePersistenceActor.updateServerAckedFields` (§5.3, pas `upsertFromAPIMessages`)
- Pairing à 3 niveaux (id → index → originalName+mimeType)

**Critères de merge PR B** :
- Tests `DiskCacheStoreAdoptionTests` + `OptimisticAttachmentAdopterTests` passent
- Smoke scénarios §11.5-6 validés
- Envoi audio/image/vidéo + réception serveur : 0 re-DL, lecture instantanée

PR B peut être mergée avant ou après PR A — indépendante.

### PR C — Stories smart streaming

**Scope** : §6 entièrement, **après audit du pipeline story existant** (§6.2.1).

**Pré-requis avant d'écrire le plan PR C** : audit `StoryReaderPrefetcher` + `StoryMediaLoader.preloadAndCachePlayer` + `StoryViewerView+Content.swift` (audit livrable à part). Décision Option A/B/C (§6.2.1) prise.

**Critères de merge PR C** :
- Tests `StoryMediaPlayerCoordinatorTests` passent (avec stratégie d'injection DiskCacheStore mockable — à designer pendant audit)
- Smoke scénarios §11.7-8 validés
- Auto-advance pause confirmée pendant buffer
- Aucune régression sur stories cachées (instant playback préservé)

PR C **dépend conceptuellement** de PR A (`MediaDownloadPolicyEngine` consulté pour stories aussi), mais techniquement la PR A peut être mergée sans PR C.

### Ordre de merge recommandé
1. **PR A** d'abord (fix le bug §1.1 le plus visible)
2. **PR B** ensuite (optimisation UX envoi)
3. **PR C** en dernier (après audit + design final)

Chaque PR doit passer la review code complète avant merge sur `main` (pas d'admin merge).
