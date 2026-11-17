import Combine
import Foundation
import MeeshyE2EE
import MeeshySDK

/// Ce que le fil sait d'un message chiffré dont il n'a pas encore posé le
/// clair : l'entrée du coffre (le clair adopté, ou ce qui le retient), ou,
/// sans rien au coffre, qu'il a été écrit avant l'enrôlement de cet appareil
/// et qu'aucune enveloppe ne lui a jamais été adressée (R-3, #12781).
nonisolated enum EndToEndThreadEntry: Equatable {
    case vault(E2EEPlaintextEntry)
    case beforeThisDevice
}

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
    /// Ce que le coffre sait des messages du fil — le clair adopté, ou ce qui
    /// le retient (IOS-04) — et ceux qu'il ne recevra jamais (R-3). La liste
    /// reconfigure la cellule de chaque message dont l'entrée change.
    @Published private(set) var adopted: [String: EndToEndThreadEntry] = [:]
    /// Le verdict de la couche appareil des messages hybrides (#14369), lu au même coffre.
    let hybrid = HybridThreadIntegrity()

    init() {}

    // Isolé au MainActor : une deinit isolée tue xctest au démontage hors
    // d'une tâche (iOS 18.4+/26, Swift #85663).
    // Garde : MainActorDeinitSourceGuardTests / check-ios-isolated-deinits.sh.
    nonisolated deinit {}

    /// Lit puis pose le clair de tout message scellé du lot, et le retient.
    func resolve(_ messages: inout [MeeshyMessage], from endToEnd: any EndToEndMessagingProviding, conversationId: String, account: String) async {
        await hybrid.resolve(messages, from: endToEnd, conversationId: conversationId, account: account)
        let found = await EndToEndThreadPlaintexts.resolve(&messages, from: endToEnd, conversationId: conversationId, account: account)
        let older = await predating(messages, found: found, from: endToEnd, account: account)
        let known = found.mapValues(EndToEndThreadEntry.vault).merging(older) { vault, _ in vault }
        guard known.contains(where: { adopted[$0.key] != $0.value }) else { return }
        adopted.merge(known) { _, fresh in fresh }
    }

    /// Les messages chiffrés sans rien au coffre, datés (horloge du serveur)
    /// d'avant l'enrôlement de cet appareil : ni « en attente » ni « en attente
    /// d'approbation » ne leur convient, ce serait promettre ce qui n'arrivera pas.
    private func predating(
        _ messages: [MeeshyMessage], found: [String: E2EEPlaintextEntry], from endToEnd: any EndToEndMessagingProviding, account: String
    ) async -> [String: EndToEndThreadEntry] {
        guard messages.contains(where: EndToEndThreadPlaintexts.awaitsPlaintext),
              let enrolledAt = await endToEnd.enrolledAt(as: account) else { return [:] }
        let older = messages.filter { message in
            EndToEndThreadPlaintexts.awaitsPlaintext(message) && found[message.id] == nil && message.createdAt < enrolledAt
        }
        return Dictionary(older.map { ($0.id, EndToEndThreadEntry.beforeThisDevice) }) { first, _ in first }
    }

    /// Une relecture du magasin doit-elle passer par le coffre ? Un message
    /// chiffré sans son clair, ou un message hybride d'un autre membre pas
    /// encore lu au coffre (#14369).
    func needsVaultRead(_ message: MeeshyMessage) -> Bool {
        EndToEndThreadPlaintexts.awaitsPlaintext(message) || hybrid.needsRead(message)
    }

    /// Repose sur une ligne du magasin le clair adopté pour elle, rejugé à SA
    /// place sur la ligne telle qu'elle est maintenant. Une ligne chiffrée sans
    /// clair recevable dit POURQUOI (IOS-04, #18947) — en attente, en attente
    /// d'approbation, à mettre à jour, illisible, écrite avant cet appareil —,
    /// jamais le texte que le serveur y a écrit (audit #12916) ni le littéral
    /// `[Encrypted]` qui confondait tout ; rien ne change pour un message en clair.
    func apply(to message: inout MeeshyMessage, conversationId: String) {
        guard EndToEndThreadPlaintexts.awaitsPlaintext(message) else { return }
        switch adopted[message.id] {
        case .beforeThisDevice?:
            message.content = EndToEndWithheldNotice.beforeThisDevice.text
        case .vault(let entry)?:
            guard let readable = EndToEndThreadPlaintexts.adoption(of: entry, by: message, conversationId: conversationId) else {
                message.content = EndToEndWithheldNotice.of(message, entry: entry).text
                return
            }
            message = readable
        case nil:
            message.content = EndToEndWithheldNotice.of(message, entry: nil).text
        }
    }
}
