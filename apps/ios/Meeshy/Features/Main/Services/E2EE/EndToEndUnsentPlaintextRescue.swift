import Foundation
import MeeshyE2EE
import MeeshySDK
import os

/// **Le clair qu'une version antérieure a laissé dans une bulle jamais partie
/// d'une conversation chiffrée rejoint le coffre** (#13067, rétrocompatibilité
/// #9223).
///
/// Avant #13067, la réponse depuis une notification et le refus d'appel par
/// message posaient, même vers une conversation chiffrée de bout en bout, une
/// ligne `isEncrypted: false` qui portait le clair, puis la passaient en échec.
/// La migration de #12999 ne la voit pas : le coffre n'en a aucune trace. À
/// chaque ouverture de session, mes messages jamais acquittés, en échec, dont
/// la ligne garde un texte sont relus ; pour ceux d'une conversation que la loi du fil
/// dit chiffrée (`EndToEndDestinationGuard`), le clair est rangé au coffre sous
/// l'identifiant client, puis la ligne est rescellée sous `secure_delete` et
/// prend la raison du refus : le fil la renvoie chiffrée d'un toucher. Un clair que le
/// coffre ne prend pas reste où il est, jusqu'à la session suivante : effacer
/// sans garder perdrait le seul exemplaire du texte.
///
/// Modèle de menace : appareil volé. Hors modèle : les octets que SQLite a pu
/// laisser hors des pages remises à zéro (journal non tronqué sous un lecteur
/// actif), comme pour #12999.
struct EndToEndUnsentPlaintextRescue: Sendable {
    let endToEnd: any EndToEndMessagingProviding
    let persistence: @MainActor @Sendable () -> MessagePersistenceActor
    var seals: @Sendable @concurrent (String) async -> Bool = { await EndToEndDestinationGuard.live($0) }
    var caches: CacheCoordinator = .shared

    func run(for account: String) async {
        guard !account.isEmpty else { return }
        do {
            let store = persistence()
            let unsent = try await store.endToEndRowSealer.unsentPlaintexts(authoredBy: account)
            let sealedConversations = await conversationsThatSeal(Set(unsent.map(\.conversationId)))
            let rescued = await kept(unsent.filter { sealedConversations.contains($0.conversationId) }, by: account)
            guard !rescued.isEmpty else { return }
            try await store.endToEndRowSealer.seal(messageKeys: rescued.map(\.localId))
            let reason = EndToEndSendRefusal.sealedOnlyInConversation.userMessage
            for row in rescued {
                try? await store.markOptimisticFailed(localId: row.localId, reason: reason)
            }
            for conversationId in Set(rescued.map(\.conversationId)) {
                await caches.messages.invalidate(for: conversationId)
            }
            Logger.e2ee.info("e2ee unsent plaintext rescued rows=\(rescued.count, privacy: .public)")
        } catch {
            Logger.e2ee.error("e2ee unsent plaintext rescue deferred: \(String(describing: type(of: error)), privacy: .public)")
        }
    }

    private func conversationsThatSeal(_ ids: Set<String>) async -> Set<String> {
        var sealing: Set<String> = []
        for id in ids where await seals(id) { sealing.insert(id) }
        return sealing
    }

    /// Ce que le coffre a pris, rangé comme le fil l'aurait rangé : même texte,
    /// même langue, même citation, même identifiant client.
    private func kept(_ rows: [EndToEndPlaintextRowSealer.UnsentPlaintext], by account: String) async -> [EndToEndPlaintextRowSealer.UnsentPlaintext] {
        var kept: [EndToEndPlaintextRowSealer.UnsentPlaintext] = []
        for row in rows {
            let content = E2EEContent(
                text: row.content, language: row.originalLanguage, replyTo: row.replyToId,
                conversationId: row.conversationId, clientMessageId: row.localId, sentAt: row.createdAt
            )
            if await endToEnd.remember(content, from: account, as: [row.localId]) { kept.append(row) }
        }
        if kept.count < rows.count {
            Logger.e2ee.warning("e2ee unsent plaintext left in place until the vault takes it count=\(rows.count - kept.count, privacy: .public)")
        }
        return kept
    }
}

extension EndToEndUnsentPlaintextRescue {
    static let live = EndToEndUnsentPlaintextRescue(
        endToEnd: EndToEndMessagingRuntime.shared,
        persistence: { DependencyContainer.shared.messagePersistence }
    )
}
