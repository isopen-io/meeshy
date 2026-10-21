import Foundation
import Photos
import UIKit
import UniformTypeIdentifiers
import os

private let photoLog = MeeshyLog.logger(.photoLibrary, subsystem: .legacySDK)

/// Saves images and videos to a custom "Meeshy" album in the user's photo library.
///
/// **Chaque écriture passe par le dédoublonnage** (#10370) : l'empreinte du
/// contenu est cherchée dans l'album avant d'écrire (`PhotoLibraryDeduplicator`),
/// et un média déjà présent n'y entre pas une seconde fois. Les méthodes `add…`
/// disent ce qui s'est passé (`PhotoLibrarySaveOutcome`) ; les méthodes `save…`
/// historiques rendent `true` dès que le média est dans l'album.
public final class PhotoLibraryManager: @unchecked Sendable {
    public static let shared = PhotoLibraryManager()
    static let albumName = "Meeshy"

    private let registry: PhotoLibraryMediaRegistering
    private let deduplicator: PhotoLibraryDeduplicator

    private init() {
        let registry = PhotoLibraryMediaRegistry.shared
        self.registry = registry
        self.deduplicator = PhotoLibraryDeduplicator(registry: registry,
                                                     probe: PhotosAlbumProbe(albumName: Self.albumName),
                                                     creator: PhotosAssetCreator(albumName: Self.albumName))
    }

    // MARK: - Public API (résultat détaillé)

    /// Octets d'image encodés — écrits TELS QUELS quand Photos accepte le format
    /// (aucun décodage `UIImage`, EXIF conservé), ré-encodés par ImageIO sinon (#9685).
    ///
    /// - Parameters:
    ///   - signature: l'empreinte de la SOURCE quand ce qui part en diffère (copie
    ///     marquée, ré-encodage) ; `nil` = l'empreinte des octets eux-mêmes.
    ///   - alias: l'identifiant stable de la pièce jointe, pour `isRecordedInAlbum(alias:)`.
    public func addImage(_ data: Data,
                         signature: PhotoLibraryMediaSignature? = nil,
                         alias: String? = nil) async -> PhotoLibrarySaveOutcome {
        let signature = signature ?? PhotoLibraryMediaSignature(data: data)
        switch PhotoLibraryImageWrite.decide(data: data) {
        case .rejected:
            return .failed
        case .asIs:
            let type = PhotoLibraryImageWrite.typeIdentifier(of: data)
            return await add(.photo, .data(data), signature: signature, alias: alias,
                             baseName: nil, pathExtension: Self.fileExtension(forType: type), label: "addImage")
        case .transcode:
            guard let jpeg = PhotoLibraryImageWrite.jpegTranscoded(data: data) else { return .failed }
            return await add(.photo, .data(jpeg), signature: signature, alias: alias,
                             baseName: nil, pathExtension: "jpg", label: "addImage")
        }
    }

    /// Un FICHIER image, par référence — Photos le lit lui-même, rien n'est chargé.
    ///
    /// - Parameter moveFile: `true` seulement pour un temporaire que l'appelant
    ///   POSSÈDE — jamais pour un fichier du cache, que d'autres vues lisent.
    public func addImageFile(at fileURL: URL,
                             moveFile: Bool = false,
                             signature: PhotoLibraryMediaSignature? = nil,
                             alias: String? = nil) async -> PhotoLibrarySaveOutcome {
        // Les fichiers du cache sont nommés par empreinte, sans extension : le type
        // lu dans l'en-tête est remis à Photos, qui ne le devinerait pas du nom.
        let typeIdentifier = PhotoLibraryImageWrite.typeIdentifier(ofFileAt: fileURL)
        let outcome: PhotoLibrarySaveOutcome
        switch PhotoLibraryImageWrite.decide(typeIdentifier: typeIdentifier) {
        case .rejected:
            return .failed
        case .asIs:
            guard let signature = await Self.signature(signature, ofFileAt: fileURL) else { return .failed }
            outcome = await add(.photo, .file(fileURL, move: moveFile), signature: signature, alias: alias,
                                baseName: nil, pathExtension: Self.fileExtension(forType: typeIdentifier, fallback: fileURL),
                                typeIdentifier: typeIdentifier, label: "addImageFile")
        case .transcode:
            guard let signature = await Self.signature(signature, ofFileAt: fileURL),
                  let jpeg = PhotoLibraryImageWrite.jpegTranscoded(fileAt: fileURL) else { return .failed }
            outcome = await add(.photo, .data(jpeg), signature: signature, alias: alias,
                                baseName: nil, pathExtension: "jpg", label: "addImageFile")
            if outcome == .saved, moveFile { try? FileManager.default.removeItem(at: fileURL) }
        }
        if outcome == .alreadyPresent, moveFile { try? FileManager.default.removeItem(at: fileURL) }
        return outcome
    }

    /// Des octets encodés écrits TELS QUELS sous un nom lisible — un PNG garde ses
    /// métadonnées (la marque « créé avec Meeshy » de la carte d'export).
    public func addImageFile(_ data: Data,
                             fileName: String,
                             signature: PhotoLibraryMediaSignature? = nil,
                             alias: String? = nil) async -> PhotoLibrarySaveOutcome {
        await add(.photo, .data(data), signature: signature ?? PhotoLibraryMediaSignature(data: data), alias: alias,
                  baseName: fileName, pathExtension: (fileName as NSString).pathExtension, label: "addImageFile")
    }

    /// Une vidéo locale, par référence.
    ///
    /// - Parameter moveFile: `true` seulement pour un temporaire que l'appelant POSSÈDE.
    public func addVideo(at fileURL: URL,
                         moveFile: Bool = false,
                         signature: PhotoLibraryMediaSignature? = nil,
                         alias: String? = nil) async -> PhotoLibrarySaveOutcome {
        guard let signature = await Self.signature(signature, ofFileAt: fileURL) else { return .failed }
        let ext = fileURL.pathExtension.isEmpty ? "mp4" : fileURL.pathExtension
        let outcome = await add(.video, .file(fileURL, move: moveFile), signature: signature, alias: alias,
                                baseName: nil, pathExtension: ext, label: "addVideo")
        if outcome == .alreadyPresent, moveFile { try? FileManager.default.removeItem(at: fileURL) }
        return outcome
    }

    /// Des pixels seuls (capture d'écran) : réservé aux appelants qui n'ont rien
    /// d'encodé. L'empreinte est celle de leur encodage PNG.
    public func addImage(_ image: UIImage) async -> PhotoLibrarySaveOutcome {
        guard let png = image.pngData() else { return .failed }
        return await add(.photo, .pixels(image), signature: PhotoLibraryMediaSignature(data: png), alias: nil,
                         baseName: nil, pathExtension: "png", label: "addImage(pixels)")
    }

    /// **Lecture SYNCHRONE du registre, sans toucher la photothèque** : la pièce
    /// désignée par cet alias a-t-elle été enregistrée dans l'album ? Assez rapide
    /// pour décider d'une icône au premier rendu.
    public func isRecordedInAlbum(alias: String) -> Bool {
        guard !alias.isEmpty, let signature = registry.signature(forAlias: alias) else { return false }
        return registry.localIdentifier(for: signature) != nil
    }

    /// L'album contient-il déjà ce média ? Sans rien écrire — un appelant qui
    /// préparerait une copie coûteuse (marque, ré-encodage) le demande d'abord.
    public func contains(_ signature: PhotoLibraryMediaSignature, alias: String? = nil) async -> Bool {
        if let alias, !alias.isEmpty { registry.noteAlias(alias, for: signature) }
        return await deduplicator.isAlreadyInAlbum(signature)
    }

    // MARK: - Public API (booléenne, historique)

    @discardableResult
    public func saveImage(_ data: Data) async -> Bool {
        await addImage(data).isInAlbum
    }

    /// Réservé aux appelants qui n'ont QUE des pixels (capture d'écran) : un média
    /// encodé passe par `saveImage(_ data:)` ou `saveImageFile(at:)`.
    @discardableResult
    public func saveImage(_ image: UIImage) async -> Bool {
        await addImage(image).isInAlbum
    }

    @discardableResult
    public func saveImageFile(at fileURL: URL, moveFile: Bool = false) async -> Bool {
        await addImageFile(at: fileURL, moveFile: moveFile).isInAlbum
    }

    @discardableResult
    public func saveImageFile(_ data: Data, fileName: String) async -> Bool {
        await addImageFile(data, fileName: fileName).isInAlbum
    }

    @discardableResult
    public func saveVideo(at fileURL: URL, moveFile: Bool = false) async -> Bool {
        await addVideo(at: fileURL, moveFile: moveFile).isInAlbum
    }

    /// Save media from a URL string. Downloads via cache, routes to the image
    /// or video save path based on the caller-supplied `kind` (`AttachmentKind`
    /// is the single source of truth for media family).
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
    /// « pas encore demandé » d'un refus définitif.
    public var authorizationState: MediaPermissionState {
        MediaPermissionState.photoLibraryAdd
    }

    // MARK: - Écriture dédoublonnée

    private func add(_ kind: PhotoLibraryAssetRequest.Kind,
                     _ source: PhotoLibraryAssetRequest.Source,
                     signature: PhotoLibraryMediaSignature,
                     alias: String?,
                     baseName: String?,
                     pathExtension: String,
                     typeIdentifier: String? = nil,
                     label: String) async -> PhotoLibrarySaveOutcome {
        guard await requestAuthorization() else {
            photoLog.error("\(label, privacy: .public) denied: photo library authorization refused")
            return .failed
        }
        let request = PhotoLibraryAssetRequest(
            kind: kind, source: source,
            originalFileName: signature.markedFileName(base: baseName, pathExtension: pathExtension),
            typeIdentifier: typeIdentifier)
        let outcome = await deduplicator.save(request, signature: signature, alias: alias)
        if outcome == .alreadyPresent {
            photoLog.info("\(label, privacy: .public) skipped: already in the Meeshy album")
        }
        return outcome
    }

    private static func signature(_ given: PhotoLibraryMediaSignature?,
                                  ofFileAt url: URL) async -> PhotoLibraryMediaSignature? {
        if let given { return given }
        do {
            return try await PhotoLibraryMediaSignature.of(fileAt: url)
        } catch {
            photoLog.error("signature unreadable: \(error.localizedDescription, privacy: .public)")
            return nil
        }
    }

    private static func fileExtension(forType typeIdentifier: String?, fallback url: URL? = nil) -> String {
        if let typeIdentifier, let ext = UTType(typeIdentifier)?.preferredFilenameExtension { return ext }
        if let ext = url?.pathExtension, !ext.isEmpty { return ext }
        return "jpg"
    }
}

// MARK: - Photos

/// La lecture de l'album, seulement quand l'accès le permet. En accès « ajout
/// seulement », rien n'est lisible ; en accès limité, la sélection ne montre pas
/// tout — une absence n'y prouve rien, mais les marques visibles comptent.
struct PhotosAlbumProbe: PhotoLibraryAssetProbing {
    let albumName: String

    func presence(ofAsset localIdentifier: String) -> PhotoLibraryAssetPresence {
        guard PHPhotoLibrary.authorizationStatus(for: .readWrite) == .authorized else { return .unknown }
        let found = PHAsset.fetchAssets(withLocalIdentifiers: [localIdentifier], options: nil)
        return found.count > 0 ? .present : .absent
    }

    func albumMarks() -> [PhotoLibraryMediaSignature: String]? {
        let status = PHPhotoLibrary.authorizationStatus(for: .readWrite)
        guard status == .authorized || status == .limited else { return nil }
        guard let album = PhotosAlbum.fetch(named: albumName) else { return [:] }
        var marks: [PhotoLibraryMediaSignature: String] = [:]
        PHAsset.fetchAssets(in: album, options: nil).enumerateObjects { asset, _, _ in
            let signature = PHAssetResource.assetResources(for: asset).lazy
                .compactMap { PhotoLibraryMediaSignature.parse(markedFileName: $0.originalFilename) }
                .first
            if let signature { marks[signature] = asset.localIdentifier }
        }
        return marks
    }
}

/// Le SEUL site d'écriture : `PHAssetCreationRequest.addResource`, octets tels
/// quels ou fichier par référence — jamais de décodage. Le nom d'origine porte la
/// marque de l'empreinte.
struct PhotosAssetCreator: PhotoLibraryAssetCreating {
    let albumName: String

    func create(_ request: PhotoLibraryAssetRequest) async -> String? {
        // Album résolu HORS de `performChanges` : `fetchOrCreate` appelle
        // `performChangesAndWait`, qui se bloquerait sur la file de `performChanges`
        // (EXC_BREAKPOINT `__DISPATCH_WAIT_FOR_QUEUE__`).
        let album = PhotosAlbum.isReachable(readWriteStatus: PHPhotoLibrary.authorizationStatus(for: .readWrite))
            ? PhotosAlbum.fetchOrCreate(named: albumName)
            : nil
        let identifier = PhotosCreatedIdentifier()
        return await withCheckedContinuation { continuation in
            PHPhotoLibrary.shared().performChanges {
                let placeholder = Self.enqueue(request)
                identifier.value = placeholder?.localIdentifier
                if let album, let placeholder {
                    PHAssetCollectionChangeRequest(for: album)?.addAssets([placeholder] as NSFastEnumeration)
                }
            } completionHandler: { success, error in
                if !success {
                    photoLog.error("performChanges failed: \(error?.localizedDescription ?? "unknown", privacy: .public)")
                }
                continuation.resume(returning: success ? identifier.value : nil)
            }
        }
    }

    private static func enqueue(_ request: PhotoLibraryAssetRequest) -> PHObjectPlaceholder? {
        if case .pixels(let image) = request.source {
            return PHAssetChangeRequest.creationRequestForAsset(from: image).placeholderForCreatedAsset
        }
        let options = PHAssetResourceCreationOptions()
        options.originalFilename = request.originalFileName
        if let typeIdentifier = request.typeIdentifier { options.uniformTypeIdentifier = typeIdentifier }
        let creation = PHAssetCreationRequest.forAsset()
        let type: PHAssetResourceType = request.kind == .video ? .video : .photo
        switch request.source {
        case .data(let data):
            creation.addResource(with: type, data: data, options: options)
        case .file(let url, let move):
            options.shouldMoveFile = move
            creation.addResource(with: type, fileURL: url, options: options)
        case .pixels:
            break
        }
        return creation.placeholderForCreatedAsset
    }
}

/// L'identifiant posé dans le bloc `performChanges` et lu dans sa complétion.
private final class PhotosCreatedIdentifier: @unchecked Sendable {
    var value: String?
}

enum PhotosAlbum {
    /// **L'album n'est touché qu'avec l'accès en LECTURE** (#10805). Le chercher
    /// ou le créer lit la photothèque : en accès « ajout seul », iOS ferait monter
    /// une seconde alerte réclamant l'accès complet pour le même geste. Le média
    /// part alors dans la photothèque, hors album.
    static func isReachable(readWriteStatus: PHAuthorizationStatus) -> Bool {
        readWriteStatus == .authorized || readWriteStatus == .limited
    }

    static func fetch(named name: String) -> PHAssetCollection? {
        let options = PHFetchOptions()
        options.predicate = NSPredicate(format: "title = %@", name)
        return PHAssetCollection.fetchAssetCollections(with: .album, subtype: .any, options: options).firstObject
    }

    static func fetchOrCreate(named name: String) -> PHAssetCollection? {
        if let existing = fetch(named: name) { return existing }
        var placeholder: PHObjectPlaceholder?
        do {
            try PHPhotoLibrary.shared().performChangesAndWait {
                placeholder = PHAssetCollectionChangeRequest
                    .creationRequestForAssetCollection(withTitle: name)
                    .placeholderForCreatedAssetCollection
            }
        } catch {
            return nil
        }
        guard let localIdentifier = placeholder?.localIdentifier else { return nil }
        return PHAssetCollection.fetchAssetCollections(withLocalIdentifiers: [localIdentifier], options: nil).firstObject
    }
}
