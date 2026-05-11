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
    public static let shared = StoryMediaLoader()

    private init() {
        // React to system memory pressure — drop the thumbnail cache and tear
        // down all prerolled players. Without this, a sustained tour through
        // many stories accumulated up to 6 prerolled `AVQueuePlayer` instances
        // plus 100 thumbnails (~30 MB) until the next manual `clear*` call.
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

    /// Create an AVPlayer with preroll — ready for instant playback.
    /// Must run on MainActor since AVPlayer is not thread-safe.
    /// Waits for .readyToPlay status before calling preroll (required by AVPlayer).
    public func preloadVideoPlayer(url: URL) async -> AVPlayer {
        let item = AVPlayerItem(url: url)
        item.preferredForwardBufferDuration = 2.0
        item.preferredPeakBitRate = 1_500_000 // 1.5 Mbps — fast start, good quality
        let player = AVQueuePlayer(playerItem: item)
        player.automaticallyWaitsToMinimizeStalling = false

        // Wait for readyToPlay before prerolling — preroll crashes if called too early
        // Uses a timeout to avoid hanging the prefetch pipeline on bad URLs
        // Both KVO callback and timeout dispatch to main to avoid race on resumed flag
        if item.status != .readyToPlay {
            await withCheckedContinuation { (continuation: CheckedContinuation<Void, Never>) in
                // Use a class wrapper for shared mutable state to satisfy Sendable
                final class ResumeState: @unchecked Sendable {
                    var resumed = false
                    var observation: NSKeyValueObservation?
                }
                let state = ResumeState()

                state.observation = item.observe(\.status, options: [.new]) { item, _ in
                    guard item.status == .readyToPlay || item.status == .failed else { return }
                    DispatchQueue.main.async {
                        guard !state.resumed else { return }
                        state.resumed = true
                        state.observation?.invalidate()
                        continuation.resume()
                    }
                }
                // Timeout after 5 seconds to avoid hanging on bad URLs
                DispatchQueue.main.asyncAfter(deadline: .now() + 5) {
                    state.observation?.invalidate()
                    guard !state.resumed else { return }
                    state.resumed = true
                    continuation.resume()
                }
            }
        }

        // Only preroll if player is ready (skip if failed)
        guard player.currentItem?.status == .readyToPlay else { return player }

        await withCheckedContinuation { continuation in
            player.preroll(atRate: 1.0) { _ in
                continuation.resume()
            }
        }
        return player
    }

    // MARK: - Player Cache (FIFO ordered)

    /// Cache prerolled players by URL so they survive between prefetch and display.
    private var playerCache: [String: AVPlayer] = [:]
    /// Insertion order for FIFO eviction (Dictionary has no guaranteed order).
    private var playerCacheOrder: [String] = []
    private let maxCachedPlayers = 6

    /// Preroll and cache a player for later retrieval via `cachedPlayer(for:)`.
    public func preloadAndCachePlayer(url: URL) async {
        let key = url.absoluteString
        guard playerCache[key] == nil else { return }
        let player = await preloadVideoPlayer(url: url)
        playerCache[key] = player
        playerCacheOrder.append(key)
        // Enforce limit — evict oldest first (FIFO)
        while playerCache.count > maxCachedPlayers, !playerCacheOrder.isEmpty {
            let oldest = playerCacheOrder.removeFirst()
            playerCache[oldest]?.pause()
            playerCache[oldest]?.replaceCurrentItem(with: nil)
            playerCache.removeValue(forKey: oldest)
        }
    }

    /// Retrieve a prerolled player from cache (removes it — AVPlayer cannot be shared).
    public func cachedPlayer(for url: URL) -> AVPlayer? {
        let key = url.absoluteString
        guard let player = playerCache[key] else { return nil }
        playerCache.removeValue(forKey: key)
        playerCacheOrder.removeAll { $0 == key }
        return player
    }

    /// Clear all cached players.
    public func clearPlayerCache() {
        for (_, player) in playerCache {
            player.pause()
            player.replaceCurrentItem(with: nil)
        }
        playerCache.removeAll()
        playerCacheOrder.removeAll()
    }

    // MARK: - Cache Management

    public func clearThumbnailCache() {
        thumbnailCache.removeAllObjects()
    }
}
