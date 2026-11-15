import Foundation

// REGARDER OU ÉCOUTER ENSEMBLE (#17011) — deux Proches lisent la même pièce jointe audio ou vidéo d'une conversation
// qu'ils partagent, en lecture synchronisée. Le contrat est `packages/shared/types/together.ts` ; ce fichier en est la
// lecture Swift (#17097, iso `apps/web/src/lib/together/together-live.ts`). Le client ne rejuge AUCUNE règle (niveau,
// conversation commune, média protégé) : la passerelle a jugé, et un refus se dit par son issue, jamais par sa raison.

public enum TogetherContract {
    /// `TOGETHER_INVITE_TTL_SECONDS` : une invitation non acceptée s'éteint au bout de 2 minutes, comptées ICI depuis
    /// sa réception (jamais à `expiresAt`, qu'une horloge décalée fausserait).
    public static let inviteTTL: TimeInterval = 120
    /// `TOGETHER_MAX_POSITION_MS` : une position au-delà de 24 h n'est pas un média de conversation.
    public static let maxPositionMs: Double = 24 * 60 * 60 * 1000
}

/// Le média lu ensemble. Un genre qu'un serveur plus récent ajouterait ne s'ouvre pas ici.
public enum TogetherMediaKind: String, Sendable, Equatable, Decodable {
    case audio
    case video
}

/// `left` : l'un a quitté (ou la séance a été coupée, dite comme un départ) · `declined` : l'invité a refusé ·
/// `replaced` : une nouvelle invitation de la paire remplace celle-ci.
public enum TogetherEndReason: String, Sendable, Equatable, Decodable {
    case left
    case declined
    case replaced
}

/// L'état de lecture partagé. `at` : horloge du SERVEUR (ms epoch) quand la position valait `positionMs`.
public struct TogetherPlayback: Decodable, Sendable, Equatable {
    public let playing: Bool
    public let positionMs: Double
    public let at: Double
    /// Croît à chaque synchronisation : un `rev` déjà appliqué ne rejoue rien.
    public let rev: Int
    public let byUserId: String

    public init(playing: Bool, positionMs: Double, at: Double, rev: Int, byUserId: String) {
        self.playing = playing
        self.positionMs = positionMs
        self.at = at
        self.rev = rev
        self.byUserId = byUserId
    }

    private enum CodingKeys: String, CodingKey { case playing, positionMs, at, rev, byUserId }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        playing = try c.decode(Bool.self, forKey: .playing)
        positionMs = try TogetherWire.count(c, .positionMs)
        at = try TogetherWire.count(c, .at)
        rev = Int(try TogetherWire.count(c, .rev))
        byUserId = try TogetherWire.text(c, .byUserId)
    }
}

/// `together:invited` — chez l'invité. Aucun nom ne voyage : l'écran l'hydrate par ses caches.
public struct TogetherInvited: Decodable, Sendable, Equatable {
    public let sessionId: String
    public let fromUserId: String
    public let conversationId: String
    public let attachmentId: String
    public let media: TogetherMediaKind
    public let expiresAt: String

    public init(sessionId: String, fromUserId: String, conversationId: String, attachmentId: String, media: TogetherMediaKind, expiresAt: String) {
        self.sessionId = sessionId
        self.fromUserId = fromUserId
        self.conversationId = conversationId
        self.attachmentId = attachmentId
        self.media = media
        self.expiresAt = expiresAt
    }

    private enum CodingKeys: String, CodingKey { case sessionId, fromUserId, conversationId, attachmentId, media, expiresAt }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        sessionId = try TogetherWire.text(c, .sessionId)
        fromUserId = try TogetherWire.text(c, .fromUserId)
        conversationId = try TogetherWire.text(c, .conversationId)
        attachmentId = try TogetherWire.text(c, .attachmentId)
        media = try c.decode(TogetherMediaKind.self, forKey: .media)
        expiresAt = try TogetherWire.text(c, .expiresAt)
    }
}

/// `together:started` — chez l'hôte ET l'invité, tous appareils ; c'est aussi la charge de l'accusé de `join`.
public struct TogetherStarted: Decodable, Sendable, Equatable {
    public let sessionId: String
    public let hostUserId: String
    public let guestUserId: String
    public let conversationId: String
    public let attachmentId: String
    public let media: TogetherMediaKind
    public let playback: TogetherPlayback

    public init(sessionId: String, hostUserId: String, guestUserId: String, conversationId: String, attachmentId: String, media: TogetherMediaKind, playback: TogetherPlayback) {
        self.sessionId = sessionId
        self.hostUserId = hostUserId
        self.guestUserId = guestUserId
        self.conversationId = conversationId
        self.attachmentId = attachmentId
        self.media = media
        self.playback = playback
    }

    private enum CodingKeys: String, CodingKey { case sessionId, hostUserId, guestUserId, conversationId, attachmentId, media, playback }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        sessionId = try TogetherWire.text(c, .sessionId)
        hostUserId = try TogetherWire.text(c, .hostUserId)
        guestUserId = try TogetherWire.text(c, .guestUserId)
        conversationId = try TogetherWire.text(c, .conversationId)
        attachmentId = try TogetherWire.text(c, .attachmentId)
        media = try c.decode(TogetherMediaKind.self, forKey: .media)
        playback = try c.decode(TogetherPlayback.self, forKey: .playback)
    }

    /// L'autre de la séance vu par `viewerId` : l'invité quand je suis l'hôte, l'hôte sinon ; `nil` si je n'en suis pas.
    public func partner(of viewerId: String) -> String? {
        if hostUserId == viewerId { return guestUserId }
        if guestUserId == viewerId { return hostUserId }
        return nil
    }
}

/// `together:synced` — lecture, pause ou déplacement, horodatés par le serveur.
public struct TogetherSynced: Decodable, Sendable, Equatable {
    public let sessionId: String
    public let playback: TogetherPlayback

    public init(sessionId: String, playback: TogetherPlayback) {
        self.sessionId = sessionId
        self.playback = playback
    }

    private enum CodingKeys: String, CodingKey { case sessionId, playback }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        sessionId = try TogetherWire.text(c, .sessionId)
        playback = try c.decode(TogetherPlayback.self, forKey: .playback)
    }
}

/// `together:ended` — chez les deux. Une raison inconnue rend la charge illisible, comme sur le web.
public struct TogetherEnded: Decodable, Sendable, Equatable {
    public let sessionId: String
    public let reason: TogetherEndReason
    public let endedAt: String

    public init(sessionId: String, reason: TogetherEndReason, endedAt: String) {
        self.sessionId = sessionId
        self.reason = reason
        self.endedAt = endedAt
    }

    private enum CodingKeys: String, CodingKey { case sessionId, reason, endedAt }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        sessionId = try TogetherWire.text(c, .sessionId)
        reason = try c.decode(TogetherEndReason.self, forKey: .reason)
        endedAt = try TogetherWire.text(c, .endedAt)
    }
}

/// Les lectures strictes d'une charge : un texte vide ou un nombre négatif ou non fini rend la charge illisible.
enum TogetherWire {
    static func text<K: CodingKey>(_ c: KeyedDecodingContainer<K>, _ key: K) throws -> String {
        let value = try c.decode(String.self, forKey: key)
        guard !value.isEmpty else {
            throw DecodingError.dataCorruptedError(forKey: key, in: c, debugDescription: "vide")
        }
        return value
    }

    static func count<K: CodingKey>(_ c: KeyedDecodingContainer<K>, _ key: K) throws -> Double {
        let value = try c.decode(Double.self, forKey: key)
        guard value.isFinite, value >= 0 else {
            throw DecodingError.dataCorruptedError(forKey: key, in: c, debugDescription: "hors bornes")
        }
        return value
    }
}

// MARK: - Les issues d'un geste

/// Ce que l'interface dit d'une invitation. Un refus se dit par son issue, jamais par sa raison.
public enum TogetherInviteOutcome: Sendable, Equatable {
    case invited(sessionId: String, media: TogetherMediaKind)
    case notAllowed
    case rateLimited
    case offline
    case failed

    static func read(_ ack: SocketAck<TogetherInvitedWire>) -> TogetherInviteOutcome {
        switch ack {
        case .accepted(let wire):
            guard !wire.sessionId.isEmpty, let media = wire.media.flatMap(TogetherMediaKind.init(rawValue:)) else { return .failed }
            return .invited(sessionId: wire.sessionId, media: media)
        case .acceptedWithoutPayload, .undecodable:
            return .failed
        case .refused(let refusal):
            switch refusal.code {
            case "TOGETHER_NOT_ALLOWED": return .notAllowed
            case "TOGETHER_RATE_LIMITED": return .rateLimited
            default: return .failed
            }
        case .timedOut:
            return .offline
        }
    }
}

/// `data` de l'accusé de `together:invite`.
struct TogetherInvitedWire: Decodable, Sendable, Equatable {
    let sessionId: String
    let media: String?
}

/// Ce que l'interface dit d'un « Rejoindre ». `gone` : l'invitation n'est plus valable (finie, expirée, coupée) — dite
/// sans sa raison.
public enum TogetherJoinOutcome: Sendable, Equatable {
    case joined(TogetherStarted)
    case gone
    case offline
    case failed

    static func read(_ ack: SocketAck<TogetherStarted>) -> TogetherJoinOutcome {
        switch ack {
        case .accepted(let started):
            return .joined(started)
        case .acceptedWithoutPayload, .undecodable:
            return .failed
        case .refused(let refusal):
            return ["TOGETHER_NOT_FOUND", "TOGETHER_NOT_ALLOWED"].contains(refusal.code ?? "") ? .gone : .failed
        case .timedOut:
            return .offline
        }
    }
}

/// `data` de l'accusé de `together:sync` : l'état que le serveur a retenu.
struct TogetherSyncAckWire: Decodable, Sendable, Equatable {
    let playback: TogetherPlayback
}
