import UIKit
import AVFoundation
import PhotosUI
import SwiftUI
import ImageIO

// MARK: - Story Media Loader

/// Centralized media loading with hardware-accelerated downsampling (ImageIO)
/// and async video thumbnail extraction. All heavy work runs off main thread.
@MainActor
public final class StoryMediaLoader {
    public static let shared = StoryMediaLoader()
    private init() {}

    private let thumbnailCache = NSCache<NSString, UIImage>()

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

        let localURL = url
        let dim = maxDimension
        let thumbnail = await Task.detached(priority: .userInitiated) {
            StoryMediaLoader.extractThumbnail(url: localURL, maxDimension: dim)
        }.value

        if let thumbnail {
            thumbnailCache.setObject(thumbnail, forKey: cacheKey)
        }
        return thumbnail
    }

    /// Synchronous thumbnail extraction (runs on background thread via Task.detached).
    nonisolated private static func extractThumbnail(url: URL, maxDimension: CGFloat) -> UIImage? {
        let asset = AVURLAsset(url: url)
        let generator = AVAssetImageGenerator(asset: asset)
        generator.appliesPreferredTrackTransform = true
        generator.maximumSize = CGSize(width: maxDimension, height: maxDimension)

        guard let cgImage = try? generator.copyCGImage(at: .zero, actualTime: nil) else {
            return nil
        }
        return UIImage(cgImage: cgImage)
    }

    // MARK: - Preload Video Player

    /// Create an AVPlayer with preroll — ready for instant playback.
    /// Must run on MainActor since AVPlayer is not thread-safe.
    /// Waits for .readyToPlay status before calling preroll (required by AVPlayer).
    public func preloadVideoPlayer(url: URL) async -> AVPlayer {
        let player = AVPlayer(url: url)
        player.currentItem?.preferredForwardBufferDuration = 2.0

        // Wait for readyToPlay before prerolling — preroll crashes if called too early
        if let item = player.currentItem, item.status != .readyToPlay {
            await withCheckedContinuation { (continuation: CheckedContinuation<Void, Never>) in
                var observer: NSKeyValueObservation?
                observer = item.observe(\.status, options: [.new]) { item, _ in
                    if item.status == .readyToPlay || item.status == .failed {
                        observer?.invalidate()
                        observer = nil
                        continuation.resume()
                    }
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

    // MARK: - Player Cache

    /// Cache prerolled players by URL so they survive between prefetch and display.
    private var playerCache: [String: AVPlayer] = [:]
    private let maxCachedPlayers = 3

    /// Preroll and cache a player for later retrieval via `cachedPlayer(for:)`.
    public func preloadAndCachePlayer(url: URL) async {
        let key = url.absoluteString
        guard playerCache[key] == nil else { return }
        let player = await preloadVideoPlayer(url: url)
        playerCache[key] = player
        // Enforce limit — evict oldest (first inserted)
        if playerCache.count > maxCachedPlayers {
            let keysToRemove = Array(playerCache.keys.prefix(playerCache.count - maxCachedPlayers))
            for k in keysToRemove {
                playerCache[k]?.pause()
                playerCache[k]?.replaceCurrentItem(with: nil)
                playerCache.removeValue(forKey: k)
            }
        }
    }

    /// Retrieve a prerolled player from cache (removes it — single use).
    public func cachedPlayer(for url: URL) -> AVPlayer? {
        let key = url.absoluteString
        guard let player = playerCache[key] else { return nil }
        playerCache.removeValue(forKey: key)
        return player
    }

    /// Clear all cached players.
    public func clearPlayerCache() {
        for (_, player) in playerCache {
            player.pause()
            player.replaceCurrentItem(with: nil)
        }
        playerCache.removeAll()
    }

    // MARK: - Cache Management

    public func clearThumbnailCache() {
        thumbnailCache.removeAllObjects()
    }
}
