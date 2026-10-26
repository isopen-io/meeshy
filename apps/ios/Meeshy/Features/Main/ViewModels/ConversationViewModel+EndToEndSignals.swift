import Foundation
import MeeshyE2EE
import MeeshySDK

/// Les gestes du fil d'une conversation chiffrée de bout en bout, en signaux
/// chiffrés (#13142, #13060). `nil` hors bout en bout : les routes habituelles servent.
extension ConversationViewModel {
    var endToEndSignals: EndToEndSignalCommands? {
        guard endToEndSealer.requiresSeal else { return nil }
        return EndToEndSignalCommands(
            conversationId: conversationId,
            peerUserId: participantUserId,
            senderUserId: currentUserId,
            signaling: (endToEnd as? any EndToEndSignalingProviding) ?? UnavailableEndToEndSignaling(),
            persistence: messagePersistence,
            isOnline: { NetworkMonitor.shared.isOnline }
        )
    }

    /// La frappe du fil, relayée chiffrée quand la conversation l'est : `true` si
    /// elle est partie par le relais (le fil n'émet alors rien en clair).
    func relayTypingEndToEnd(_ active: Bool) -> Bool {
        guard let signals = endToEndSignals else { return false }
        Task { await signals.typing(active: active) }
        return true
    }
}

/// Sans relais de signaux (témoins, runtime absent) : tout geste chiffré est refusé, rien ne part en clair.
nonisolated struct UnavailableEndToEndSignaling: EndToEndSignalingProviding {
    func send(_ signal: E2EESignal, from userId: String, to peerUserId: String, wake: Bool) async throws -> E2EESignalReceipt {
        throw EndToEndSendRefusal.sessionUnavailable
    }

    func pendingSignals(as account: String) async -> [E2EEReceivedSignal] { [] }

    func settleSignals(_ signalIds: [String], as account: String) async {}
}
