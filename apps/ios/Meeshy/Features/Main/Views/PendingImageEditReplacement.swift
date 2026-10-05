import Foundation
import CoreGraphics
import MeeshySDK

/// **Une image retouchée dans la scène REMPLACE la pièce en attente** (#9170).
///
/// La citation d'un post ouvrait l'éditeur d'image plein écran ; elle ouvre
/// désormais la scène, comme ses vidéos (`PendingVideoEditReplacement`) et les
/// pièces d'un commentaire. Le fichier rendu est déjà ÉCRIT et vérifié
/// (`ConversationImageRetouche.writeEdited`) : remplacement par id, jamais une
/// seconde pièce, et l'ancien fichier n'est rendu à purger qu'ensuite.
enum PendingImageEditReplacement {

    struct Outcome {
        let files: [String: URL]
        let attachments: [MessageAttachment]
        /// Le fichier devenu orphelin, à supprimer par l'appelant.
        let staleURL: URL?
    }

    /// Une pièce qui a quitté le plateau pendant la retouche ne revient pas.
    static func apply(_ written: ConversationImageRetouche.Written,
                      size: CGSize,
                      to attachmentId: String,
                      files: [String: URL],
                      attachments: [MessageAttachment]) -> Outcome {
        guard attachments.contains(where: { $0.id == attachmentId }) else {
            return Outcome(files: files, attachments: attachments, staleURL: nil)
        }
        let ancienFichier = files[attachmentId]
        var fichiers = files
        fichiers[attachmentId] = written.url
        let pieces = attachments.map { ancienne -> MessageAttachment in
            guard ancienne.id == attachmentId else { return ancienne }
            return MessageAttachment(
                id: attachmentId,
                fileName: written.fileName,
                originalName: written.fileName,
                mimeType: written.mimeType,
                fileSize: written.byteCount,
                fileUrl: written.url.absoluteString,
                width: Int(size.width),
                height: Int(size.height),
                thumbnailColor: ancienne.thumbnailColor
            )
        }
        return Outcome(files: fichiers, attachments: pieces,
                       staleURL: ancienFichier == written.url ? nil : ancienFichier)
    }
}
