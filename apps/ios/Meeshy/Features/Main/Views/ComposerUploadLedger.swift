import Foundation
import MeeshySDK

/// Les lots de pièces jointes EN VOL d'un compositeur de conversation (#14696).
///
/// Un lot se téléverse pendant que l'utilisateur compose et envoie la suite :
/// plusieurs lots vivent donc ensemble, et chacun ne rend, en finissant, que ce
/// qui lui appartient — jamais l'état partagé du compositeur, où vivent déjà
/// les pièces du message suivant.
struct ComposerUploadLedger {
    private var order: [UUID] = []
    private var owned: [UUID: Set<String>] = [:]
    private var progress: [UUID: UploadQueueProgress] = [:]

    var isUploading: Bool { !order.isEmpty }
    var inFlightCount: Int { order.count }

    /// La progression du plus ancien lot qui en a publié une : c'est celui qui
    /// part en premier, donc celui que l'utilisateur attend.
    var displayedProgress: UploadQueueProgress? {
        order.lazy.compactMap { progress[$0] }.first
    }

    mutating func begin(_ batch: UUID, mediaIds: Set<String>) {
        guard owned[batch] == nil else { return }
        order.append(batch)
        owned[batch] = mediaIds
    }

    mutating func report(_ update: UploadQueueProgress, for batch: UUID) {
        guard owned[batch] != nil else { return }
        progress[batch] = update
    }

    /// Rend les identifiants des pièces que ce lot possédait ; un lot inconnu
    /// ou déjà terminé ne rend rien.
    mutating func finish(_ batch: UUID) -> Set<String> {
        guard let released = owned.removeValue(forKey: batch) else { return [] }
        order.removeAll { $0 == batch }
        progress.removeValue(forKey: batch)
        return released
    }

    static func remaining(_ files: [String: URL], releasing released: Set<String>) -> [String: URL] {
        files.filter { !released.contains($0.key) }
    }

    /// Le brouillon durable ne se purge que si le compositeur ne porte plus
    /// aucune pièce, prête ou en préparation.
    static func purgesDraft(pendingAttachmentCount: Int, preparingCount: Int) -> Bool {
        pendingAttachmentCount == 0 && preparingCount == 0
    }
}

extension ConversationComposerState {
    /// Termine un lot : seuls ses fichiers quittent le compositeur, car ce qu'il porte APRÈS
    /// le tap appartient au message suivant. Rend `true` quand le brouillon durable peut se
    /// purger.
    mutating func settleUpload(_ upload: UUID) -> Bool {
        let released = uploads.finish(upload)
        pendingMediaFiles = ComposerUploadLedger.remaining(pendingMediaFiles, releasing: released)
        return ComposerUploadLedger.purgesDraft(
            pendingAttachmentCount: pendingAttachments.count,
            preparingCount: preparingAttachments.count
        )
    }
}
