import Foundation
import Photos
import UIKit

/// Saves images and videos to a custom "Meeshy" album in the user's photo library.
final class PhotoLibraryManager {
    static let shared = PhotoLibraryManager()
    private let albumName = "Meeshy"

    private init() {}

    // MARK: - Public API

    /// Save an image (from Data) to the Meeshy album. Returns true on success.
    @discardableResult
    func saveImage(_ data: Data) async -> Bool {
        guard let image = UIImage(data: data) else { return false }
        return await saveImage(image)
    }

    /// Save a UIImage to the Meeshy album.
    @discardableResult
    func saveImage(_ image: UIImage) async -> Bool {
        guard await requestAuthorization() else { return false }

        return await withCheckedContinuation { continuation in
            PHPhotoLibrary.shared().performChanges {
                let request = PHAssetChangeRequest.creationRequestForAsset(from: image)
                if let album = self.fetchOrCreateAlbum(),
                   let placeholder = request.placeholderForCreatedAsset {
                    let albumChangeRequest = PHAssetCollectionChangeRequest(for: album)
                    albumChangeRequest?.addAssets([placeholder] as NSFastEnumeration)
                }
            } completionHandler: { success, _ in
                continuation.resume(returning: success)
            }
        }
    }

    /// Save a video from a local file URL to the Meeshy album.
    @discardableResult
    func saveVideo(at fileURL: URL) async -> Bool {
        guard await requestAuthorization() else { return false }

        return await withCheckedContinuation { continuation in
            PHPhotoLibrary.shared().performChanges {
                let request = PHAssetChangeRequest.creationRequestForAssetFromVideo(atFileURL: fileURL)
                if let album = self.fetchOrCreateAlbum(),
                   let placeholder = request?.placeholderForCreatedAsset {
                    let albumChangeRequest = PHAssetCollectionChangeRequest(for: album)
                    albumChangeRequest?.addAssets([placeholder] as NSFastEnumeration)
                }
            } completionHandler: { success, _ in
                continuation.resume(returning: success)
            }
        }
    }

    /// Save media from a URL string. Downloads via cache, determines type from extension/MIME.
    @discardableResult
    func saveFromURL(_ urlString: String) async -> Bool {
        let lower = urlString.lowercased()
        let isVideo = lower.contains(".mp4") || lower.contains(".mov") || lower.contains(".m4v") || lower.contains("video")

        do {
            if isVideo {
                let localURL = try await MediaCacheManager.shared.localFileURL(for: urlString)
                return await saveVideo(at: localURL)
            } else {
                let data = try await MediaCacheManager.shared.data(for: urlString)
                return await saveImage(data)
            }
        } catch {
            return false
        }
    }

    // MARK: - Authorization

    func requestAuthorization() async -> Bool {
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

    var isAuthorized: Bool {
        let status = PHPhotoLibrary.authorizationStatus(for: .addOnly)
        return status == .authorized || status == .limited
    }

    // MARK: - Album Management

    private func fetchOrCreateAlbum() -> PHAssetCollection? {
        // Try to find existing album
        let fetchOptions = PHFetchOptions()
        fetchOptions.predicate = NSPredicate(format: "title = %@", albumName)
        let collections = PHAssetCollection.fetchAssetCollections(with: .album, subtype: .any, options: fetchOptions)

        if let existing = collections.firstObject {
            return existing
        }

        // Create album synchronously (called within performChanges block context)
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
