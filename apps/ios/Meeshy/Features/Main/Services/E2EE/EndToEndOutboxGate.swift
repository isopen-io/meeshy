import Foundation
import MeeshySDK
import os

/// **La file hors ligne ne rejoue rien en clair vers une conversation chiffrée
/// de bout en bout** (#12985).
///
/// La file ne garde que du clair. Une ligne enfilée avant l'activation, par une
/// version antérieure ou par un chemin qui ne gardait pas, s'arrête ici, AVANT
/// tout téléversement ou transport, par la loi du fil
/// (`EndToEndDestinationGuard`) : mémoire du compte, ligne et fil du cache. Le
/// refus est définitif (`OutboxFlusher.isPermanentServerRejection`), la bulle
/// passe en échec avec sa raison, et le renvoi depuis le fil se scelle.
struct EndToEndOutboxGate: OutboxDispatching {
    let inner: OutboxDispatcher
    let sealsDestination: @Sendable @concurrent (String) async -> Bool

    private static let logger = MeeshyLog.logger(.outboxDispatcher, subsystem: .legacyIOS)

    init(
        _ inner: OutboxDispatcher = OutboxDispatcher(),
        sealsDestination: @escaping @Sendable @concurrent (String) async -> Bool = { await EndToEndDestinationGuard.live($0) }
    ) {
        self.inner = inner
        self.sealsDestination = sealsDestination
    }

    func dispatch(_ record: OutboxRecord) async throws {
        guard record.kind == .sendMessage, let destination = Self.destination(of: record),
              await sealsDestination(destination) else {
            return try await inner.dispatch(record)
        }
        Self.logger.warning("E2EE outbox replay refused before transport record=\(record.id, privacy: .public)")
        let refusal = EndToEndSendRefusal.outboxUnsealable
        let localId = record.messageLocalId ?? record.clientMessageId
        let store = await inner.persistence()
        _ = try? await store.applyEvent(localId: localId, event: .sendFailed(refusal))
        throw refusal
    }

    /// La conversation de la ligne, ou celle de sa charge pour une ligne
    /// héritée qui ne la portait pas.
    private static func destination(of record: OutboxRecord) -> String? {
        if !record.conversationId.isEmpty { return record.conversationId }
        struct Target: Decodable { let conversationId: String }
        return (try? JSONDecoder().decode(Target.self, from: record.payload))?.conversationId
    }
}
