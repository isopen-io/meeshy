import UIKit
import Combine
import MeeshySDK
import MeeshyUI

nonisolated struct MediaGroupUploadItem: Sendable, Equatable {
    let attachmentId: String
    let isAudio: Bool
    let isImage: Bool
    let fileURL: URL
    let mimeType: String
    let thumbHash: String?
    let transcription: TusUploadTranscriptionMetadata?
    let capturedInApp: Bool
}

extension MediaGroupUploadItem {

    /// Les pièces qui vont réellement monter : une pièce sans fichier est écartée,
    /// l'ordre du composeur est conservé, un groupe audio part toujours en `audio/mp4`.
    static func items(
        for send: OutgoingMediaGroup,
        mediaFiles: [String: URL],
        thumbnails: [String: UIImage],
        transcriptions: [String: MessageTranscription]
    ) -> [MediaGroupUploadItem] {
        let isAudioGroup = send.group.kind == .audio
        return send.group.attachments.compactMap { attachment in
            guard let fileURL = mediaFiles[attachment.id] else { return nil }
            return MediaGroupUploadItem(
                attachmentId: attachment.id,
                isAudio: isAudioGroup,
                isImage: !isAudioGroup && attachment.type == .image,
                fileURL: fileURL,
                mimeType: isAudioGroup ? "audio/mp4" : attachment.mimeType,
                thumbHash: thumbnails[attachment.id]?.toThumbHash(),
                transcription: transcriptions[attachment.id]?.tusUploadMetadata,
                capturedInApp: attachment.capturedInApp
            )
        }
    }
}

struct UploadedMediaGroup {
    let ids: [String]
    let attachments: [MeeshyMessageAttachment]
}

@MainActor
protocol MediaGroupUploading {
    func upload(
        _ send: OutgoingMediaGroup,
        items: [MediaGroupUploadItem],
        currentUserId: String,
        didPromote: @MainActor (_ localAttachmentId: String, _ serverAttachmentId: String) -> Void
    ) async throws -> UploadedMediaGroup
}

struct TusMediaGroupUploader: MediaGroupUploading {
    let uploader: TusUploadManager
    let credential: MeeshyRequestCredential
    let thumbnails: [String: UIImage]

    /// Upload PARALLÈLE borné par l'acteur (`maxConcurrent`). Seules des valeurs `Sendable`
    /// franchissent la frontière de tâche ; l'amorçage des caches, qui touche `UIImage` et
    /// `CacheCoordinator`, reste SÉQUENTIEL en aval et ne tient qu'un fichier en mémoire.
    /// La première erreur sort du groupe : l'appelant renvoie le groupe entier vers l'outbox.
    func upload(
        _ send: OutgoingMediaGroup,
        items: [MediaGroupUploadItem],
        currentUserId: String,
        didPromote: @MainActor (String, String) -> Void
    ) async throws -> UploadedMediaGroup {
        let uploader = self.uploader
        let credential = self.credential
        let plannedBytes = items.reduce(Int64(0)) { $0 + TusMediaGroupUploader.fileSize(of: $1.fileURL) }
        await uploader.setExpectedBatch(totalFiles: items.count, totalBytes: plannedBytes)

        let results = try await OrderedParallelUpload.run(items) { item in
            try await uploader.uploadFile(
                fileURL: item.fileURL, mimeType: item.mimeType, credential: credential,
                thumbHash: item.thumbHash, transcription: item.transcription,
                capturedInApp: item.capturedInApp
            )
        }

        var attachments: [MeeshyMessageAttachment] = []
        for (item, result) in zip(items, results) {
            await seedCaches(for: item, result: result)
            attachments.append(PreparationTracking.promoted(
                result.toMessageAttachment(uploadedBy: currentUserId), capturedInApp: item.capturedInApp))
            didPromote(item.attachmentId, result.id)
        }
        return UploadedMediaGroup(ids: results.map(\.id), attachments: attachments)
    }

    private static func fileSize(of url: URL) -> Int64 {
        let size = (try? FileManager.default.attributesOfItem(atPath: url.path))?[.size] as? Int64
        return size ?? 0
    }

    /// Le fichier est DÉJÀ dans le cache typé, copié par `TusUploadManager` sous la clé de
    /// rendu : aucun octet n'est relu. L'aperçu de la bulle optimiste change seulement de clé.
    private func seedCaches(for item: MediaGroupUploadItem, result: TusUploadResult) async {
        let renderKey = TusUploadManager.renderCacheKey(forFileUrl: result.fileUrl)
        if item.isAudio {
            await CacheCoordinator.shared.audio.seed(copyingLocalFile: item.fileURL, for: item.fileURL.absoluteString)
        }
        if item.isImage, let preview = DiskCacheStore.cachedImage(for: item.fileURL.absoluteString) {
            DiskCacheStore.cacheImageForPreview(preview, key: renderKey)
        }
        guard !item.isAudio,
              let thumbUrl = result.thumbnailUrl,
              let thumbImage = thumbnails[item.attachmentId],
              let thumbData = await ImageCompressor.jpegOffMain(thumbImage, quality: 0.8) else { return }
        let thumbKey = MeeshyConfig.resolveMediaURL(thumbUrl)?.absoluteString ?? thumbUrl
        await CacheCoordinator.shared.thumbnails.store(thumbData, for: thumbKey)
        DiskCacheStore.cacheImageForPreview(thumbImage, key: thumbKey)
    }
}
