import Foundation
import MeeshyE2EE
import MeeshySDK
import os

/// Ce que l'application d'un signal écrit dans la base des messages.
nonisolated protocol EndToEndSignalPersisting: Sendable {
    func markDeleted(localId: String, deletedAt: Date, sparingOpenedViewOnce: Bool, expired: Bool, origin: PlaintextErasureOrigin) async throws
    func markViewOnceOpened(localId: String, at date: Date, origin: PlaintextErasureOrigin) async throws
    func appendReaction(
        localId: String, reactionId: String, messageId: String, participantId: String?,
        emoji: String, maxCount: Int?, ownerUserId: String?
    ) async throws
    func removeReaction(
        localId: String, emoji: String, participantId: String?, ownerUserId: String?,
        aggregateCount: Int?, aggregateParticipantIds: [String]?
    ) async throws
    func updatePinned(localId: String, pinnedAt: Date?, pinnedBy: String?) async throws
    /// La conversation de la ligne locale de ces messages (`E2EESignalAuthority`).
    func conversationIds(of messageIds: [String]) async throws -> [String: String]
}

extension MessagePersistenceActor: EndToEndSignalPersisting {}

/// Une frappe reçue d'un pair, à afficher (ou à retirer) dans le fil et la liste.
nonisolated struct EndToEndTypingSignal: Equatable, Sendable {
    let conversationId: String
    let userId: String
    let active: Bool
}

/// **Appliquer un signal chiffré reçu** (#13142, #13060). Chaque signal de la
/// boîte est jugé par `E2EESignalAuthority` contre l'auteur AUTHENTIFIÉ du
/// message visé, lu au coffre — jamais contre ce que la passerelle annonce —,
/// puis appliqué à la base des messages et RÉGLÉ. Une suppression pour tous de
/// l'auteur et une vue unique ouverte sur un de MES appareils sont des
/// effacements AUTHENTIFIÉS : elles vident le coffre (la file de #13001). Un
/// signal qui devance son message attend, au plus `awaitLimit`.
///
/// Ce lot applique la suppression pour tous, la vue unique, la réaction,
/// l'épinglage et la frappe. La modification, les accusés et la progression de
/// lecture sont reconnus et réglés sans effet : leur application suit (#13142).
actor EndToEndSignalApplier {
    static let shared = EndToEndSignalApplier(
        signaling: EndToEndMessagingRuntime.shared,
        plaintexts: EndToEndMessagingRuntime.shared,
        persistence: { DependencyContainer.shared.messagePersistence },
        typing: { MessageSocketManager.shared.deliverEndToEndTyping($0) }
    )

    /// La rétention des enveloppes de la passerelle : au-delà, le message visé ne viendra plus.
    static let awaitLimit: TimeInterval = 30 * 86_400
    /// Une frappe plus vieille ne dit plus rien de ce qui se passe maintenant.
    static let typingFreshness: TimeInterval = 30

    private let signaling: any EndToEndSignalingProviding
    private let plaintexts: any EndToEndMessagingProviding
    private let persistence: @MainActor @Sendable () async -> any EndToEndSignalPersisting
    private let typing: @MainActor @Sendable (EndToEndTypingSignal) -> Void
    private let now: @Sendable () -> Date

    init(
        signaling: any EndToEndSignalingProviding,
        plaintexts: any EndToEndMessagingProviding,
        persistence: @escaping @MainActor @Sendable () async -> any EndToEndSignalPersisting,
        typing: @escaping @MainActor @Sendable (EndToEndTypingSignal) -> Void,
        now: @escaping @Sendable () -> Date = { Date() }
    ) {
        self.signaling = signaling
        self.plaintexts = plaintexts
        self.persistence = persistence
        self.typing = typing
        self.now = now
    }

    /// Juge, applique et règle chaque signal en attente de `account`.
    func drain(as account: String) async {
        let pending = await signaling.pendingSignals(as: account)
        guard !pending.isEmpty else { return }
        let targetIds = Array(Set(pending.flatMap(Self.targets(of:))))
        let entries = await plaintexts.plaintexts(for: targetIds, as: account)
        let store = await persistence()
        // Une base illisible ne situe aucun message : chaque signal visé attend ou se rejette, rien ne s'applique ailleurs.
        let rows = (try? await store.conversationIds(of: targetIds)) ?? [:]
        var settled: [String] = []
        for received in pending {
            let target = received.signal.action.target.flatMap { entries[$0] }
            switch E2EESignalAuthority.verdict(for: received, localUserId: account, target: target, conversationOf: { rows[$0] }) {
            case .apply:
                if await apply(received, to: store) { settled.append(received.signalId) }
            case .reject(let reason):
                Logger.e2ee.warning("e2ee signal refused id=\(received.signalId, privacy: .public) reason=\(reason.rawValue, privacy: .public)")
                settled.append(received.signalId)
            case .awaitTarget:
                if age(of: received) > Self.awaitLimit { settled.append(received.signalId) }
            }
        }
        await signaling.settleSignals(settled, as: account)
    }

    /// Les messages qu'un signal nomme : sa cible, ou les messages d'un accusé.
    private static func targets(of received: E2EEReceivedSignal) -> [String] {
        if case .receipt(_, let targets) = received.signal.action { return targets }
        return received.signal.action.target.map { [$0] } ?? []
    }

    private func age(of received: E2EEReceivedSignal) -> TimeInterval {
        now().timeIntervalSince(Self.date(received.signal.sentAt))
    }

    private static func date(_ milliseconds: Int64) -> Date {
        Date(timeIntervalSince1970: TimeInterval(milliseconds) / 1000)
    }

    /// `false` quand la base a refusé « pas maintenant » : le signal reste en attente.
    private func apply(_ received: E2EEReceivedSignal, to store: any EndToEndSignalPersisting) async -> Bool {
        let sentAt = Self.date(received.signal.sentAt)
        do {
            switch received.signal.action {
            case .deleteForEveryone(let target):
                try await store.markDeleted(localId: target, deletedAt: sentAt, sparingOpenedViewOnce: false, expired: false, origin: .authenticated)
            case .viewOnceOpened(let target):
                try await store.markViewOnceOpened(localId: target, at: sentAt, origin: .authenticated)
            case .reaction(let target, let emoji, let removed):
                if removed {
                    try await store.removeReaction(
                        localId: target, emoji: emoji, participantId: nil, ownerUserId: received.senderUserId,
                        aggregateCount: nil, aggregateParticipantIds: nil
                    )
                } else {
                    try await store.appendReaction(
                        localId: target, reactionId: received.signalId, messageId: target, participantId: nil,
                        emoji: emoji, maxCount: nil, ownerUserId: received.senderUserId
                    )
                }
            case .pin(let target, let pinned):
                try await store.updatePinned(localId: target, pinnedAt: pinned ? sentAt : nil, pinnedBy: pinned ? received.senderUserId : nil)
            case .typing(let active):
                guard age(of: received) <= Self.typingFreshness else { return true }
                await typing(EndToEndTypingSignal(conversationId: received.conversationId, userId: received.senderUserId, active: active))
            case .edit, .receipt, .readProgress, .unknown:
                return true
            }
            return true
        } catch {
            Logger.e2ee.warning("e2ee signal not applied id=\(received.signalId, privacy: .public): \(String(describing: type(of: error)), privacy: .public)")
            return false
        }
    }
}

extension MessageSocketManager {
    /// Une frappe chiffrée reçue passe par les MÊMES sujets que `typing:start`
    /// et `typing:stop` : le fil et la liste l'affichent sans savoir d'où elle vient.
    func deliverEndToEndTyping(_ signal: EndToEndTypingSignal) {
        let event = TypingEvent(userId: signal.userId, username: "", conversationId: signal.conversationId)
        if signal.active { typingStarted.send(event) } else { typingStopped.send(event) }
    }
}
