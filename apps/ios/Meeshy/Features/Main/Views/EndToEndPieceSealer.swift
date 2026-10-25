import Foundation
import MeeshyE2EE
import MeeshySDK
import os

/// Une pièce à chiffrer sur l'appareil : son fichier CLAIR, et ce que son
/// pointeur dira d'elle aux seuls appareils destinataires (#10789).
nonisolated struct EndToEndPieceSource: Sendable, Equatable {
    let localId: String
    let fileURL: URL
    let contentType: String
    let fileName: String?
    let kind: E2EEAttachmentPointer.Kind
    let width: Int?
    let height: Int?
    let durationMs: Int?
    let thumbHash: String?
    /// L'affiche d'une vidéo ou la vignette d'une photo, en JPEG : chiffrée à part, sous sa propre clé.
    let thumbnailJPEG: Data?
    /// La transcription faite SUR L'APPAREIL d'un vocal : elle voyage dans le pointeur, jamais au serveur.
    let transcript: E2EEAttachmentPointer.Transcript?

    static func kind(of attachment: MeeshyMessageAttachment) -> E2EEAttachmentPointer.Kind {
        switch attachment.type {
        case .image: .image
        case .video: .video
        case .audio: .audio
        case .file, .location: .file
        }
    }
}

/// Ce qui téléverse un blob DÉJÀ chiffré, et rend son identifiant serveur.
nonisolated protocol EndToEndBlobUploading: Sendable {
    func upload(blobAt fileURL: URL) async throws -> String
}

nonisolated struct TusEndToEndBlobUploader: EndToEndBlobUploading {
    let uploader: TusUploadManager
    let credential: MeeshyRequestCredential

    func upload(blobAt fileURL: URL) async throws -> String {
        try await uploader.uploadEndToEndBlob(fileURL: fileURL, credential: credential).id
    }
}

/// Chiffre et téléverse les pièces d'un message, rend leurs pointeurs.
nonisolated protocol EndToEndPieceSealing: Sendable {
    func seal(_ sources: [EndToEndPieceSource]) async throws -> [E2EEAttachmentPointer]
}

/// **Une pièce jointe d'une conversation chiffrée de bout en bout part
/// chiffrée, et seulement chiffrée** (#10789, spec § 7.1).
///
/// Pour chaque pièce : une clé neuve de 64 octets, le fichier chiffré EN FLUX
/// au format `client-v1` (`E2EEAttachmentCipher`) dans un fichier temporaire,
/// ce blob seul téléversé (`TusUploadManager.uploadEndToEndBlob` : aucun nom,
/// aucun type, aucune durée, aucun ThumbHash), puis effacé. L'affiche part
/// chiffrée à part, sous sa propre clé. Le clair reste sur cet appareil, dans
/// le dossier protégé (`EndToEndAttachmentVault.adopt`) : la bulle de
/// l'expéditeur ne retélécharge rien. Une erreur à n'importe quelle étape
/// arrête tout : aucun pointeur partiel, rien en clair.
///
/// `@concurrent` : le chiffrement d'une vidéo dure ; il ne tourne jamais sur le
/// fil principal.
nonisolated struct EndToEndPieceSealer: EndToEndPieceSealing {
    let uploader: any EndToEndBlobUploading
    let vault: any EndToEndAttachmentMaterializing
    var temporaryDirectory: URL = FileManager.default.temporaryDirectory

    @concurrent
    func seal(_ sources: [EndToEndPieceSource]) async throws -> [E2EEAttachmentPointer] {
        var pointers: [E2EEAttachmentPointer] = []
        for source in sources {
            pointers.append(try await seal(source))
        }
        return pointers
    }

    private func seal(_ source: EndToEndPieceSource) async throws -> E2EEAttachmentPointer {
        let blob = temporaryDirectory.appendingPathComponent("e2ee-out-\(UUID().uuidString)")
        defer { try? FileManager.default.removeItem(at: blob) }
        let secret = try E2EEAttachmentCipher.seal(fileAt: source.fileURL, to: blob)
        let blobId = try await uploader.upload(blobAt: blob)
        var thumbnail: E2EEAttachmentPointer.Thumbnail?
        if let jpeg = source.thumbnailJPEG { thumbnail = try await sealThumbnail(jpeg) }
        await vault.adopt(localFile: source.fileURL, secret: secret, contentType: source.contentType)
        return E2EEAttachmentPointer(
            id: blobId, key: secret.key, digest: secret.digest, size: secret.size,
            contentType: source.contentType, fileName: source.fileName, kind: source.kind,
            width: source.width, height: source.height, durationMs: source.durationMs,
            thumbHash: source.thumbHash, transcript: source.transcript, thumbnail: thumbnail
        )
    }

    private func sealThumbnail(_ jpeg: Data) async throws -> E2EEAttachmentPointer.Thumbnail {
        let sealed = try E2EEAttachmentCipher.seal(jpeg)
        let blob = temporaryDirectory.appendingPathComponent("e2ee-thumb-\(UUID().uuidString)")
        let clear = temporaryDirectory.appendingPathComponent("e2ee-thumb-clear-\(UUID().uuidString).jpg")
        defer { [blob, clear].forEach { try? FileManager.default.removeItem(at: $0) } }
        try sealed.blob.write(to: blob)
        let blobId = try await uploader.upload(blobAt: blob)
        try jpeg.write(to: clear, options: .completeFileProtection)
        await vault.adopt(localFile: clear, secret: sealed.secret, contentType: "image/jpeg")
        return E2EEAttachmentPointer.Thumbnail(
            id: blobId, key: sealed.secret.key, digest: sealed.secret.digest, size: sealed.secret.size, contentType: "image/jpeg"
        )
    }

    /// L'envoi réel : la porte TUS de l'app, au nom de la session. `nil` sans origine ni session.
    @MainActor
    static func live() -> EndToEndPieceSealer? {
        guard let baseURL = URL(string: MeeshyConfig.shared.serverOrigin),
              let credential = APIClient.shared.requestCredential else { return nil }
        return EndToEndPieceSealer(
            uploader: TusEndToEndBlobUploader(uploader: TusUploadManager(baseURL: baseURL), credential: credential),
            vault: EndToEndAttachmentVault.shared
        )
    }
}
