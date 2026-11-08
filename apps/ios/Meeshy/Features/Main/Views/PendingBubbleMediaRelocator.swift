import Foundation
import os
import MeeshySDK

// MARK: - La bulle en attente suit la copie durable de son média (#15109)
//
// Hors ligne, l'outbox COPIE chaque fichier sous `Documents/pending-media/`
// (ou `pending-audio/`) puis EFFACE la source temporaire. La bulle optimiste,
// posée au tap, désignait cette source : sa vignette, la première image de sa
// vidéo et le lecteur de son vocal mouraient avec elle, et une relance hors
// ligne rouvrait une bulle vide. Le site qui enfile connaît les chemins
// durables ; il les remet ici, qui réécrit les pièces de la ligne GRDB —
// l'observation du store fait le reste.

protocol PendingBubbleMediaRelocating {
    func relocate(tempId: String, attachments: [MeeshyMessageAttachment], toStoredPaths storedPaths: [String]) async
}

enum PendingBubbleMediaRelocation {
    /// `nil` quand les pièces et les chemins ne s'apparient pas un à un :
    /// mieux vaut garder la bulle telle quelle que lui donner le fichier d'une
    /// autre pièce.
    static func relocated(
        _ attachments: [MeeshyMessageAttachment],
        toStoredPaths storedPaths: [String],
        absolutePath: (String) -> String = OfflineQueue.absoluteMediaPath(forStored:)
    ) -> [MeeshyMessageAttachment]? {
        guard !attachments.isEmpty, attachments.count == storedPaths.count else { return nil }
        return zip(attachments, storedPaths).map { attachment, stored in
            attachment.relocatingLocalFile(to: URL(fileURLWithPath: absolutePath(stored)))
        }
    }
}

struct PendingBubbleMediaRelocator: PendingBubbleMediaRelocating {
    let persistence: any ConversationCommandPersisting

    func relocate(tempId: String, attachments: [MeeshyMessageAttachment], toStoredPaths storedPaths: [String]) async {
        guard let relocated = PendingBubbleMediaRelocation.relocated(attachments, toStoredPaths: storedPaths) else {
            Logger.messages.warning("Pending bubble media not relocated tempId=\(tempId, privacy: .public) attachments=\(attachments.count, privacy: .public) paths=\(storedPaths.count, privacy: .public)")
            return
        }
        do {
            try await persistence.updateAttachmentsJson(localId: tempId, attachmentsJson: JSONEncoder().encode(relocated))
        } catch {
            Logger.messages.error("Pending bubble media relocation failed tempId=\(tempId, privacy: .public): \(error.localizedDescription, privacy: .public)")
        }
    }
}
