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

    var isUploading: Bool { !order.isEmpty }
    var inFlightCount: Int { order.count }

    mutating func begin(_ batch: UUID, mediaIds: Set<String>) {
        guard owned[batch] == nil else { return }
        order.append(batch)
        owned[batch] = mediaIds
    }

    /// Rend les identifiants des pièces que ce lot possédait ; un lot inconnu
    /// ou déjà terminé ne rend rien.
    mutating func finish(_ batch: UUID) -> Set<String> {
        guard let released = owned.removeValue(forKey: batch) else { return [] }
        order.removeAll { $0 == batch }
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

/// La progression de téléversement d'UNE bulle optimiste (#14702), observée par la seule
/// pastille de cette bulle : un tick ne redessine ni la liste, ni la bulle, ni ses voisines.
/// Elle ne republie qu'au point de pourcentage gagné, jamais à chaque tronçon TUS.
@MainActor
final class MessageUploadProgress: ObservableObject {
    nonisolated deinit {}

    @Published private(set) var percent: Int?

    fileprivate func report(_ fraction: Double) {
        let next = Self.percent(of: fraction)
        guard next != percent else { return }
        percent = next
    }

    nonisolated static func percent(of fraction: Double) -> Int {
        Int((min(max(fraction, 0), 1) * 100 + 1e-9).rounded(.down))
    }

    nonisolated static func accessibilityValue(percent: Int, locale: Locale = .current) -> String {
        (Double(percent) / 100).formatted(.percent.precision(.fractionLength(0)).locale(locale))
    }
}

/// Le tempId d'une bulle optimiste → sa progression. Une bulle s'inscrit AVANT d'être posée
/// dans le fil : la cellule qui la configure trouve déjà son objet, et n'en observe aucun autre.
@MainActor
final class MessageUploadProgressStore {
    nonisolated deinit {}

    private var entries: [String: MessageUploadProgress] = [:]

    func begin(_ tempIds: [String]) {
        tempIds.filter { entries[$0] == nil }.forEach { entries[$0] = MessageUploadProgress() }
    }

    func progress(for tempId: String) -> MessageUploadProgress? {
        entries[tempId]
    }

    func report(_ fraction: Double, for tempId: String) {
        entries[tempId]?.report(fraction)
    }

    func end(_ tempIds: [String]) {
        tempIds.forEach { entries[$0] = nil }
    }
}
