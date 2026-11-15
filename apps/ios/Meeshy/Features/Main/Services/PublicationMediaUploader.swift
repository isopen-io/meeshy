import Foundation
import MeeshySDK
import os

/// Ce que la montée des médias d'une publication a obtenu, dans l'ordre de
/// composition : l'id et l'URL servis, la POSITION d'origine (#4756) et le
/// fichier local, qui ne s'efface qu'une fois le post créé.
nonisolated struct PublicationMediaUploads: Equatable, Sendable {
    var ids: [String] = []
    var urls: [String] = []
    var sourceIndexes: [Int] = []
    var localPaths: [String] = []
}

/// **La montée des médias d'une publication de la file durable** (#13414),
/// sortie de `dispatchCreatePost` pour que ses verdicts se testent sans réseau :
/// le téléverseur est une fermeture, la ligne outbox deux crochets.
nonisolated enum PublicationMediaUploader {
    typealias Send = @Sendable @concurrent (_ fileURL: URL, _ mimeType: String) async throws -> TusUploadResult

    struct Hooks: Sendable {
        /// #10321 — l'auteur a pu retirer la publication entre deux montées.
        let throwIfCancelled: @Sendable @concurrent () async throws -> Void
        /// #5830 — un succès est GRAVÉ sur la ligne, il ne se re-monte jamais.
        let recordUploaded: @Sendable @concurrent (UploadedPostMedia) async -> Void
    }

    private static let logger = MeeshyLog.logger(.outboxDispatcher, subsystem: .legacyIOS)

    static func uploadAll(
        storedPaths: [String],
        alreadyUploaded: [UploadedPostMedia],
        declaredMimeType: @Sendable (Int) -> String?,
        keepsLocation: Bool = OutgoingImageLocationSetting.stored(),
        defaults: UserDefaults = .standard,
        hooks: Hooks,
        send: Send
    ) async throws -> PublicationMediaUploads {
        let dejaMontes = Dictionary(
            alreadyUploaded.map { ($0.sourceIndex, $0) },
            uniquingKeysWith: { _, dernier in dernier }
        )
        var montes = PublicationMediaUploads()
        var premierEchecUpload: Error?
        var refusDefinitif: Error?
        var fichiersDisparus = 0
        for (index, stored) in storedPaths.enumerated() {
            let absolutePath = OfflineQueue.absoluteMediaPath(forStored: stored)
            if let acquis = dejaMontes[index] {
                montes.append(id: acquis.id, url: acquis.url, sourceIndex: index, localPath: absolutePath)
                logger.info("createPost: média \(index, privacy: .public) déjà monté, upload sauté")
                continue
            }
            try await hooks.throwIfCancelled()
            guard FileManager.default.fileExists(atPath: absolutePath) else {
                logger.error("Post media file missing on dispatch, path=\(stored, privacy: .public)")
                fichiersDisparus += 1
                continue
            }
            let fileURL = URL(fileURLWithPath: absolutePath)
            let mime = declaredMimeType(index)
                ?? MimeTypeResolver.mimeType(forExtension: fileURL.pathExtension)
            do {
                let tusResult = try await HEICUploadFallback.upload(
                    fileURL: fileURL, mimeType: mime, keepsLocation: keepsLocation,
                    defaults: defaults, servedMimeType: { $0.mimeType }, send: send
                )
                montes.append(id: tusResult.id, url: tusResult.fileUrl, sourceIndex: index, localPath: absolutePath)
                await hooks.recordUploaded(
                    UploadedPostMedia(sourceIndex: index, id: tusResult.id, url: tusResult.fileUrl)
                )
            } catch {
                if premierEchecUpload == nil { premierEchecUpload = error }
                if refusDefinitif == nil, isDefinitiveRefusal(error) { refusDefinitif = error }
                logger.error("Post media TUS upload failed (best-effort skip): \(error.localizedDescription, privacy: .public)")
            }
        }
        // La cause RÉELLE remonte telle quelle (#13414) : la file distingue un
        // jeton expiré ou une coupure (attente sans tentative brûlée) d'un
        // refus définitif (415 après repli ⇒ échec gardé sur l'appareil).
        // L'emballer en 503 faisait renvoyer cinq fois les mêmes octets.
        if let cause = refusDefinitif ?? premierEchecUpload {
            logger.error("createPost: média \(montes.ids.count, privacy: .public)/\(storedPaths.count, privacy: .public) monté — publication reportée : \(String(describing: cause), privacy: .public)")
            throw cause
        }
        guard !montes.ids.isEmpty else {
            throw NSError(
                domain: "OutboxDispatcher",
                code: 503,
                userInfo: [NSLocalizedDescriptionKey: fichiersDisparus > 0
                    ? "Les \(fichiersDisparus) fichier(s) de cette publication ont disparu du disque"
                    : "No media uploaded for offline post media dispatch"]
            )
        }
        if fichiersDisparus > 0 {
            logger.warning("createPost: publication amputée de \(fichiersDisparus, privacy: .public) fichier(s) disparu(s) — les octets n'existent plus, un rejeu ne les rendrait pas")
        }
        return montes
    }

    /// Au SUCCÈS seulement (#13415) : les fichiers montés quittent l'appareil,
    /// puis le dossier `pending-media/<cmid>` qu'ils laissent vide.
    static func discardUploadedFiles(_ paths: [String]) {
        for path in paths {
            do { try FileManager.default.removeItem(atPath: path) } catch {
                logger.warning("createPost: failed to remove temp file \(path, privacy: .public): \(error.localizedDescription, privacy: .public)")
            }
        }
        OfflineQueue.removeEmptyParentDirectories(of: paths)
    }

    /// Un refus que rejouer ne lèvera pas : le format (415 après repli JPEG)
    /// ou le droit d'un invité.
    static func isDefinitiveRefusal(_ error: Error) -> Bool {
        error is UnsupportedImageFormatRefusal || error is GuestAttachmentRefusal
    }
}

nonisolated extension PublicationMediaUploads {
    fileprivate mutating func append(id: String, url: String, sourceIndex: Int, localPath: String) {
        ids.append(id)
        urls.append(url)
        sourceIndexes.append(sourceIndex)
        localPaths.append(localPath)
    }
}
