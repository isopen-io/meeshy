import Foundation
import Photos
import UIKit
import os

private let photoLog = Logger(subsystem: "com.meeshy.sdk", category: "photo-library")

/// Saves images and videos to a custom "Meeshy" album in the user's photo library.
public final class PhotoLibraryManager: @unchecked Sendable {
    public static let shared = PhotoLibraryManager()
    private let albumName = "Meeshy"

    private init() {}

    // MARK: - Public API

    /// Save an image (from Data) to the Meeshy album. Returns true on success.
    @discardableResult
    public func saveImage(_ data: Data) async -> Bool {
        guard let image = UIImage(data: data) else { return false }
        return await saveImage(image)
    }

    /// Save a UIImage to the Meeshy album.
    @discardableResult
    public func saveImage(_ image: UIImage) async -> Bool {
        guard await requestAuthorization() else {
            photoLog.error("saveImage denied: photo library authorization refused")
            return false
        }

        // Resolve the album OUTSIDE the `performChanges` block. `fetchOrCreateAlbum`
        // calls `performChangesAndWait`, which dispatch_syncs onto the same
        // `com.apple.PHPhotoLibrary.changes` queue that `performChanges` enqueues
        // onto. Re-entering that queue from within the closure triggers
        // `__DISPATCH_WAIT_FOR_QUEUE__` (EXC_BREAKPOINT) — the user-visible
        // "app crashes on save image" bug.
        let album = self.fetchOrCreateAlbum()

        return await withCheckedContinuation { continuation in
            PHPhotoLibrary.shared().performChanges {
                let request = PHAssetChangeRequest.creationRequestForAsset(from: image)
                if let album,
                   let placeholder = request.placeholderForCreatedAsset {
                    let albumChangeRequest = PHAssetCollectionChangeRequest(for: album)
                    albumChangeRequest?.addAssets([placeholder] as NSFastEnumeration)
                }
            } completionHandler: { success, error in
                if !success {
                    photoLog.error("saveImage performChanges failed: \(error?.localizedDescription ?? "unknown", privacy: .public)")
                }
                continuation.resume(returning: success)
            }
        }
    }

    /// Save a video from a local file URL to the Meeshy album.
    @discardableResult
    public func saveVideo(at fileURL: URL) async -> Bool {
        guard await requestAuthorization() else {
            photoLog.error("saveVideo denied: photo library authorization refused")
            return false
        }

        // Same dispatch deadlock fix as `saveImage`: resolve the album before
        // entering `performChanges` so we never dispatch_sync onto our own
        // serial queue.
        let album = self.fetchOrCreateAlbum()

        return await withCheckedContinuation { continuation in
            PHPhotoLibrary.shared().performChanges {
                let request = PHAssetChangeRequest.creationRequestForAssetFromVideo(atFileURL: fileURL)
                if let album,
                   let placeholder = request?.placeholderForCreatedAsset {
                    let albumChangeRequest = PHAssetCollectionChangeRequest(for: album)
                    albumChangeRequest?.addAssets([placeholder] as NSFastEnumeration)
                }
            } completionHandler: { success, error in
                // Observabilité : ce chemin était totalement silencieux — un
                // échec d'écriture (format refusé, disque plein) ne laissait
                // aucune trace, rendant les régressions invisibles.
                if !success {
                    photoLog.error("saveVideo performChanges failed: \(error?.localizedDescription ?? "unknown", privacy: .public)")
                }
                continuation.resume(returning: success)
            }
        }
    }

    /// Save media from a URL string. Downloads via cache, routes to the image
    /// or video save path based on the caller-supplied `kind` — replaces the
    /// previous substring sniffing (`.contains("video")` / `.contains(".mp4")`),
    /// which could misclassify any URL whose path merely contained one of
    /// those substrings. `AttachmentKind` is the single source of truth for
    /// media family (mirrors `MediaSaveRequest.kind` in the app's unified
    /// save flow, `MediaSaveCoordinator.swift`).
    @discardableResult
    public func saveFromURL(_ urlString: String, kind: AttachmentKind) async -> Bool {
        do {
            if kind == .video {
                let localURL = try await CacheCoordinator.shared.video.localFileURLOrThrow(for: urlString)
                return await saveVideo(at: localURL)
            } else {
                let data = try await CacheCoordinator.shared.images.data(for: urlString)
                return await saveImage(data)
            }
        } catch {
            return false
        }
    }

    // MARK: - Authorization

    public func requestAuthorization() async -> Bool {
        let status = PHPhotoLibrary.authorizationStatus(for: .addOnly)
        switch status {
        case .authorized, .limited:
            return true
        case .notDetermined:
            return await withCheckedContinuation { continuation in
                PHPhotoLibrary.requestAuthorization(for: .addOnly) { newStatus in
                    continuation.resume(returning: newStatus == .authorized || newStatus == .limited)
                }
            }
        default:
            return false
        }
    }

    public var isAuthorized: Bool {
        let status = PHPhotoLibrary.authorizationStatus(for: .addOnly)
        return status == .authorized || status == .limited
    }

    // MARK: - Album Management

    private func fetchOrCreateAlbum() -> PHAssetCollection? {
        let fetchOptions = PHFetchOptions()
        fetchOptions.predicate = NSPredicate(format: "title = %@", albumName)
        let collections = PHAssetCollection.fetchAssetCollections(with: .album, subtype: .any, options: fetchOptions)

        if let existing = collections.firstObject {
            return existing
        }

        var placeholder: PHObjectPlaceholder?
        do {
            try PHPhotoLibrary.shared().performChangesAndWait {
                let request = PHAssetCollectionChangeRequest.creationRequestForAssetCollection(withTitle: self.albumName)
                placeholder = request.placeholderForCreatedAssetCollection
            }
        } catch {
            return nil
        }

        guard let localIdentifier = placeholder?.localIdentifier else { return nil }
        return PHAssetCollection.fetchAssetCollections(
            withLocalIdentifiers: [localIdentifier],
            options: nil
        ).firstObject
    }
}
