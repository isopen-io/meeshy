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

    /// Save encoded image bytes to the Meeshy album — written AS-IS when Photos
    /// accepts the format (no `UIImage` decode, EXIF kept), re-encoded by ImageIO
    /// otherwise (`PhotoLibraryImageWrite`, #9685). Returns true on success.
    @discardableResult
    public func saveImage(_ data: Data) async -> Bool {
        switch PhotoLibraryImageWrite.decide(data: data) {
        case .rejected:
            return false
        case .asIs:
            return await createAsset(.photo, from: .data(data), label: "saveImage")
        case .transcode:
            guard let jpeg = PhotoLibraryImageWrite.jpegTranscoded(data: data) else { return false }
            return await createAsset(.photo, from: .data(jpeg), label: "saveImage")
        }
    }

    /// Save a UIImage to the Meeshy album. Réservé aux appelants qui n'ont QUE
    /// des pixels (capture d'écran) : un média encodé passe par `saveImage(_ data:)`
    /// ou `saveImageFile(at:)`, qui ne le décodent jamais.
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

    /// Save an image FILE to the Meeshy album by reference — Photos reads the file
    /// itself (`addResource(with:fileURL:options:)`), nothing is loaded in memory.
    ///
    /// - Parameter moveFile: `true` only for a temporary file the caller OWNS
    ///   (`shouldMoveFile`) — never for a cache file, which other views still read.
    @discardableResult
    public func saveImageFile(at fileURL: URL, moveFile: Bool = false) async -> Bool {
        // Les fichiers du cache sont nommés par empreinte, sans extension : le type
        // lu dans l'en-tête est remis à Photos, qui ne le devinerait pas du nom.
        let typeIdentifier = PhotoLibraryImageWrite.typeIdentifier(ofFileAt: fileURL)
        switch PhotoLibraryImageWrite.decide(typeIdentifier: typeIdentifier) {
        case .rejected:
            return false
        case .asIs:
            return await createAsset(.photo, from: .file(fileURL, move: moveFile),
                                     typeIdentifier: typeIdentifier, label: "saveImageFile")
        case .transcode:
            guard let jpeg = PhotoLibraryImageWrite.jpegTranscoded(fileAt: fileURL) else { return false }
            let saved = await createAsset(.photo, from: .data(jpeg), label: "saveImageFile")
            if saved, moveFile { try? FileManager.default.removeItem(at: fileURL) }
            return saved
        }
    }

    /// Save encoded image bytes AS-IS to the Meeshy album — no `UIImage`
    /// round-trip, so a PNG keeps its metadata chunks (the export card's
    /// « created with Meeshy » stamp) and its exact pixels.
    @discardableResult
    public func saveImageFile(_ data: Data, fileName: String) async -> Bool {
        await createAsset(.photo, from: .data(data), fileName: fileName, label: "saveImageFile")
    }

    /// Save a video from a local file URL to the Meeshy album, by reference.
    ///
    /// - Parameter moveFile: `true` only for a temporary file the caller OWNS.
    @discardableResult
    public func saveVideo(at fileURL: URL, moveFile: Bool = false) async -> Bool {
        await createAsset(.video, from: .file(fileURL, move: moveFile), label: "saveVideo")
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
                if let onDisk = CacheCoordinator.imageLocalFileURL(for: urlString) {
                    return await saveImageFile(at: onDisk)
                }
                let data = try await CacheCoordinator.shared.images.data(for: urlString)
                return await saveImage(data)
            }
        } catch {
            return false
        }
    }

    // MARK: - Authorization

    /// Demande l'accès `.addOnly` (écriture seule). Délègue à
    /// `DevicePermissions` — source unique des demandes TCC, dont le callback
    /// est confiné `nonisolated` (cf. `DevicePermissions.swift`).
    public func requestAuthorization() async -> Bool {
        await DevicePermissions.requestPhotoLibraryAdd().isUsable
    }

    public var isAuthorized: Bool {
        MediaPermissionState.photoLibraryAdd.isUsable
    }

    /// État courant, sans jamais prompter — permet aux appelants de distinguer
    /// « pas encore demandé » d'un refus définitif (qui, lui, mérite un renvoi
    /// vers les Réglages plutôt qu'un nouveau prompt qui n'apparaîtra jamais).
    public var authorizationState: MediaPermissionState {
        MediaPermissionState.photoLibraryAdd
    }

    // MARK: - Asset creation

    private enum ResourceSource {
        case data(Data)
        case file(URL, move: Bool)
    }

    /// Le SEUL site d'écriture par ressource : `PHAssetCreationRequest.addResource`,
    /// octets tels quels ou fichier par référence — jamais de décodage.
    private func createAsset(_ type: PHAssetResourceType,
                             from source: ResourceSource,
                             fileName: String? = nil,
                             typeIdentifier: String? = nil,
                             label: String) async -> Bool {
        guard await requestAuthorization() else {
            photoLog.error("\(label, privacy: .public) denied: photo library authorization refused")
            return false
        }
        // Album résolu HORS de `performChanges` (cf. `saveImage(_ image:)`).
        let album = self.fetchOrCreateAlbum()
        return await withCheckedContinuation { continuation in
            PHPhotoLibrary.shared().performChanges {
                let options = PHAssetResourceCreationOptions()
                if let fileName { options.originalFilename = fileName }
                if let typeIdentifier { options.uniformTypeIdentifier = typeIdentifier }
                let request = PHAssetCreationRequest.forAsset()
                switch source {
                case .data(let data):
                    request.addResource(with: type, data: data, options: options)
                case .file(let url, let move):
                    options.shouldMoveFile = move
                    request.addResource(with: type, fileURL: url, options: options)
                }
                if let album,
                   let placeholder = request.placeholderForCreatedAsset {
                    let albumChangeRequest = PHAssetCollectionChangeRequest(for: album)
                    albumChangeRequest?.addAssets([placeholder] as NSFastEnumeration)
                }
            } completionHandler: { success, error in
                // Observabilité : un échec d'écriture (format refusé, disque plein)
                // doit laisser une trace.
                if !success {
                    photoLog.error("\(label, privacy: .public) performChanges failed: \(error?.localizedDescription ?? "unknown", privacy: .public)")
                }
                continuation.resume(returning: success)
            }
        }
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
