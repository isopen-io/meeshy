import Foundation
import MeeshySDK

/// Copie DURABLE des pièces jointes d'un brouillon de message.
///
/// Les fichiers du composer (`pendingMediaFiles`) vivent dans
/// `FileManager.temporaryDirectory` (AttachmentPreparationService) — iOS
/// peut les purger à sa discrétion. Pour qu'un brouillon avec pièces
/// jointes survive au kill (D-message, miroir du D1 story), les fichiers
/// sont copiés ici, sous `Documents/meeshy_message_draft_media/<userId>/
/// <conversationId>/`, au passage en background ; la restauration tolère
/// les fichiers disparus (skip silencieux, miroir StoryDraftStore) et la
/// purge intervient à l'envoi réussi comme au clear du brouillon.
enum MessageDraftMediaStore {
    static let rootFolderName = "meeshy_message_draft_media"

    static func directory(userId: String, conversationId: String) -> URL {
        let documents = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
        return documents
            .appendingPathComponent(rootFolderName, isDirectory: true)
            .appendingPathComponent(sanitize(userId), isDirectory: true)
            .appendingPathComponent(sanitize(conversationId), isDirectory: true)
    }

    /// Copie les fichiers pending dans le dossier draft et retourne les
    /// références persistables. Le dossier est RECONSTRUIT à chaque appel
    /// (la vérité = l'état courant du composer : une pièce retirée du tray
    /// ne doit pas ressusciter au restore). Un fichier source illisible est
    /// sauté (best-effort, jamais bloquant).
    @discardableResult
    static func persist(
        attachments: [MeeshyMessageAttachment],
        files: [String: URL],
        userId: String,
        conversationId: String
    ) -> [DraftAttachmentRef] {
        let dir = directory(userId: userId, conversationId: conversationId)
        try? FileManager.default.removeItem(at: dir)
        guard !attachments.isEmpty else { return [] }
        do {
            try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        } catch {
            return []
        }
        return attachments.compactMap { attachment in
            guard let source = files[attachment.id] else { return nil }
            let ext = source.pathExtension
            let storedName = sanitize(attachment.id) + (ext.isEmpty ? "" : ".\(ext)")
            let destination = dir.appendingPathComponent(storedName)
            do {
                try FileManager.default.copyItem(at: source, to: destination)
            } catch {
                return nil
            }
            return DraftAttachmentRef(
                attachmentId: attachment.id,
                storedFileName: storedName,
                originalName: attachment.originalName,
                mimeType: attachment.mimeType,
                fileSize: attachment.fileSize,
                duration: attachment.duration,
                width: attachment.width,
                height: attachment.height,
                thumbnailColor: attachment.thumbnailColor
            )
        }
    }

    /// Restaure les pièces jointes survivantes d'un brouillon : reconstruit
    /// l'attachment du tray + la map fichier. Un fichier disparu (purge OS,
    /// suppression) est sauté silencieusement — le texte du brouillon reste
    /// intact, seule la pièce manquante disparaît.
    static func restore(
        refs: [DraftAttachmentRef],
        userId: String,
        conversationId: String
    ) -> (attachments: [MeeshyMessageAttachment], files: [String: URL]) {
        let dir = directory(userId: userId, conversationId: conversationId)
        var attachments: [MeeshyMessageAttachment] = []
        var files: [String: URL] = [:]
        for ref in refs {
            let url = dir.appendingPathComponent(ref.storedFileName)
            guard FileManager.default.fileExists(atPath: url.path) else { continue }
            attachments.append(MeeshyMessageAttachment(
                id: ref.attachmentId,
                fileName: ref.storedFileName,
                originalName: ref.originalName,
                mimeType: ref.mimeType,
                fileSize: ref.fileSize,
                width: ref.width,
                height: ref.height,
                duration: ref.duration,
                thumbnailColor: ref.thumbnailColor
            ))
            files[ref.attachmentId] = url
        }
        return (attachments, files)
    }

    /// Purge le dossier draft de la conversation — à l'envoi réussi et au
    /// clear explicite du brouillon.
    static func purge(userId: String, conversationId: String) {
        try? FileManager.default.removeItem(
            at: directory(userId: userId, conversationId: conversationId)
        )
    }

    private static func sanitize(_ component: String) -> String {
        component
            .replacingOccurrences(of: "/", with: "-")
            .replacingOccurrences(of: ":", with: "-")
    }
}
