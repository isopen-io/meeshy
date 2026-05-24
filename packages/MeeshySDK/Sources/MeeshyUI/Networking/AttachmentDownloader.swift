import Foundation
import SwiftUI
import Combine
import UIKit
import MeeshySDK

// MARK: - Attachment Downloader (real byte-level progress via URLSession.bytes)
@MainActor
public final class AttachmentDownloader: ObservableObject {
    @Published public var isCached = false
    @Published public var isDownloading = false
    @Published public var downloadedBytes: Int64 = 0
    @Published public var totalBytes: Int64 = 0

    public var progress: Double {
        guard totalBytes > 0 else { return 0 }
        return min(Double(downloadedBytes) / Double(totalBytes), 1.0)
    }

    private var downloadTask: Task<Void, Never>?

    public init() {}

    /// Resolves whether the attachment's media is already available locally.
    /// Routes to the correct typed cache store via `attachment.type` and
    /// short-circuits on `file://` — local optimistic media is, by definition,
    /// already on disk and never needs a download badge. See Sprint 3 RC3.2.
    public func checkCache(_ attachment: MeeshyMessageAttachment) async {
        let urlString = attachment.fileUrl
        if urlString.hasPrefix("file://") {
            if FileManager.default.fileExists(atPath: URL(string: urlString)?.path ?? "") {
                isCached = true
            }
            return
        }
        let resolved = MeeshyConfig.resolveMediaURL(urlString)?.absoluteString ?? urlString
        let cached: Bool
        switch attachment.type {
        case .audio: cached = await CacheCoordinator.shared.audio.isCached(resolved)
        case .video: cached = await CacheCoordinator.shared.video.isCached(resolved)
        case .image: cached = await CacheCoordinator.shared.images.isCached(resolved)
        case .file, .location: cached = false
        }
        if cached { isCached = true }
    }

    public func start(attachment: MeeshyMessageAttachment, onShare: ((URL) -> Void)?) {
        let fileUrl = attachment.fileUrl
        guard !fileUrl.isEmpty else { return }
        let store: CacheStoreKind
        switch attachment.type {
        case .audio: store = .audio
        case .image: store = .image
        case .video: store = .video
        case .file, .location:
            // No typed cache for file/location — manual download paths handle these.
            return
        }
        startDownloadFlow(
            urlString: fileUrl,
            expectedSize: Int64(attachment.fileSize),
            cacheStore: store
        )
    }

    /// Download a translated audio (HTTPS URL distinct from the original
    /// attachment). The translated audio's file size is not yet exposed by
    /// the backend (spec §7 follow-up) — `fileSize == 0` is tolerated and
    /// the response's Content-Length header is used as the total during DL.
    /// Note: if the network shifts wifi -> cellular while downloading, the
    /// download continues. The policy gates triggering, not continuation
    /// (spec §14.2, consistent with WhatsApp / Telegram).
    public func startTranslatedAudio(url: String, fileSize: Int64) {
        guard !url.isEmpty else { return }
        startDownloadFlow(
            urlString: url,
            expectedSize: fileSize,
            cacheStore: .audio
        )
    }

    public enum CacheStoreKind {
        case audio, image, video
    }

    /// Shared download flow: streams URLSession.bytes, publishes progress,
    /// persists into the typed cache under the resolved canonical key.
    private func startDownloadFlow(
        urlString: String,
        expectedSize: Int64,
        cacheStore: CacheStoreKind
    ) {
        guard !isDownloading, !isCached else { return }
        isDownloading = true
        downloadedBytes = 0
        totalBytes = expectedSize
        HapticFeedback.light()

        downloadTask = Task.detached { [weak self] in
            do {
                guard let url = MeeshyConfig.resolveMediaURL(urlString) else { throw URLError(.badURL) }

                let (asyncBytes, response) = try await URLSession.shared.bytes(from: url)

                guard let http = response as? HTTPURLResponse,
                      (200...299).contains(http.statusCode) else {
                    throw URLError(.badServerResponse)
                }

                let expectedLength = http.expectedContentLength
                if expectedLength > 0 {
                    await MainActor.run { [weak self] in self?.totalBytes = expectedLength }
                }

                var data = Data()
                if expectedLength > 0 {
                    data.reserveCapacity(Int(expectedLength))
                }

                var buffer = [UInt8]()
                buffer.reserveCapacity(16384)

                for try await byte in asyncBytes {
                    guard !Task.isCancelled else { return }
                    buffer.append(byte)

                    if buffer.count >= 16384 {
                        data.append(contentsOf: buffer)
                        buffer.removeAll(keepingCapacity: true)
                        let current = Int64(data.count)
                        await MainActor.run { [weak self] in self?.downloadedBytes = current }
                    }
                }

                guard !Task.isCancelled else { return }

                if !buffer.isEmpty {
                    data.append(contentsOf: buffer)
                }

                // Seed under the exact key the renderer resolves to, in the
                // store that matches the media type — a download triggered by
                // the badge must never need to re-fetch on the next render.
                let resolvedKey = MeeshyConfig.resolveMediaURL(urlString)?.absoluteString ?? urlString
                switch cacheStore {
                case .audio:
                    await CacheCoordinator.shared.audio.store(data, for: resolvedKey)
                case .image:
                    await CacheCoordinator.shared.images.store(data, for: resolvedKey)
                    if let image = UIImage(data: data) {
                        DiskCacheStore.cacheImageForPreview(image, key: resolvedKey)
                    }
                case .video:
                    await CacheCoordinator.shared.video.store(data, for: resolvedKey)
                }

                let finalSize = Int64(data.count)
                await MainActor.run { [weak self] in
                    self?.downloadedBytes = finalSize
                    self?.totalBytes = finalSize
                    self?.isDownloading = false
                    self?.isCached = true
                    HapticFeedback.success()
                }
            } catch {
                guard !Task.isCancelled else { return }
                await MainActor.run { [weak self] in
                    self?.isDownloading = false
                    HapticFeedback.error()
                }
            }
        }
    }

    public func cancel() {
        downloadTask?.cancel()
        downloadTask = nil
        isDownloading = false
        downloadedBytes = 0
        HapticFeedback.light()
    }

    public static func fmt(_ bytes: Int64) -> String {
        let kb = Double(bytes) / 1024
        if kb < 1 { return "\(bytes)B" }
        if kb < 1024 { return String(format: "%.0fKB", kb) }
        return String(format: "%.1fMB", kb / 1024)
    }
}
