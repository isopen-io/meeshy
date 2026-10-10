import UIKit
import AVFoundation
import PhotosUI
import SwiftUI
import ImageIO
import MeeshySDK

// MARK: - Story Media Loader

/// Centralized media loading with hardware-accelerated downsampling (ImageIO)
/// and async video thumbnail extraction. All heavy work runs off main thread.
@MainActor
public final class StoryMediaLoader {
    // iOS 26.1 : deinit synthétisée ISOLÉE (SE-0466, isolation MainActor par
    // défaut) → double-free `pointer being freed was not allocated` (abrt)
    // au démontage hors d'une tâche (test XCTest synchrone, vue démontée).
    // Garde : MainActorDeinitSourceGuardTests / MeeshyUIDeinitSourceGuardTests.
    nonisolated deinit {}
    public static let shared = StoryMediaLoader()

    private init() {
        // React to system memory pressure — drop the thumbnail cache and tear
        // down all prerolled players. Without this, a sustained tour through
        // many stories accumulated up to `maxCachedPlayers` prerolled
        // `AVQueuePlayer` instances plus 100 thumbnails (~30 MB) until the next
        // manual `clear*` call.
        NotificationCenter.default.addObserver(
            forName: UIApplication.didReceiveMemoryWarningNotification,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            Task { @MainActor in
                self?.clearThumbnailCache()
                self?.clearPlayerCache()
            }
        }
    }

    private let thumbnailCache: NSCache<NSString, UIImage> = {
        let cache = NSCache<NSString, UIImage>()
        cache.countLimit = 100
        cache.totalCostLimit = 30 * 1024 * 1024
        return cache
    }()

    // MARK: - Image Loading (PhotosPickerItem)

    /// Load and downsample an image from PhotosPickerItem.
    /// Uses ImageIO for hardware-accelerated decode + downsample in a single pass.
    public func loadImage(from item: PhotosPickerItem, maxDimension: CGFloat = 1080) async -> UIImage? {
        guard let data = try? await item.loadTransferable(type: Data.self) else { return nil }
        return await loadImage(data: data, maxDimension: maxDimension)
    }

    /// Load and downsample an image from raw Data.
    /// Decodes directly at target size — never allocates full-resolution bitmap.
    public func loadImage(data: Data, maxDimension: CGFloat = 1080) async -> UIImage? {
        let localData = data
        let dim = maxDimension
        return await Task.detached(priority: .userInitiated) {
            StoryMediaLoader.downsample(data: localData, maxDimension: dim)
        }.value
    }

    /// Downsample + encodage JPEG en UN SEUL aller hors du thread principal.
    /// Les deux opérations sont les deux moitiés du même travail (préparer un
    /// fichier temporaire pour un média de premier plan) : les séparer
    /// laisserait l'encodage — le plus coûteux des deux — sur le MainActor.
    public func downsampledJPEG(
        image: UIImage,
        maxDimension: CGFloat,
        compressionQuality: CGFloat
    ) async -> (image: UIImage, data: Data)? {
        let source = image
        let dim = maxDimension
        let quality = compressionQuality
        return await Task.detached(priority: .userInitiated) {
            let resized = StoryMediaLoader.downsample(image: source, maxDimension: dim) ?? source
            guard let data = resized.jpegData(compressionQuality: quality) else { return nil }
            return (resized, data)
        }.value
    }

    /// Cœur PUR du redimensionnement, `nonisolated` : c'est ce qui garantit que
    /// le travail lourd ne peut PAS revenir sur le MainActor par accident.
    /// `UIGraphicsImageRenderer` est utilisable hors thread principal.
    ///
    /// Pas de variante publique `downsampled(image:)` : elle n'a jamais eu
    /// d'appelant hors tests. Le seul chemin d'un `UIImage` DÉJÀ décodé (capture
    /// caméra, asset de la pellicule) est `downsampledJPEG`, qui redimensionne
    /// ET encode en un seul aller détaché — les séparer laissait l'encodage, la
    /// plus coûteuse des deux moitiés, sur le MainActor.
    nonisolated static func downsample(image: UIImage, maxDimension: CGFloat) -> UIImage? {
        let size = image.size
        let longest = max(size.width, size.height)
        guard longest > maxDimension, longest > 0 else { return image }
        let scale = maxDimension / longest
        let target = CGSize(width: (size.width * scale).rounded(),
                            height: (size.height * scale).rounded())
        let format = UIGraphicsImageRendererFormat.default()
        format.scale = 1
        format.opaque = false
        return UIGraphicsImageRenderer(size: target, format: format).image { _ in
            image.draw(in: CGRect(origin: .zero, size: target))
        }
    }

    // MARK: - ImageIO Downsampling (nonisolated — runs on background thread)

    /// Hardware-accelerated downsample via CGImageSource.
    /// - `kCGImageSourceCreateThumbnailFromImageAlways`: force thumbnail creation
    /// - `kCGImageSourceShouldCacheImmediately`: decode NOW, not on first render
    /// - `kCGImageSourceThumbnailMaxPixelSize`: target dimension (longest side)
    /// This is 5-10x more memory efficient than UIImage(data:) + resize after.
    nonisolated private static func downsample(data: Data, maxDimension: CGFloat) -> UIImage? {
        let sourceOptions: [CFString: Any] = [
            kCGImageSourceShouldCache: false
        ]
        guard let source = CGImageSourceCreateWithData(data as CFData, sourceOptions as CFDictionary) else {
            return nil
        }

        let downsampleOptions: [CFString: Any] = [
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceShouldCacheImmediately: true,
            kCGImageSourceCreateThumbnailWithTransform: true,
            kCGImageSourceThumbnailMaxPixelSize: maxDimension
        ]
        guard let cgImage = CGImageSourceCreateThumbnailAtIndex(source, 0, downsampleOptions as CFDictionary) else {
            return nil
        }
        return UIImage(cgImage: cgImage)
    }

    // MARK: - Video Thumbnail (Async + Cached)

    /// Extract first frame of a video, async, with caching by URL.
    /// Returns cached result if available, otherwise extracts and caches.
    public func videoThumbnail(url: URL, maxDimension: CGFloat = 400) async -> UIImage? {
        let cacheKey = url.absoluteString as NSString
        if let cached = thumbnailCache.object(forKey: cacheKey) {
            return cached
        }

        // VideoToolbox HW decode via StoryMediaDecoder (Phase 3 Task 3.3) —
        // async + iOS 16+ image(at:) API. `maxDimension` is preserved so 4K
        // sources don't blow the memory budget.
        let thumbnail = try? await StoryMediaDecoder.firstFrame(of: url, maxDimension: maxDimension)

        if let thumbnail {
            thumbnailCache.setObject(thumbnail, forKey: cacheKey)
            // Persist to disk cache so VideoThumbnailView finds it
            if let jpegData = thumbnail.jpegData(compressionQuality: 0.7) {
                let diskKey = "thumb:\(url.absoluteString)"
                await CacheCoordinator.shared.thumbnails.store(jpegData, for: diskKey)
            }
        }
        return thumbnail
    }

    // MARK: - Preload Video Player

    /// **La source d'un lecteur préparé : le fichier local d'abord** (#9702).
    ///
    /// Le pool est indexé par l'URL DISTANTE — la clé que les surfaces
    /// demandent — mais un lecteur bâti sur elle jouait en streaming et
    /// re-téléchargeait un fichier que le registre partagé venait de poser sur
    /// le disque. La clé reste distante, la SOURCE devient locale dès qu'elle
    /// existe : décodage depuis le disque, aucun octet réseau en double.
    nonisolated static func prerollSource(remote: URL, localFile: URL?) -> URL {
        localFile ?? remote
    }

    /// Create an AVPlayer with preroll — ready for instant playback.
    /// Must run on MainActor since AVPlayer is not thread-safe.
    /// Waits for .readyToPlay status before calling preroll (required by AVPlayer).
    ///
    /// Annulable (#9702) : un balayage rapide annule la tâche qui prépare un
    /// réel déjà dépassé ; les deux attentes (statut, préroulage) se libèrent
    /// aussitôt au lieu de tenir un décodeur jusqu'à cinq secondes.
    public func preloadVideoPlayer(url: URL) async -> AVPlayer {
        let thermalState = ProcessInfo.processInfo.thermalState
        let localFile = url.isFileURL ? nil : CacheCoordinator.videoLocalFileURL(for: url.absoluteString)
        let item = AVPlayerItem(url: Self.prerollSource(remote: url, localFile: localFile))
        // SOTA buffer/bitrate, thermal-aware (WWDC19 #422). Offscreen preroll is
        // always bitrate-capped; the cap tightens — and the decoded-ahead window
        // shrinks — once the device heats up. Forward buffer was 2.0s (now ~1s).
        item.preferredForwardBufferDuration = MediaThermalPolicy.forwardBufferDuration(thermalState: thermalState)
        item.preferredPeakBitRate = MediaThermalPolicy.preferredPeakBitRate(isVisible: false, thermalState: thermalState)
        let player = AVQueuePlayer(playerItem: item)
        player.automaticallyWaitsToMinimizeStalling = false

        // Wait for readyToPlay before prerolling — preroll crashes if called too early
        // Uses a timeout to avoid hanging the prefetch pipeline on bad URLs
        // KVO callback, timeout and cancellation all resume on main to avoid a
        // race on the resumed flag.
        if item.status != .readyToPlay, !Task.isCancelled {
            // Use a class wrapper for shared mutable state to satisfy Sendable
            final class ResumeState: @unchecked Sendable {
    // iOS 26.1 : deinit synthétisée ISOLÉE (SE-0466, isolation MainActor par
    // défaut) → double-free `pointer being freed was not allocated` (abrt)
    // au démontage hors d'une tâche (test XCTest synchrone, vue démontée).
    // Garde : MainActorDeinitSourceGuardTests / MeeshyUIDeinitSourceGuardTests.
    nonisolated deinit {}
                var resumed = false
                var observation: NSKeyValueObservation?
                var continuation: CheckedContinuation<Void, Never>?

                /// Sur le fil principal uniquement : une seule reprise, quel
                /// que soit le premier des trois signaux.
                func resumeOnce() {
                    guard !resumed else { return }
                    resumed = true
                    observation?.invalidate()
                    continuation?.resume()
                    continuation = nil
                }
            }
            let state = ResumeState()
            await withTaskCancellationHandler {
                await withCheckedContinuation { (continuation: CheckedContinuation<Void, Never>) in
                    state.continuation = continuation
                    state.observation = item.observe(\.status, options: [.new]) { item, _ in
                        guard item.status == .readyToPlay || item.status == .failed else { return }
                        DispatchQueue.main.async { state.resumeOnce() }
                    }
                    // Timeout after 5 seconds to avoid hanging on bad URLs
                    DispatchQueue.main.asyncAfter(deadline: .now() + 5) { state.resumeOnce() }
                }
            } onCancel: {
                Task { @MainActor in state.resumeOnce() }
            }
        }

        // Only preroll if player is ready (skip if failed) — and never for a
        // reel the user has already swiped past.
        guard player.currentItem?.status == .readyToPlay, !Task.isCancelled else { return player }

        let prerolling = PrerollHandle(player: player)
        await withTaskCancellationHandler {
            await withCheckedContinuation { continuation in
                player.preroll(atRate: 1.0) { _ in
                    continuation.resume()
                }
            }
        } onCancel: {
            // `cancelPendingPrerolls` rappelle la complétion avec `false` :
            // la continuation ci-dessus reprend, une seule fois.
            Task { @MainActor in prerolling.cancel() }
        }
        return player
    }

    // MARK: - Player Cache (FIFO ordered)

    /// Cache prerolled players by URL so they survive between prefetch and display.
    private var playerCache: [String: AVPlayer] = [:]
    /// Insertion order for FIFO eviction (Dictionary has no guaranteed order).
    private var playerCacheOrder: [String] = []
    /// SOTA short-video pool size: previous / current / next. Was 6 — six prerolled
    /// `AVQueuePlayer`s each holding decoded frames was a major CPU/GPU/thermal load.
    /// Les décodeurs matériels sont une ressource BORNÉE (#9702) : la fenêtre
    /// des réels s'étend jusqu'à N±10, mais seul le palier « décode » (N±1)
    /// tient un lecteur — le reste se prépare en octets, jamais en lecteurs.
    private let maxCachedPlayers = 3

    /// Preroll and cache a player for later retrieval via `cachedPlayer(for:)`.
    ///
    /// Une tâche ANNULÉE ne met rien en cache (#9702) : un lecteur préparé pour
    /// un réel déjà dépassé chasserait, par FIFO, le voisin qu'on va montrer.
    /// Un lecteur dont l'élément a ÉCHOUÉ n'y entre pas non plus — il
    /// occuperait une place de décodeur pour une image qui ne viendra pas.
    public func preloadAndCachePlayer(url: URL) async {
        let key = url.absoluteString
        guard playerCache[key] == nil, !Task.isCancelled else { return }
        let player = await preloadVideoPlayer(url: url)
        guard !Task.isCancelled,
              player.currentItem?.status != .failed,
              playerCache[key] == nil else {
            Self.release(player)
            return
        }
        insert(player, for: key)
    }

    /// **Rend au pool le lecteur qu'une surface quitte** (#9702), au lieu de le
    /// détruire : un retour en arrière le retrouve prêt — son élément, son
    /// fichier, ses images décodées — au lieu de repartir à froid. Même borne
    /// et même éviction FIFO que le préchauffage.
    public func returnPlayer(_ player: AVPlayer, for url: URL) {
        let key = url.absoluteString
        if let held = playerCache[key] {
            if held !== player { Self.release(player) }
            return
        }
        insert(player, for: key)
    }

    /// Libère le lecteur préparé pour `url`, s'il y en a un : son décodeur
    /// revient à un voisin plus proche (#9702).
    public func discardCachedPlayer(for url: URL) {
        guard let player = cachedPlayer(for: url) else { return }
        Self.release(player)
    }

    /// Retrieve a prerolled player from cache (removes it — AVPlayer cannot be shared).
    public func cachedPlayer(for url: URL) -> AVPlayer? {
        let key = url.absoluteString
        guard let player = playerCache[key] else { return nil }
        playerCache.removeValue(forKey: key)
        playerCacheOrder.removeAll { $0 == key }
        announcePoolChange()
        return player
    }

    /// **Le lecteur préparé pour `url`, LAISSÉ dans le pool** (#9837).
    ///
    /// Une page voisine du lecteur de réels y attache sa surface, en pause,
    /// pour que sa première image soit déjà à l'écran pendant le geste. Le
    /// moteur partagé l'adoptera ensuite par `cachedPlayer(for:)` — la même
    /// instance, donc la même surface, sans nouvelle image à attendre.
    public func peekCachedPlayer(for url: URL) -> AVPlayer? {
        playerCache[url.absoluteString]
    }

    /// Posté quand le pool gagne ou perd un lecteur : une surface qui affiche
    /// un lecteur préparé relit le pool au lieu de garder une référence morte.
    public static let poolDidChange = Notification.Name("StoryMediaLoader.poolDidChange")

    /// Clear all cached players.
    public func clearPlayerCache() {
        for (_, player) in playerCache {
            Self.release(player)
        }
        let hadPlayers = !playerCache.isEmpty
        playerCache.removeAll()
        playerCacheOrder.removeAll()
        if hadPlayers { announcePoolChange() }
    }

    private func insert(_ player: AVPlayer, for key: String) {
        playerCache[key] = player
        playerCacheOrder.append(key)
        // Enforce limit — evict oldest first (FIFO)
        while playerCache.count > maxCachedPlayers, !playerCacheOrder.isEmpty {
            let oldest = playerCacheOrder.removeFirst()
            if let evicted = playerCache.removeValue(forKey: oldest) {
                Self.release(evicted)
            }
        }
        announcePoolChange()
    }

    private func announcePoolChange() {
        NotificationCenter.default.post(name: Self.poolDidChange, object: self)
    }

    private static func release(_ player: AVPlayer) {
        player.pause()
        player.replaceCurrentItem(with: nil)
    }

    // MARK: - Cache Management

    public func clearThumbnailCache() {
        thumbnailCache.removeAllObjects()
    }
}

// MARK: - Preroll Handle

/// Porte le lecteur jusqu'au gestionnaire d'annulation, qui est `@Sendable` :
/// `cancelPendingPrerolls()` n'y est appelé que sur le MainActor.
private final class PrerollHandle: @unchecked Sendable {
    // iOS 26.1 : deinit synthétisée ISOLÉE (SE-0466, isolation MainActor par
    // défaut) → double-free `pointer being freed was not allocated` (abrt)
    // au démontage hors d'une tâche (test XCTest synchrone, vue démontée).
    // Garde : MainActorDeinitSourceGuardTests / MeeshyUIDeinitSourceGuardTests.
    nonisolated deinit {}
    private let player: AVPlayer

    init(player: AVPlayer) {
        self.player = player
    }

    func cancel() {
        player.cancelPendingPrerolls()
    }
}
