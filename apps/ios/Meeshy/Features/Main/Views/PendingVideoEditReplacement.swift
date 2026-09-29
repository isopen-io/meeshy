import Foundation
import MeeshySDK

/// **Une vidéo éditée REMPLACE la pièce jointe en attente** (#8443, #8523).
///
/// Le composeur d'un message et la citation d'un post ouvraient tous deux
/// `MeeshyVideoEditorView` puis jetaient son résultat : l'auteur rognait sa
/// vidéo, validait, et c'était l'originale qui partait — un contrôle qui ment
/// (loi 4). Même contrat que l'audio (`applyEditedAudio`) : remplacement par
/// id, jamais un second chip ; `didEdit == false` ne change rien, l'éditeur
/// rendant alors la source elle-même.
nonisolated enum PendingVideoEditReplacement {

    struct Outcome {
        let files: [String: URL]
        let attachments: [MessageAttachment]
        /// Le fichier devenu orphelin, à supprimer par l'appelant.
        let staleURL: URL?
    }

    static func apply(_ result: VideoEditResult,
                      to attachmentId: String,
                      files: [String: URL],
                      attachments: [MessageAttachment]) -> Outcome {
        guard result.didEdit, let ancienFichier = files[attachmentId] else {
            return Outcome(files: files, attachments: attachments, staleURL: nil)
        }
        var fichiers = files
        fichiers[attachmentId] = result.url
        let taille = (try? result.url.resourceValues(forKeys: [.fileSizeKey]).fileSize)
        let pieces = attachments.map { ancienne -> MessageAttachment in
            guard ancienne.id == attachmentId else { return ancienne }
            return MessageAttachment(
                id: attachmentId,
                fileName: result.url.lastPathComponent,
                originalName: result.url.lastPathComponent,
                mimeType: "video/mp4",
                fileSize: taille ?? ancienne.fileSize,
                fileUrl: result.url.absoluteString,
                width: ancienne.width,
                height: ancienne.height,
                duration: result.duration > 0 ? Int(result.duration * 1000) : ancienne.duration,
                thumbnailColor: ancienne.thumbnailColor
            )
        }
        return Outcome(files: fichiers, attachments: pieces,
                       staleURL: ancienFichier == result.url ? nil : ancienFichier)
    }
}
