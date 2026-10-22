import Foundation
import UIKit
import os

extension CacheCoordinator {
    // MARK: - Synchronous Media Cache Access (nonisolated — no actor hop)

    /// Check video disk cache synchronously. Returns local file URL if cached.
    nonisolated public static func videoLocalFileURL(for urlString: String) -> URL? {
        shared.video.cachedFileURL(for: urlString)
    }

    /// Check audio disk cache synchronously. Returns local file URL if cached.
    nonisolated public static func audioLocalFileURL(for urlString: String) -> URL? {
        shared.audio.cachedFileURL(for: urlString)
    }

    /// Variante async de `videoLocalFileURL` qui garantit un retour `file://`.
    /// 1) Retourne immédiatement si l'URL est déjà file:// ou si le cache disk est chaud.
    /// 2) Sinon, déclenche un fetch via `video.data(for:)` puis retourne l'URL locale produite.
    /// 3) Retourne `nil` si tout échoue (réseau down, fichier corrompu, etc.).
    ///
    /// Garantit que le caller peut passer le résultat à `AVPlayer(url:)` /
    /// `AVAudioFile(forReading:)` sans risque de rejet HTTPS.
    nonisolated public static func videoLocalFileURLAwait(for remote: URL) async -> URL? {
        if remote.isFileURL { return remote }
        if let cached = videoLocalFileURL(for: remote.absoluteString) { return cached }
        do {
            _ = try await shared.video.data(for: remote.absoluteString)
        } catch {
            // Le retour `nil` ci-dessous suffit à l'appelant, mais sans trace
            // un échec réseau est indiscernable d'un fichier absent.
            Logger.cache.error("Video prefetch failed before local-URL resolution: \(error.localizedDescription, privacy: .public)")
        }
        return videoLocalFileURL(for: remote.absoluteString)
    }

    /// Idem pour l'audio. Utilisé par le hotfix audio reader (cf. spec
    /// `2026-05-20-stories-audio-hotfix-design.md` § 5.7).
    nonisolated public static func audioLocalFileURLAwait(for remote: URL) async -> URL? {
        if remote.isFileURL { return remote }
        if let cached = audioLocalFileURL(for: remote.absoluteString) { return cached }
        do {
            _ = try await shared.audio.data(for: remote.absoluteString)
        } catch {
            // Le retour `nil` ci-dessous suffit à l'appelant, mais sans trace
            // un échec réseau est indiscernable d'un fichier absent.
            Logger.cache.error("Audio prefetch failed before local-URL resolution: \(error.localizedDescription, privacy: .public)")
        }
        return audioLocalFileURL(for: remote.absoluteString)
    }

    /// Idem pour l'image. Utilisé par l'export MP4 de story, qui doit disposer
    /// d'un `file://` : son compositor décode le fond frame par frame, sur le
    /// main actor et de façon SYNCHRONE — il ne peut donc rien télécharger
    /// lui-même. `StoryExporter` résout tous les visuels par ici AVANT de
    /// composer.
    nonisolated public static func imageLocalFileURLAwait(for remote: URL) async -> URL? {
        if remote.isFileURL { return remote }
        if let cached = imageLocalFileURL(for: remote.absoluteString) { return cached }
        do {
            _ = try await shared.images.data(for: remote.absoluteString)
        } catch {
            Logger.cache.error("Image prefetch failed before local-URL resolution: \(error.localizedDescription, privacy: .public)")
        }
        return imageLocalFileURL(for: remote.absoluteString)
    }

    /// Check image disk cache synchronously. Returns cached UIImage if available.
    nonisolated public static func cachedImage(for urlString: String) -> UIImage? {
        DiskCacheStore.cachedImage(for: urlString)
    }

    /// Synchronous warm : NSCache hit OR disk-to-NSCache decode + return.
    /// Used by `CachedAsyncImage.init` to peuple the image at cell mount time
    /// for cold-start conversations — avoids the thumbHash → image flash that
    /// otherwise occurs when NSCache has been evicted but the disk file is
    /// still present.
    nonisolated public static func warmedImage(for urlString: String) -> UIImage? {
        shared.images.warmedImage(for: urlString)
    }

    /// Check image disk cache synchronously. Returns local file URL if cached
    /// on disk (even when the decoded NSCache entry has been evicted). Used by
    /// the rendering pipeline to bypass the media policy gate for media that
    /// is already on device — a disk hit is a zero-network read.
    nonisolated public static func imageLocalFileURL(for urlString: String) -> URL? {
        shared.images.cachedFileURL(for: urlString)
    }

    /// Synchronous local file URL for a `thumbnails`-store key — e.g. a story
    /// cover composite rendered at publish (`StoryCoverThumbnail.cacheKey`). Lets
    /// a View (MainActor) read the cover without an actor hop. Mirrors
    /// `imageLocalFileURL` / `videoLocalFileURL`.
    nonisolated public static func thumbnailLocalFileURL(for key: String) -> URL? {
        shared.thumbnails.cachedFileURL(for: key)
    }

    /// Synchronous warm for the `thumbnails` store — NSCache hit OR
    /// disk-to-NSCache decode + return. Mirrors `warmedImage` (`images`
    /// store) for callers that need a `thumbnails`-store key resolved
    /// without an actor hop — e.g. a video poster persisted under
    /// `thumb:<url>`, read back synchronously at page mount so the first
    /// `body` renders it directly, no placeholder flash.
    nonisolated public static func warmedThumbnail(for key: String) -> UIImage? {
        shared.thumbnails.warmedImage(for: key)
    }

    /// Configures memory caps for the image pipeline. Call once at app launch.
    ///
    /// Sets:
    /// - The decoded UIImage cache (NSCache in `DiskCacheStore.images`) at the
    ///   given byte limit, used by `CachedAsyncImage` and `ProgressiveCachedImage`.
    /// - The decoded CGImage cache (`DecodedImageCache.shared`) proportionally —
    ///   we leave 5/6 of the budget for UIImages (more frequent) and 1/6 for
    ///   CGImages (used by full-screen viewers).
    ///
    /// - Parameter budgetBytes: Total budget for both decoded image caches combined.
    ///   Recommended: 60 MB on iPhone, 100 MB on iPad.
    nonisolated public static func configureImageMemory(budgetBytes: Int) {
        let uiImageCap = (budgetBytes * 5) / 6
        let cgImageCap = budgetBytes / 6
        DiskCacheStore.configureImageCache(memoryCostLimitBytes: uiImageCap)
        DecodedImageCache.shared.setTotalCostLimit(cgImageCap)
    }
}
