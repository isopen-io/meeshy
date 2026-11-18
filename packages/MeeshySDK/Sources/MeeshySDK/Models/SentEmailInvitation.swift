import Foundation

/// Une invitation que J'AI envoyée par e-mail (`GET /invitations/email`, #19207).
///
/// L'adresse arrive MASQUÉE par la passerelle (`ma•••••@gmail.com`) : l'adresse complète d'un tiers ne voyage
/// jamais sur le fil, et le client n'a rien à masquer. L'ouverture se lit sur le jeton dédié de l'invitation,
/// jamais par un pixel de suivi.
public struct SentEmailInvitation: Codable, Sendable, Identifiable, Equatable {
    public let id: String
    public let maskedEmail: String
    public let sentAt: String?
    public let state: String
    public let resendsLeft: Int?
    public let canResend: Bool?
    public let nextResendAt: String?

    public init(id: String, maskedEmail: String, sentAt: String? = nil, state: String,
                resendsLeft: Int? = nil, canResend: Bool? = nil, nextResendAt: String? = nil) {
        self.id = id
        self.maskedEmail = maskedEmail
        self.sentAt = sentAt
        self.state = state
        self.resendsLeft = resendsLeft
        self.canResend = canResend
        self.nextResendAt = nextResendAt
    }

    /// L'état servi, lu en clair : `sent` (non ouverte), `opened` (ouverte, pas inscrit), `joined`.
    public var phase: SentEmailInvitationPhase { SentEmailInvitationPhase(rawValue: state) ?? .sent }

    /// La même invitation, relancée à l'instant : une relance de moins, plus de relance offerte avant le délai.
    public func resent(at sentAt: String) -> SentEmailInvitation {
        SentEmailInvitation(id: id, maskedEmail: maskedEmail, sentAt: sentAt, state: state,
                            resendsLeft: resendsLeft.map { max($0 - 1, 0) }, canResend: false, nextResendAt: nextResendAt)
    }
}

public enum SentEmailInvitationPhase: String, Sendable, Equatable {
    case sent
    case opened
    case joined
}
