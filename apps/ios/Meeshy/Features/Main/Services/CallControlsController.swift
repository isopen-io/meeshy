import Combine
import Foundation
import MeeshySDK
import os

// #8433 · #8438 · #8439 — les contrôles d'un appel EN COURS, côté app :
// inviter un ami, modérer (couper un micro, retirer), réagir. La passerelle
// est l'autorité (`services/gateway/src/socketio/call-*-events.ts`) : ce
// contrôleur montre tout de suite ce que le geste promet, et le reprend si
// l'accusé le refuse. Il vit hors de l'écran d'appel : un micro coupé par
// l'admin se coupe aussi quand l'appel est réduit en PiP.

/// Ce que le contrôleur lit de l'appel en cours, et le seul geste qu'il y fait.
protocol CallControlsHosting: AnyObject {
    var controlsCallId: String? { get }
    /// Coupe MON micro par le chemin ordinaire (CallKit, pairs, interface).
    func applyModeratorMute()
    func participantName(for userId: String) -> String
}

/// L'admin d'un appel : celui qui l'a lancé, ou un modérateur (et plus) de la
/// conversation. Jamais soi-même. Miroir CLIENT de `mayModerateCallParticipant`
/// (passerelle) : il ne décide que de ce qu'on MONTRE, la passerelle tranche
/// (rang égal ou supérieur de la cible compris).
nonisolated struct CallModerationRule: Equatable, Sendable {
    static let moderatorRoles: Set<String> = ["moderator", "admin", "creator"]

    let isActiveInitiator: Bool
    let conversationRole: String?

    var isAdmin: Bool {
        isActiveInitiator || conversationRole.map { Self.moderatorRoles.contains($0.lowercased()) } == true
    }

    func mayModerate(targetUserId: String, viewerId: String?) -> Bool {
        isAdmin && targetUserId != viewerId
    }
}

struct CallPendingInvite: Equatable, Identifiable, Sendable {
    let userId: String
    let displayName: String
    let avatar: String?

    var id: String { userId }

    init(_ user: CallInvitedUser) {
        userId = user.userId
        displayName = user.displayName ?? user.username
        avatar = user.avatar
    }
}

/// Qui a lancé une réaction : la capsule sous l'emoji le dit (miroir de
/// `CallReactionBursts`, web).
enum CallReactionAuthor: Equatable, Sendable {
    case me
    case peer(name: String)
    case someone
}

struct CallFloatingReaction: Equatable, Identifiable, Sendable {
    let id: UUID
    let emoji: CallReactionEmoji
    let author: CallReactionAuthor
    /// Position horizontale relative (0…1) : les réactions simultanées ne se
    /// superposent pas.
    let lane: Double
}

enum CallControlsNotice: Equatable, Sendable {
    case mutedBy(name: String)
    case inviteFailed(code: String)
    case actionFailed(code: String)
    case removed(name: String)
}

final class CallControlsController: ObservableObject {
    static let shared = CallControlsController()

    static let reactionsPerSecond = 5
    static let reactionFlightNs: UInt64 = 2_500_000_000

    @Published private(set) var invites: [CallPendingInvite] = []
    @Published private(set) var reactions: [CallFloatingReaction] = []
    @Published private(set) var notice: CallControlsNotice?
    @Published private(set) var moderation = CallModerationRule(isActiveInitiator: false, conversationRole: nil)

    weak var host: (any CallControlsHosting)?

    private let socket: any CallControlsSocketProviding
    private let remote: any CallModerationRemoteServiceProviding
    private let viewerId: () -> String?
    private let now: () -> Date
    private let wait: @MainActor (UInt64) async -> Void
    private var sentReactionTimes: [Date] = []
    private var subscription: AnyCancellable?
    private var changeForwarding: AnyCancellable?
    private(set) var pendingExpiry: Task<Void, Never>?
    private let logger = Logger(subsystem: "me.meeshy.app", category: "call-controls")

    nonisolated deinit {}

    init(
        socket: (any CallControlsSocketProviding)? = nil,
        remote: (any CallModerationRemoteServiceProviding)? = nil,
        viewerId: (() -> String?)? = nil,
        now: (() -> Date)? = nil,
        wait: (@MainActor (UInt64) async -> Void)? = nil,
        events: AnyPublisher<CallControlSocketEvent, Never>? = nil
    ) {
        let resolvedSocket = socket ?? MessageSocketManager.shared
        self.socket = resolvedSocket
        self.remote = remote ?? CallModerationRemoteService.shared
        self.viewerId = viewerId ?? { AuthManager.shared.currentUser?.id }
        self.now = now ?? Date.init
        self.wait = wait ?? { try? await Task.sleep(nanoseconds: $0) }
        subscription = (events ?? resolvedSocket.callControlEvents)
            .receive(on: DispatchQueue.main)
            .sink { [weak self] event in self?.receive(event) }
    }

    var viewer: String? { viewerId() }

    /// L'écran d'appel n'observe que `CallManager` : ses changements le
    /// redessinent (même relais que l'enregistrement).
    func forwardChanges(to publisher: ObservableObjectPublisher) {
        changeForwarding = objectWillChange.sink { [weak publisher] _ in publisher?.send() }
    }

    // MARK: - Diffusions

    func receive(_ event: CallControlSocketEvent) {
        guard let callId = host?.controlsCallId, event.callId == callId else { return }
        switch event {
        case .participantInvited(let invited):
            addInvite(CallPendingInvite(invited.invitee))
        case .mutedByModerator(let muted):
            host?.applyModeratorMute()
            notice = .mutedBy(name: host?.participantName(for: muted.byUserId) ?? "")
        case .reactionReceived(let reaction):
            show(reaction.emoji, by: author(of: reaction.userId))
        }
    }

    /// Un invité qui a décroché rejoint la grille : sa tuile « sonne » s'en va.
    func rosterChanged(memberIds: Set<String>) {
        invites = invites.filter { !memberIds.contains($0.userId) }
    }

    func updateModeration(_ rule: CallModerationRule) {
        moderation = rule
    }

    // MARK: - Gestes

    @discardableResult
    func invite(_ user: CallInvitedUser) -> Task<Void, Never>? {
        guard let callId = host?.controlsCallId, !invites.contains(where: { $0.userId == user.userId }) else { return nil }
        addInvite(CallPendingInvite(user))
        notice = nil
        return Task { [weak self] in
            guard let self else { return }
            do {
                try await socket.inviteCallParticipant(callId: callId, userId: user.userId)
            } catch {
                invites = invites.filter { $0.userId != user.userId }
                notice = .inviteFailed(code: Self.code(of: error))
            }
        }
    }

    @discardableResult
    func mute(targetUserId: String) -> Task<Void, Never>? {
        guard let callId = host?.controlsCallId else { return nil }
        return Task { [weak self] in
            guard let self else { return }
            do {
                try await socket.muteCallParticipant(callId: callId, targetUserId: targetUserId)
            } catch {
                notice = .actionFailed(code: Self.code(of: error))
            }
        }
    }

    @discardableResult
    func remove(participantId: String) -> Task<Void, Never>? {
        guard let callId = host?.controlsCallId else { return nil }
        let name = host?.participantName(for: participantId) ?? ""
        return Task { [weak self] in
            guard let self else { return }
            do {
                try await remote.removeParticipant(callId: callId, participantId: participantId)
                notice = .removed(name: name)
            } catch {
                notice = .actionFailed(code: Self.code(of: error))
            }
        }
    }

    /// Au plus `reactionsPerSecond` envois sur une seconde glissante : au-delà,
    /// le geste est ignoré (ni affiché ni envoyé), comme la passerelle le ferait.
    @discardableResult
    func react(_ emoji: CallReactionEmoji) -> Task<Void, Never>? {
        guard let callId = host?.controlsCallId else { return nil }
        let instant = now()
        let recent = sentReactionTimes.filter { instant.timeIntervalSince($0) < 1 }
        guard recent.count < Self.reactionsPerSecond else { return nil }
        sentReactionTimes = recent + [instant]
        show(emoji, by: .me)
        return Task { [weak self] in
            do {
                try await self?.socket.sendCallReaction(callId: callId, emoji: emoji)
            } catch {
                self?.logger.error("call reaction refused: \(String(describing: error))")
            }
        }
    }

    func dismissNotice() {
        notice = nil
    }

    func callEnded() {
        invites = []
        reactions = []
        notice = nil
        sentReactionTimes = []
        moderation = CallModerationRule(isActiveInitiator: false, conversationRole: nil)
    }

    // MARK: - Privé

    private func addInvite(_ invite: CallPendingInvite) {
        guard !invites.contains(where: { $0.userId == invite.userId }) else { return }
        invites.append(invite)
    }

    private func author(of userId: String) -> CallReactionAuthor {
        guard userId != viewerId() else { return .me }
        let name = host?.participantName(for: userId) ?? ""
        return name.isEmpty ? .someone : .peer(name: name)
    }

    private func show(_ emoji: CallReactionEmoji, by author: CallReactionAuthor) {
        let reaction = CallFloatingReaction(id: UUID(), emoji: emoji, author: author, lane: Double.random(in: 0.15...0.85))
        reactions.append(reaction)
        pendingExpiry = Task { [weak self] in
            guard let self else { return }
            await wait(Self.reactionFlightNs)
            reactions = reactions.filter { $0.id != reaction.id }
        }
    }

    private static func code(of error: Error) -> String {
        if let refusal = error as? CallControlRefusal { return refusal.code }
        if case APIError.serverError(let status, _) = error { return status == 403 ? "PERMISSION_DENIED" : "INTERNAL_ERROR" }
        return "INTERNAL_ERROR"
    }
}

/// #8433 — le nom qu'affichent l'écran entrant et CallKit : l'invitation dit
/// QUI m'invite, jamais seulement qui a lancé l'appel.
enum CallOfferPresentation {
    static func callerName(initiator: String, inviter: String?) -> String {
        guard let inviter, !inviter.isEmpty else { return initiator }
        return String(format: CallControlsCopy.invitedFormat, inviter)
    }
}
