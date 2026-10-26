import Foundation
import MeeshyE2EE
import MeeshySDK
import os

/// **Les gestes d'une conversation chiffrée de bout en bout partent en SIGNAUX**
/// (#13142, #13060) : supprimer pour tous, ouvrir une vue unique, réagir,
/// épingler, écrire. Chacun est un message de contrôle libsignal scellé pour
/// l'appareil du correspondant et MES appareils approuvés, remis par la route
/// unique : la passerelle ne sait ni lequel, ni sur quel message. Aucune route
/// en clair n'est appelée — elle refuserait d'ailleurs (`E2EE_SIGNAL_CHANNEL_REQUIRED`).
///
/// Hors ligne, rien ne part ni n'attend : la file durable ne porte que des
/// gestes en clair. Le geste est refusé, l'interface le dit.
@MainActor
struct EndToEndSignalCommands {
    let conversationId: String
    let peerUserId: String?
    let senderUserId: String
    let signaling: any EndToEndSignalingProviding
    let persistence: any ConversationCommandPersisting
    let isOnline: () -> Bool
    var now: () -> Date = { Date() }

    private static let logger = Logger.e2ee

    /// Le signal de cette conversation, remis au correspondant et à mes appareils.
    private func send(_ action: E2EESignalAction, wake: Bool) async throws {
        guard let peerUserId, !peerUserId.isEmpty, !senderUserId.isEmpty else { throw EndToEndSendRefusal.recipientUnsealable }
        let signal = E2EESignal(conversationId: conversationId, sentAt: now(), action: action)
        _ = try await signaling.send(signal, from: senderUserId, to: peerUserId, wake: wake)
    }

    /// **Supprimer pour tous** : la bulle part tout de suite ; le clair ne quitte
    /// le coffre de CET appareil qu'une fois le signal accepté par la passerelle,
    /// et celui des autres appareils qu'à la réception du signal signé de moi.
    func deleteForEveryone(messageId: String, serverId: String) async -> ConversationCommandFailure? {
        guard isOnline() else { return Self.offlineRefusal }
        let deletedAt = now()
        try? await persistence.markDeletedAwaitingConfirmation(localId: messageId, deletedAt: deletedAt)
        StarredMessagesStore.shared.remove(messageId: serverId)
        do {
            try await send(.deleteForEveryone(target: serverId), wake: true)
            try? await persistence.confirmDeletion(localId: messageId)
            return nil
        } catch {
            Self.logger.warning("e2ee delete signal refused: \(String(describing: type(of: error)), privacy: .public)")
            try? await persistence.markUndeleted(localId: messageId)
            return ConversationCommandFailure(error)
        }
    }

    /// Une vue unique ouverte ICI : elle se consomme sur mes autres appareils,
    /// et le correspondant apprend qu'elle est ouverte. Le coffre de cet appareil
    /// est déjà vidé par le geste (`markViewOnceOpened(origin: .authenticated)`).
    func viewOnceOpened(serverId: String) async -> Bool {
        do {
            try await send(.viewOnceOpened(target: serverId), wake: true)
            return true
        } catch {
            Self.logger.warning("e2ee view-once signal not sent: \(String(describing: type(of: error)), privacy: .public)")
            return false
        }
    }

    /// La réaction est déjà posée localement (optimiste) ; refusée, elle se retire.
    func react(localId: String, serverId: String, participantId: String, emoji: String, removed: Bool) async {
        do {
            try await send(.reaction(target: serverId, emoji: emoji, removed: removed), wake: false)
        } catch {
            Self.logger.warning("e2ee reaction signal not sent: \(String(describing: type(of: error)), privacy: .public)")
            if removed {
                try? await persistence.appendReaction(
                    localId: localId, reactionId: UUID().uuidString, messageId: serverId, participantId: participantId,
                    emoji: emoji, maxCount: nil, ownerUserId: nil
                )
            } else {
                try? await persistence.removeReaction(
                    localId: localId, emoji: emoji, participantId: participantId, ownerUserId: nil,
                    aggregateCount: nil, aggregateParticipantIds: nil
                )
            }
        }
    }

    func togglePin(messageId: String, serverId: String, previous: MessagePinState) async -> ConversationCommandFailure? {
        guard isOnline() else { return Self.offlineRefusal }
        let pinning = !previous.isPinned
        try? await persistence.updatePinned(localId: messageId, pinnedAt: pinning ? now() : nil, pinnedBy: pinning ? senderUserId : nil)
        do {
            try await send(.pin(target: serverId, pinned: pinning), wake: false)
            return nil
        } catch {
            try? await persistence.updatePinned(localId: messageId, pinnedAt: previous.pinnedAt, pinnedBy: previous.pinnedBy)
            return ConversationCommandFailure(error)
        }
    }

    /// La frappe : au plus un signal par réémission du fil (3 s), jamais réveillant.
    func typing(active: Bool) async {
        try? await send(.typing(active: active), wake: false)
    }

    static var offlineRefusal: ConversationCommandFailure {
        ConversationCommandFailure(userMessage: String(
            localized: "e2ee.signal.offline",
            defaultValue: "Connectez-vous : dans une conversation chiffrée, ce geste part chiffré et n'attend pas hors ligne.",
            bundle: .main
        ))
    }
}
