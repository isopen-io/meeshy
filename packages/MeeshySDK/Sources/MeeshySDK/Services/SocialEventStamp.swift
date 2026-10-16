import Foundation
import CryptoKit

// MARK: - Un événement rejoué n'est compté qu'une fois, daté de son occurrence (#10500)
//
// La passerelle déduplique un événement de comptage par son `eventId` et le
// date par `occurredAt` (corrigé du décalage d'horloge par `context.sentAt`).
// L'enveloppe se pose QUAND l'événement arrive — jamais à l'envoi — et voyage
// avec lui dans chaque file : une tentative 2, 3… renvoie le même `eventId`.
// Champs additifs : un serveur antérieur les supprime sans erreur.

/// L'enveloppe d'un événement de comptage.
public struct SocialEventStamp: Codable, Sendable, Equatable, Hashable {
    public let eventId: String
    /// `nil` quand l'heure n'est pas connue (file écrite avant #10500) : la
    /// passerelle date alors l'événement à sa réception.
    public let occurredAt: Date?

    public init(eventId: String, occurredAt: Date?) {
        self.eventId = eventId
        self.occurredAt = occurredAt
    }

    /// Une enveloppe neuve : identifiant unique, heure de l'occurrence.
    public static func minted(at occurredAt: Date?, newId: () -> String = SocialEventV2.newEventId) -> SocialEventStamp {
        SocialEventStamp(eventId: newId(), occurredAt: occurredAt)
    }

    /// Une session de consommation porte déjà un identifiant persisté : c'est
    /// lui qui fait foi d'une tentative à l'autre, et la session a eu lieu à
    /// sa FIN (`startedAt + dwellMs`), pas quand la file s'est vidée.
    public static func of(_ session: EngagementSession) -> SocialEventStamp {
        SocialEventStamp(
            eventId: stableEventId(from: session.sessionId),
            occurredAt: session.startedAt.addingTimeInterval(Double(max(0, session.dwellMs)) / 1_000)
        )
    }

    /// Le premier contact d'une session (#10764) : un identifiant stable mais
    /// DISTINCT de celui de la mesure finale (le reçu de rejeu ne doit pas
    /// confondre les deux réceptions), daté du début de la séance.
    public static func startOf(_ session: EngagementSession) -> SocialEventStamp {
        SocialEventStamp(eventId: stableEventId(from: "dwell-start:" + session.sessionId), occurredAt: session.startedAt)
    }

    /// Un identifiant d'événement STABLE dérivé d'une clé durable (identifiant
    /// de séance, `cmid_<uuid>` d'une file hors ligne) : la même clé rend
    /// toujours le même UUID. Une clé qui n'est pas un UUID est hachée.
    public static func stableEventId(from key: String) -> String {
        let candidates = [key, key.split(separator: "_", maxSplits: 1).last.map(String.init) ?? key]
        if let uuid = candidates.lazy.compactMap({ UUID(uuidString: $0) }).first {
            return uuid.uuidString.lowercased()
        }
        let digest = Array(SHA256.hash(data: Data(key.utf8)))
        let bytes = digest.prefix(16).enumerated().map { index, byte -> UInt8 in
            switch index {
            case 6: return (byte & 0x0F) | 0x50
            case 8: return (byte & 0x3F) | 0x80
            default: return byte
            }
        }
        let hex = bytes.map { String(format: "%02x", $0) }.joined()
        let parts = [hex.prefix(8), hex.dropFirst(8).prefix(4), hex.dropFirst(12).prefix(4), hex.dropFirst(16).prefix(4), hex.dropFirst(20)]
        return parts.map(String.init).joined(separator: "-")
    }

    enum CodingKeys: String, CodingKey {
        case eventId, occurredAt
    }

    /// `occurredAt` part en chaîne ISO 8601, quel que soit l'encodeur : la
    /// passerelle refuserait un nombre, et les files persistées n'ont pas
    /// toutes la même stratégie de dates.
    public func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(eventId, forKey: .eventId)
        try container.encodeIfPresent(occurredAt.map(WireDate.string(from:)), forKey: .occurredAt)
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        self.eventId = try container.decode(String.self, forKey: .eventId)
        self.occurredAt = Self.decodedDate(in: container)
    }

    /// Une heure illisible se lit comme absente, jamais comme une erreur.
    static func decodedDate(in container: KeyedDecodingContainer<CodingKeys>) -> Date? {
        guard let text = (try? container.decodeIfPresent(String.self, forKey: .occurredAt)) ?? nil else { return nil }
        return WireDate.date(from: text)
    }
}

/// Un événement de comptage et son enveloppe — la forme sous laquelle il vit
/// dans une file et part sur le fil.
///
/// Sur le fil, l'enveloppe est APLATIE dans l'événement (`eventId`,
/// `occurredAt` à côté de `type` et `postId`). Le décodage est TOLÉRANT : un
/// événement écrit avant #10500 (sans enveloppe) reçoit un identifiant neuf —
/// celui de sa séance pour un `dwell` — et une heure absente.
public struct StampedSocialEvent: Codable, Sendable, Equatable {
    public let event: SocialEvent
    public let stamp: SocialEventStamp

    public init(event: SocialEvent, stamp: SocialEventStamp) {
        self.event = event
        self.stamp = stamp
    }

    /// L'enveloppe posée À LA CRÉATION de l'événement. Un `dwell` garde
    /// l'identité et l'heure de sa séance.
    public static func stamping(
        _ event: SocialEvent,
        at occurredAt: Date,
        newId: () -> String = SocialEventV2.newEventId
    ) -> StampedSocialEvent {
        if case .dwell(let session) = event {
            return StampedSocialEvent(event: event, stamp: .of(session))
        }
        if case .dwellStart(let session) = event {
            return StampedSocialEvent(event: event, stamp: .startOf(session))
        }
        return StampedSocialEvent(event: event, stamp: .minted(at: occurredAt, newId: newId))
    }

    public var postId: String { event.postId }
    public var isOpen: Bool { event.isOpen }

    public func encode(to encoder: Encoder) throws {
        try event.encode(to: encoder)
        try stamp.encode(to: encoder)
    }

    public init(from decoder: Decoder) throws {
        let event = try SocialEvent(from: decoder)
        let container = try decoder.container(keyedBy: SocialEventStamp.CodingKeys.self)
        let eventId = (try? container.decodeIfPresent(String.self, forKey: .eventId)) ?? nil
        self.event = event
        switch (eventId, event) {
        case (let id?, _):
            self.stamp = SocialEventStamp(eventId: id, occurredAt: SocialEventStamp.decodedDate(in: container))
        case (nil, .dwell(let session)):
            self.stamp = .of(session)
        case (nil, _):
            self.stamp = .minted(at: nil)
        }
    }
}
