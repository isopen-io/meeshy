import Foundation
import MeeshySDK

/// **Ce que la bulle montre d'une pièce jointe chiffrée de bout en bout**
/// (#10789). Le serveur ne sert que des blobs opaques (`application/octet-
/// stream`, sans nom ni durée) : ce que la bulle rend vient du POINTEUR
/// déchiffré sur cet appareil — type réel, nom, taille exacte, dimensions,
/// durée, ThumbHash — et désigne le clair là où `EndToEndAttachmentVault` le
/// range (`file://`, dossier protégé). Les lecteurs (image, vidéo, audio,
/// document) lisent ce fichier directement ; tant qu'il n'est pas là, le
/// ThumbHash tient la place, sans indicateur d'attente.
///
/// La clé et le condensat ne passent JAMAIS sur la pièce affichée : ils restent
/// dans `e2ee.sqlite`, avec le pointeur. Une pièce d'un format que cet appareil
/// ne sait pas lire (`scheme` inconnu) est montrée comme un fichier, sans adresse.
nonisolated enum EndToEndAttachmentOverlay {

    static func attachments(
        for pointers: [E2EEAttachmentPointer],
        messageId: String,
        uploadedBy: String,
        createdAt: Date,
        servedBlobIds: Set<String>,
        paths: EndToEndMediaPaths
    ) -> [MeeshyMessageAttachment] {
        pointers.map { pointer in
            guard pointer.isReadable, Set(pointer.blobIds).isSubset(of: servedBlobIds) else {
                return MeeshyMessageAttachment(
                    id: pointer.id, messageId: messageId, mimeType: "application/octet-stream",
                    uploadedBy: uploadedBy, createdAt: createdAt, isEncrypted: true, encryptionMode: E2EEWire.mode
                )
            }
            let file = paths.file(for: pointer).absoluteString
            let name = pointer.fileName ?? ""
            return MeeshyMessageAttachment(
                id: pointer.id, messageId: messageId,
                fileName: name, originalName: name,
                mimeType: pointer.contentType, fileSize: pointer.size,
                fileUrl: file,
                width: pointer.width, height: pointer.height,
                thumbnailUrl: paths.thumbnail(of: pointer)?.absoluteString ?? (pointer.kind == .image ? file : nil),
                thumbHash: pointer.thumbHash,
                duration: pointer.durationMs,
                uploadedBy: uploadedBy, createdAt: createdAt,
                isEncrypted: true, encryptionMode: E2EEWire.mode,
                transcription: pointer.transcript.map { transcript in
                    MeeshyMessageAttachment.EmbeddedTranscription(
                        text: transcript.text, language: transcript.language ?? "", durationMs: pointer.durationMs
                    )
                }
            )
        }
    }

    /// Une vue unique déjà ouverte, un éphémère échu : ses pièces ne se remontrent pas.
    static func isSpent(_ message: MeeshyMessage, now: Date = Date()) -> Bool {
        message.viewOnceOpenedAt != nil || message.expiresAt.map { $0 <= now } == true
    }

    /// Le type du message, lu sur ses pièces : le serveur, qui ne voit que des
    /// blobs, le sert toujours en « fichier ».
    static func messageType(of pointers: [E2EEAttachmentPointer]) -> MeeshyMessage.MessageType {
        let kinds = Set(pointers.map(\.kind))
        guard kinds.count == 1, let kind = kinds.first else { return .file }
        switch kind {
        case .image: return .image
        case .video: return .video
        case .audio: return .audio
        case .file: return .file
        }
    }

    /// Ce qu'une pièce chiffrée de bout en bout laisse dans la base des messages
    /// de l'app, qui n'est pas scellée (#12952) : sa forme OPAQUE, celle que le
    /// serveur sert — ni nom, ni type, ni taille exacte, ni durée, ni adresse du
    /// clair. Ses réactions, publiques sur le serveur, restent. Les écritures de
    /// `attachmentsJson` que le fil fait APRÈS l'adoption (réactions, retrait
    /// d'une pièce) passent par ici ; la bulle optimiste de l'expéditeur, écrite
    /// avant, relève de #12952.
    static func sealedForStorage(_ attachments: [MeeshyMessageAttachment]) -> [MeeshyMessageAttachment] {
        attachments.map { attachment in
            guard attachment.encryptionMode == E2EEWire.mode else { return attachment }
            return MeeshyMessageAttachment(
                id: attachment.id, messageId: attachment.messageId, mimeType: "application/octet-stream",
                uploadedBy: attachment.uploadedBy, createdAt: attachment.createdAt,
                isEncrypted: true, encryptionMode: E2EEWire.mode,
                reactionSummary: attachment.reactionSummary, currentUserReactions: attachment.currentUserReactions
            )
        }
    }
}
