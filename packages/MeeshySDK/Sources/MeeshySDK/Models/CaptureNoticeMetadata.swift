import Foundation

/// **L'avis de capture** (#9617) — « Alice a capturé l'éphémère du 07/10/2026
/// à 14:05 », « Alice a tenté de capturer un message à vue unique —
/// impossible ».
///
/// Même contrat que `JoinNoticeMetadata` : le sens voyage dans
/// `Message.metadata`, jamais dans le texte. La phrase se compose CHEZ LE
/// LECTEUR (`CaptureNoticeText.compose`), dans sa langue et son fuseau ; le
/// `content` stocké n'est qu'un repli français en UTC, rendu tel quel quand la
/// métadonnée ne se lit pas.
///
/// L'avis ne porte AUCUN contenu du message capturé : son identifiant, sa
/// nature, son heure d'envoi.
///
/// Jumeau TypeScript : `parseCaptureNotice` / `captureNoticeText`
/// (`packages/shared/utils/capture-notice.ts`) — toute évolution touche les deux.
public struct CaptureNoticeMetadata: Codable, Sendable, Equatable {

    public static let kind = "content-capture"

    /// Celui qui a capturé — l'auteur de l'avis.
    public struct Actor: Codable, Sendable, Equatable {
        public let participantId: String
        public let displayName: String
        /// Un invité sans compte — OBLIGATOIRE (audit #9617, A8) : un nom
        /// affiché n'est pas une identité, un invité peut s'appeler « Bob ».
        /// Un avis qui ne le dit pas ne se lit pas (repli sur `content`).
        public let isAnonymous: Bool
        /// Pseudo d'un inscrit ; jamais retenu pour un invité.
        public let username: String?

        public init(participantId: String, displayName: String, isAnonymous: Bool = false, username: String? = nil) {
            self.participantId = participantId
            self.displayName = displayName
            self.isAnonymous = isAnonymous
            self.username = isAnonymous ? nil : username.flatMap { $0.isEmpty ? nil : $0 }
        }

        private enum CodingKeys: String, CodingKey {
            case participantId, displayName, isAnonymous, username
        }

        public init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy: CodingKeys.self)
            participantId = try c.decode(String.self, forKey: .participantId)
            displayName = try c.decode(String.self, forKey: .displayName)
            guard !participantId.isEmpty, !displayName.isEmpty else {
                throw DecodingError.dataCorruptedError(forKey: .displayName, in: c, debugDescription: "actor incomplet")
            }
            isAnonymous = try c.decode(Bool.self, forKey: .isAnonymous)
            let rawUsername = try c.decodeIfPresent(String.self, forKey: .username)
            username = isAnonymous ? nil : rawUsername.flatMap { $0.isEmpty ? nil : $0 }
        }

        public func encode(to encoder: Encoder) throws {
            var c = encoder.container(keyedBy: CodingKeys.self)
            try c.encode(participantId, forKey: .participantId)
            try c.encode(displayName, forKey: .displayName)
            try c.encode(isAnonymous, forKey: .isAnonymous)
            try c.encodeIfPresent(username, forKey: .username)
        }
    }

    /// `blocked` : vue unique, l'image était noire — une TENTATIVE.
    /// `announced` : la capture a eu lieu.
    public enum Outcome: String, Codable, Sendable, Equatable {
        case announced
        case blocked
    }

    public let actor: Actor
    public let capturedMessageId: String
    /// Jamais `ordinary` : la capture d'un message ordinaire n'a pas d'avis.
    public let nature: ContentExitLaw.Nature
    public let outcome: Outcome
    public let captureKind: ContentCaptureKind
    /// Heure d'ENVOI du message capturé.
    public let sentAt: Date

    /// L'issue se DÉRIVE de la nature — jamais de l'appelant.
    public static func outcome(of nature: ContentExitLaw.Nature) -> Outcome {
        nature == .viewOnce ? .blocked : .announced
    }

    public init(actor: Actor, capturedMessageId: String, nature: ContentExitLaw.Nature, captureKind: ContentCaptureKind, sentAt: Date) {
        self.actor = actor
        self.capturedMessageId = capturedMessageId
        self.nature = nature
        self.outcome = Self.outcome(of: nature)
        self.captureKind = captureKind
        self.sentAt = sentAt
    }

    private enum CodingKeys: String, CodingKey {
        case kind, actor, capturedMessageId, nature, outcome, captureKind, sentAt
    }

    /// VALIDE plutôt que caste, comme `parseCaptureNotice` : `metadata` est
    /// partagé par toutes les familles d'avis, et une issue qui contredit la
    /// nature (vue unique « annoncée », flamme « bloquée ») est une forme
    /// fausse, pas un avis.
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        let kind = try c.decodeIfPresent(String.self, forKey: .kind)
        guard kind == Self.kind else {
            throw DecodingError.dataCorruptedError(forKey: .kind, in: c, debugDescription: "metadata.kind is not '\(Self.kind)'")
        }
        actor = try c.decode(Actor.self, forKey: .actor)
        capturedMessageId = try c.decode(String.self, forKey: .capturedMessageId)
        nature = try c.decode(ContentExitLaw.Nature.self, forKey: .nature)
        outcome = try c.decode(Outcome.self, forKey: .outcome)
        captureKind = try c.decode(ContentCaptureKind.self, forKey: .captureKind)
        let rawSentAt = try c.decode(String.self, forKey: .sentAt)
        guard !capturedMessageId.isEmpty, nature != .ordinary, outcome == Self.outcome(of: nature),
              let sentAt = Self.instant(rawSentAt) else {
            throw DecodingError.dataCorruptedError(forKey: .outcome, in: c, debugDescription: "avis de capture incohérent")
        }
        self.sentAt = sentAt
    }

    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(Self.kind, forKey: .kind)
        try c.encode(actor, forKey: .actor)
        try c.encode(capturedMessageId, forKey: .capturedMessageId)
        try c.encode(nature, forKey: .nature)
        try c.encode(outcome, forKey: .outcome)
        try c.encode(captureKind, forKey: .captureKind)
        try c.encode(Self.isoFormatter(fractional: true).string(from: sentAt), forKey: .sentAt)
    }

    /// L'instant ISO 8601, secondes fractionnaires ou non — indépendant de la
    /// stratégie de date du décodeur appelant (REST, socket ou GRDB).
    static func instant(_ raw: String) -> Date? {
        isoFormatter(fractional: true).date(from: raw) ?? isoFormatter(fractional: false).date(from: raw)
    }

    private static func isoFormatter(fractional: Bool) -> ISO8601DateFormatter {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = fractional ? [.withInternetDateTime, .withFractionalSeconds] : [.withInternetDateTime]
        return formatter
    }
}
