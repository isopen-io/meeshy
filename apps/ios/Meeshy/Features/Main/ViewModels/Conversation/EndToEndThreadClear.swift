import Combine
import Foundation
import MeeshyE2EE
import MeeshySDK

/// **Le clair que CET appareil a posé sur le fil, jusqu'au pixel** (#12916).
///
/// La cellule ne rend pas `ConversationViewModel.messages` : elle rend la
/// ligne de `MessageStore`, où un message `e2ee` ne porte que le littéral servi
/// (`[Encrypted]`) — le clair reste dans la base scellée de libsignal, jamais
/// dans la base des messages. Le fil posait le clair dans `messages` seulement,
/// et la bulle affichait le littéral. Ce registre retient ce que la relecture
/// a adopté (déjà jugé à SA place par `EndToEndThreadPlaintexts`) et le repose
/// sur la ligne que la cellule rend, au même titre que l'état de la visite.
/// Une instance par conversation ouverte (`ConversationDependencies`).
final class EndToEndThreadClear {
    @Published private(set) var adopted: [String: E2EEPlaintextEntry] = [:]
    /// Par message, le nombre de fichiers clairs de ses pièces chiffrées sur
    /// l'appareil déjà là (#10789) : la cellule se redessine quand une pièce
    /// arrive, et passe de son ThumbHash à l'image, au son, au document.
    @Published private(set) var materialized: [String: Int] = [:]
    private var requested: Set<String> = []
    private let media: any EndToEndAttachmentMaterializing

    init(media: any EndToEndAttachmentMaterializing = EndToEndAttachmentVault.shared) {
        self.media = media
    }

    var mediaPaths: EndToEndMediaPaths { media.paths }

    // Isolé au MainActor : une deinit isolée tue xctest au démontage hors
    // d'une tâche (iOS 18.4+/26, Swift #85663).
    // Garde : MainActorDeinitSourceGuardTests / check-ios-isolated-deinits.sh.
    nonisolated deinit {}

    /// Lit puis pose le clair de tout message scellé du lot, et le retient.
    func resolve(_ messages: inout [MeeshyMessage], from endToEnd: any EndToEndMessagingProviding, conversationId: String) async {
        let found = await EndToEndThreadPlaintexts.resolve(&messages, from: endToEnd, conversationId: conversationId, media: media.paths)
        materializePieces(of: found)
        guard found.contains(where: { adopted[$0.key] != $0.value }) else { return }
        adopted.merge(found) { _, fresh in fresh }
    }

    /// Les pièces d'un message adopté se téléchargent, se vérifient et se
    /// déchiffrent une fois par visite ; un échec se retente à la suivante.
    private func materializePieces(of found: [String: E2EEPlaintextEntry]) {
        for (messageId, entry) in found where !requested.contains(messageId) {
            guard case .readable(let content, _) = entry, let pointers = content.attachments, !pointers.isEmpty else { continue }
            requested.insert(messageId)
            Task { [weak self, media] in
                let present = await media.materialize(pointers)
                self?.materialized[messageId] = present
            }
        }
    }

    /// Repose sur une ligne du magasin le clair adopté pour elle, rejugé à SA
    /// place sur la ligne telle qu'elle est maintenant. Une ligne chiffrée sans
    /// clair recevable rend le littéral, jamais le texte que le serveur y a
    /// écrit (audit #12916) ; rien ne change pour un message en clair.
    func apply(to message: inout MeeshyMessage, conversationId: String) {
        guard EndToEndThreadPlaintexts.awaitsPlaintext(message) else { return }
        guard let entry = adopted[message.id],
              let readable = EndToEndThreadPlaintexts.adoption(of: entry, by: message, conversationId: conversationId, media: media.paths) else {
            message.content = E2EEWire.contentPlaceholder
            return
        }
        message = readable
    }
}
