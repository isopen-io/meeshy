import Foundation

/// La séance ouverte, vue par CE compte : l'autre est l'invité quand je suis l'hôte, l'hôte sinon.
public struct TogetherSession: Sendable, Equatable {
    public let started: TogetherStarted
    public let partnerId: String
    public internal(set) var playback: TogetherPlayback

    public var sessionId: String { started.sessionId }
}

/// Une invitation reçue, et l'instant (horloge de l'APPAREIL) où elle l'a été.
public struct TogetherInvitation: Sendable, Equatable {
    public let invited: TogetherInvited
    public let receivedAt: Date

    public var sessionId: String { invited.sessionId }

    /// Elle s'éteint `TogetherContract.inviteTTL` après sa réception, jamais à `expiresAt`.
    public var deadline: Date { receivedAt.addingTimeInterval(TogetherContract.inviteTTL) }
}

/// Une invitation envoyée, qui attend que l'autre rejoigne.
public struct TogetherOutgoing: Sendable, Equatable {
    public let sessionId: String
    public let toUserId: String
    public let media: TogetherMediaKind

    public init(sessionId: String, toUserId: String, media: TogetherMediaKind) {
        self.sessionId = sessionId
        self.toUserId = toUserId
        self.media = media
    }
}

/// L'ÉTAT D'« ENSEMBLE » SUR CET APPAREIL (#17097) — portage de `createTogetherStore`
/// (`apps/web/src/lib/together/together-live.ts`), en valeur : chaque événement rend l'état suivant.
///
/// - `invited` propose ; `started` ouvre la séance chez l'hôte et l'invité, et retire l'invitation ou l'attente qui la
///   portait ; `synced` fait suivre la lecture (un `rev` déjà appliqué ne rejoue rien) ; `ended` ferme.
/// - Une séance close ne se rouvre pas sur un événement en retard : sa trace est gardée, bornée.
/// - Chaque `at` reçu mesure l'écart entre l'horloge du serveur et celle de l'appareil.
public struct TogetherState: Sendable, Equatable {
    public private(set) var invitation: TogetherInvitation?
    public private(set) var outgoing: TogetherOutgoing?
    public private(set) var session: TogetherSession?
    /// Horloge du serveur − horloge de l'appareil (ms), ou `nil` avant tout échantillon.
    public private(set) var clockOffsetMs: Double?
    private var closed: [String] = []

    static let closedMemory = 32

    public init() {}

    public func invited(_ data: TogetherInvited, viewerId: String?, at now: Date) -> TogetherState {
        guard data.fromUserId != viewerId, !closed.contains(data.sessionId) else { return self }
        var next = self
        next.invitation = TogetherInvitation(invited: data, receivedAt: now)
        return next
    }

    public func waiting(_ outgoing: TogetherOutgoing) -> TogetherState {
        guard !closed.contains(outgoing.sessionId) else { return self }
        var next = self
        next.outgoing = outgoing
        return next
    }

    public func started(_ data: TogetherStarted, viewerId: String?, at now: Date) -> TogetherState {
        guard !closed.contains(data.sessionId), let viewerId, let partnerId = data.partner(of: viewerId) else { return self }
        var next = self
        next.session = TogetherSession(started: data, partnerId: partnerId, playback: data.playback)
        if invitation?.sessionId == data.sessionId { next.invitation = nil }
        if outgoing?.sessionId == data.sessionId { next.outgoing = nil }
        next.clockOffsetMs = measured(serverAt: data.playback.at, now: now)
        return next
    }

    public func synced(_ data: TogetherSynced, at now: Date) -> TogetherState {
        guard var current = session, current.sessionId == data.sessionId, data.playback.rev > current.playback.rev else { return self }
        current.playback = data.playback
        var next = self
        next.session = current
        next.clockOffsetMs = measured(serverAt: data.playback.at, now: now)
        return next
    }

    /// Ferme la séance, l'invitation ou l'attente `sessionId` ICI ; elle ne se rouvrira pas.
    public func ended(_ sessionId: String) -> TogetherState {
        var next = self
        next.closed = Array((closed.filter { $0 != sessionId } + [sessionId]).suffix(Self.closedMemory))
        if session?.sessionId == sessionId { next.session = nil }
        if invitation?.sessionId == sessionId { next.invitation = nil }
        if outgoing?.sessionId == sessionId { next.outgoing = nil }
        return next
    }

    /// L'invitation sans réponse passé son terme s'éteint.
    public func expiringInvitation(at now: Date) -> TogetherState {
        guard let invitation, now > invitation.deadline else { return self }
        return ended(invitation.sessionId)
    }

    private func measured(serverAt: Double, now: Date) -> Double {
        TogetherSync.estimateClockOffset(current: clockOffsetMs, serverAt: serverAt, localAt: now.timeIntervalSince1970 * 1000)
    }
}
