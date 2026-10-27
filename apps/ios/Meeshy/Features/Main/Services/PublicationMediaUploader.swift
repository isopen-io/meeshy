import Foundation
import MeeshySDK
import os

/// Ce que la montée des médias d'une publication a obtenu, dans l'ordre de
/// composition : l'id et l'URL servis, la POSITION d'origine (#4756) et le
/// fichier local, qui ne s'efface qu'une fois le post créé.
struct PublicationMediaUploads: Equatable, Sendable {
    var ids: [String] = []
    var urls: [String] = []
    var sourceIndexes: [Int] = []
    var localPaths: [String] = []
}

/// **La montée des médias d'une publication de la file durable** (#13414),
/// sortie de `dispatchCreatePost` pour que ses verdicts se testent sans réseau :
/// le téléverseur est une fermeture, la ligne outbox deux crochets.
nonisolated enum PublicationMediaUploader {
    typealias Send = @Sendable (_ fileURL: URL, _ mimeType: String) async throws -> TusUploadResult

    struct Hooks: Sendable {
        /// #10321 — l'auteur a pu retirer la publication entre deux montées.
        let throwIfCancelled: @Sendable () async throws -> Void
        /// #5830 — un succès est GRAVÉ sur la ligne, il ne se re-monte jamais.
        let recordUploaded: @Sendable (UploadedPostMedia) async -> Void
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
                let tusResult = try await send(fileURL, mime)
                montes.append(id: tusResult.id, url: tusResult.fileUrl, sourceIndex: index, localPath: absolutePath)
                await hooks.recordUploaded(
                    UploadedPostMedia(sourceIndex: index, id: tusResult.id, url: tusResult.fileUrl)
                )
            } catch {
                if premierEchecUpload == nil { premierEchecUpload = error }
                logger.error("Post media TUS upload failed (best-effort skip): \(error.localizedDescription, privacy: .public)")
            }
        }
        if let cause = premierEchecUpload {
            throw NSError(
                domain: "OutboxDispatcher",
                code: 503,
                userInfo: [
                    NSLocalizedDescriptionKey: "Média \(montes.ids.count)/\(storedPaths.count) monté — publication reportée : \(cause.localizedDescription)",
                    NSUnderlyingErrorKey: cause
                ]
            )
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
}

private extension PublicationMediaUploads {
    mutating func append(id: String, url: String, sourceIndex: Int, localPath: String) {
        ids.append(id)
        urls.append(url)
        sourceIndexes.append(sourceIndex)
        localPaths.append(localPath)
    }
}
