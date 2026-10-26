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
    ///
    /// Le réveil ne dépend pas du GESTE : tout geste réveille, sauf la frappe,
    /// éphémère (une frappe vieille de trente secondes ne dit plus rien). Un
    /// réveil réservé à la suppression et à la vue unique désignait ces deux
    /// gestes à la passerelle, qui voit l'indicateur en clair.
    private func send(_ action: E2EESignalAction) async throws {
        let wake: Bool
        if case .typing = action { wake = false } else { wake = true }
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
            try await send(.deleteForEveryone(target: serverId))
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
            try await send(.viewOnceOpened(target: serverId))
            return true
        } catch {
            Self.logger.warning("e2ee view-once signal not sent: \(String(describing: type(of: error)), privacy: .public)")
            return false
        }
    }

    /// La réaction se pose localement tout de suite (optimiste), puis part en
    /// signal ; refusée, elle se retire.
    func reactOptimistically(localId: String, serverId: String, participantId: String, emoji: String, removed: Bool) async {
        if removed {
            try? await persistence.removeReaction(
                localId: localId, emoji: emoji, participantId: participantId, ownerUserId: nil,
                aggregateCount: nil, aggregateParticipantIds: nil
            )
        } else {
            ReactionAnimationGate.markAdded(messageId: localId, emoji: emoji)
            try? await persistence.appendReaction(
                localId: localId, reactionId: UUID().uuidString, messageId: serverId, participantId: participantId,
                emoji: emoji, maxCount: nil, ownerUserId: nil
            )
        }
        await react(localId: localId, serverId: serverId, participantId: participantId, emoji: emoji, removed: removed)
    }

    /// La réaction est déjà posée localement (optimiste) ; refusée, elle se retire.
    func react(localId: String, serverId: String, participantId: String, emoji: String, removed: Bool) async {
        do {
            try await send(.reaction(target: serverId, emoji: emoji, removed: removed))
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
            try await send(.pin(target: serverId, pinned: pinning))
            return nil
        } catch {
            try? await persistence.updatePinned(localId: messageId, pinnedAt: previous.pinnedAt, pinnedBy: previous.pinnedBy)
            return ConversationCommandFailure(error)
        }
    }

    /// La frappe : au plus un signal par réémission du fil (3 s), jamais réveillant.
    func typing(active: Bool) async {
        try? await send(.typing(active: active))
    }

    /// Supprimer pour tous ou consommer une vue unique : par signal pour un
    /// message dont la LIGNE est chiffrée de bout en bout (ou déchiffrée sur cet
    /// appareil) ; par la route en clair pour un message que le serveur lit déjà
    /// — écrit avant l'activation —, que la passerelle admet en clair selon la
    /// MÊME règle (`messageRefusesPlainErasure`). Une règle à dates divergeait de
    /// la passerelle : une ligne en clair postérieure à l'activation partait en
    /// signal que le correspondant, sans clair au coffre, attendait à jamais.
    /// Un message introuvable part en signal (fail-closed).
    static func erasureTravelsAsSignal(_ message: MeeshyMessage?) -> Bool {
        guard let message else { return true }
        return DeviceTranslationEligibility.isEndToEnd(message, conversationEncryptionMode: nil)
    }

    static var offlineRefusal: ConversationCommandFailure {
        ConversationCommandFailure(userMessage: String(
            localized: "e2ee.signal.offline",
            defaultValue: "Connectez-vous : dans une conversation chiffrée, ce geste part chiffré et n'attend pas hors ligne.",
            bundle: .main
        ))
    }
}

extension EndToEndSignalCommands {
    /// Les signaux du fil de `viewModel` ; `nil` hors bout en bout : les routes habituelles servent.
    static func of(_ viewModel: ConversationViewModel) -> EndToEndSignalCommands? {
        guard viewModel.endToEndSealer.requiresSeal else { return nil }
        return EndToEndSignalCommands(
            conversationId: viewModel.conversationId,
            peerUserId: viewModel.participantUserId,
            senderUserId: viewModel.currentUserId,
            signaling: (viewModel.endToEnd as? any EndToEndSignalingProviding) ?? UnavailableEndToEndSignaling(),
            persistence: viewModel.messagePersistence,
            isOnline: { NetworkMonitor.shared.isOnline }
        )
    }

    /// Les signaux d'un geste qui EFFACE (suppression pour tous, vue unique) :
    /// `nil` pour un message écrit en clair avant l'activation, qui garde sa route.
    static func erasure(of messageId: String, in viewModel: ConversationViewModel) -> EndToEndSignalCommands? {
        guard let signals = of(viewModel) else { return nil }
        let message = viewModel.messageIndex(for: messageId).map { viewModel.messages[$0] }
        return erasureTravelsAsSignal(message) ? signals : nil
    }
}

/// **Les commandes du fil, aiguillées par le régime** (#13142, #13060). Dans une
/// conversation chiffrée de bout en bout, réagir, épingler, supprimer pour tous,
/// consommer une vue unique et écrire partent en signaux chiffrés ; tout le reste,
/// et tout geste hors bout en bout, va aux commandes en clair qu'il enveloppe.
/// Le fil se lie après sa construction (`bind`), le régime se relit à chaque geste.
@MainActor
final class EndToEndConversationCommands: ConversationCommandProviding {
    private let base: any ConversationCommandProviding
    private weak var host: ConversationViewModel?

    init(base: any ConversationCommandProviding) {
        self.base = base
    }

    // Isolé au MainActor : une deinit isolée tue xctest au démontage hors
    // d'une tâche (iOS 18.4+/26, Swift #85663).
    nonisolated deinit {}

    /// Lie le fil, et rend le relais de frappe de son gestionnaire de socket :
    /// `true` quand la frappe est partie chiffrée (rien ne part alors en clair).
    func bind(host: ConversationViewModel) -> @MainActor (Bool) -> Bool {
        self.host = host
        return { [weak self] active in
            guard let signals = self?.signals else { return false }
            Task { await signals.typing(active: active) }
            return true
        }
    }

    private var signals: EndToEndSignalCommands? { host.flatMap(EndToEndSignalCommands.of) }

    private func erasureSignals(for messageId: String) -> EndToEndSignalCommands? {
        host.flatMap { EndToEndSignalCommands.erasure(of: messageId, in: $0) }
    }

    func addReaction(localId: String, remoteId: String, participantId: String, emoji: String) {
        guard let signals else { return base.addReaction(localId: localId, remoteId: remoteId, participantId: participantId, emoji: emoji) }
        Task { await signals.reactOptimistically(localId: localId, serverId: remoteId, participantId: participantId, emoji: emoji, removed: false) }
    }

    func removeReaction(localId: String, remoteId: String, participantId: String, emoji: String) {
        guard let signals else { return base.removeReaction(localId: localId, remoteId: remoteId, participantId: participantId, emoji: emoji) }
        Task { await signals.reactOptimistically(localId: localId, serverId: remoteId, participantId: participantId, emoji: emoji, removed: true) }
    }

    func deleteForEveryone(messageId: String, serverId: String) async -> ConversationCommandFailure? {
        guard let signals = erasureSignals(for: messageId) else { return await base.deleteForEveryone(messageId: messageId, serverId: serverId) }
        return await signals.deleteForEveryone(messageId: messageId, serverId: serverId)
    }

    func consumeViewOnce(messageId: String, serverId: String) async -> Bool {
        guard let signals = erasureSignals(for: messageId) else { return await base.consumeViewOnce(messageId: messageId, serverId: serverId) }
        return await signals.viewOnceOpened(serverId: serverId)
    }

    func togglePin(messageId: String, serverId: String, previous: MessagePinState, currentUserId: String?) async -> ConversationCommandFailure? {
        guard let signals else {
            return await base.togglePin(messageId: messageId, serverId: serverId, previous: previous, currentUserId: currentUserId)
        }
        return await signals.togglePin(messageId: messageId, serverId: serverId, previous: previous)
    }

    // MARK: - Hors signaux : les commandes en clair

    func canDeleteForEveryone(_ message: Message) -> Bool { base.canDeleteForEveryone(message) }
    func markAsReceived() { base.markAsReceived() }
    func consumeReactionToken() -> Bool { base.consumeReactionToken() }
    func deleteForMe(_ targets: [ForMeTarget], projection: ForMeProjection) async -> ConversationCommandFailure? {
        await base.deleteForMe(targets, projection: projection)
    }
    func withdrawUnsent(messageId: String) async { await base.withdrawUnsent(messageId: messageId) }
    func removeForModeration(messageId: String, serverId: String, reason: String) async -> ConversationCommandFailure? {
        await base.removeForModeration(messageId: messageId, serverId: serverId, reason: reason)
    }
    func removeSelection(
        _ targets: [SelectionRemovalTarget], reason: String, discardUnsent: (String) async -> Void
    ) async -> ConversationCommandFailure? {
        await base.removeSelection(targets, reason: reason, discardUnsent: discardUnsent)
    }
    func removeAttachment(messageId: String, attachmentId: String, original: [MeeshyMessageAttachment]) async -> ConversationCommandFailure? {
        await base.removeAttachment(messageId: messageId, attachmentId: attachmentId, original: original)
    }
    func editMessage(
        messageId: String, serverId: String, content: String, originalContent: String?,
        beforeOptimisticWrite: () -> Void
    ) async -> ConversationCommandFailure? {
        await base.editMessage(
            messageId: messageId, serverId: serverId, content: content, originalContent: originalContent,
            beforeOptimisticWrite: beforeOptimisticWrite
        )
    }
    func compensate(_ payload: OfflineRetryExhausted, currentUserId: String, serverId: (String) -> String) async {
        await base.compensate(payload, currentUserId: currentUserId, serverId: serverId)
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
