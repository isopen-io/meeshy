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
    private var discarded: Set<String> = []
    private var loads: [String: Task<Void, Never>] = [:]
    private var deadlines: [String: Task<Void, Never>] = [:]
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
        let served = Dictionary(messages.map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })
        let found = await EndToEndThreadPlaintexts.resolve(&messages, from: endToEnd, conversationId: conversationId, media: media.paths)
        for (messageId, entry) in found {
            guard let row = served[messageId] else { continue }
            settlePieces(of: entry, on: row)
        }
        guard found.contains(where: { adopted[$0.key] != $0.value }) else { return }
        adopted.merge(found) { _, fresh in fresh }
    }

    /// Les pièces d'un message adopté se téléchargent, se vérifient et se
    /// déchiffrent une fois par visite, et seulement celles que la ligne servie
    /// autorise (`EndToEndAttachmentOverlay.materializable`) ; un échec se
    /// retente à la suivante. Une vue unique consommée ou un éphémère échu ne
    /// télécharge rien et vide le coffre de ses pièces ; un éphémère encore en
    /// vie le videra à son échéance (#12957).
    private func settlePieces(of entry: E2EEPlaintextEntry, on row: MeeshyMessage, now: Date = Date()) {
        guard case .readable(let content, _) = entry, let pointers = content.attachments, !pointers.isEmpty else { return }
        guard !EndToEndAttachmentOverlay.isSpent(row, now: now) else { return discardPieces(pointers, of: row.id) }
        guard !requested.contains(row.id) else { return }
        let wanted = EndToEndAttachmentOverlay.materializable(pointers, for: row, now: now)
        guard !wanted.isEmpty else { return }
        requested.insert(row.id)
        let messageId = row.id
        loads[messageId] = Task { [weak self, media] in
            let present = await media.materialize(wanted)
            guard let self, !self.discarded.contains(messageId) else { return }
            self.materialized[messageId] = present
        }
        if let expiresAt = row.expiresAt { discardPieces(pointers, of: messageId, at: expiresAt) }
    }

    private func discardPieces(_ pointers: [E2EEAttachmentPointer], of messageId: String, at deadline: Date) {
        deadlines[messageId]?.cancel()
        deadlines[messageId] = Task { [weak self, media] in
            let delay = deadline.timeIntervalSinceNow
            if delay > 0 { try? await Task.sleep(nanoseconds: UInt64(delay * 1_000_000_000)) }
            guard !Task.isCancelled else { return }
            guard let self else { return await media.discard(pointers) }
            self.discardPieces(pointers, of: messageId)
        }
    }

    private func discardPieces(_ pointers: [E2EEAttachmentPointer], of messageId: String) {
        guard !discarded.contains(messageId) else { return }
        discarded.insert(messageId)
        deadlines.removeValue(forKey: messageId)?.cancel()
        let load = loads.removeValue(forKey: messageId)
        if materialized[messageId] != nil { materialized.removeValue(forKey: messageId) }
        Task { [media] in
            _ = await load?.value
            await media.discard(pointers)
        }
    }

    /// Repose sur une ligne du magasin le clair adopté pour elle, rejugé à SA
    /// place sur la ligne telle qu'elle est maintenant. Une ligne chiffrée sans
    /// clair recevable rend le littéral, jamais le texte que le serveur y a
    /// écrit (audit #12916) ; rien ne change pour un message en clair.
    func apply(to message: inout MeeshyMessage, conversationId: String) {
        guard EndToEndThreadPlaintexts.awaitsPlaintext(message) else { return }
        if let entry = adopted[message.id], EndToEndAttachmentOverlay.isSpent(message) {
            settlePieces(of: entry, on: message)
        }
        guard let entry = adopted[message.id],
              let readable = EndToEndThreadPlaintexts.adoption(of: entry, by: message, conversationId: conversationId, media: media.paths) else {
            message.content = E2EEWire.contentPlaceholder
            return
        }
        message = readable
    }
}
