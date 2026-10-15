import Foundation

// MARK: - Le fil v2 : une requête à part, un refus qui n'emporte qu'elle (#10500)
//
// Un serveur antérieur (#10491, dev, main) lit `events` comme une union
// DISCRIMINÉE et refuse en 400 tout lot portant un `type` inconnu. Les
// événements v2 partent donc dans LEUR requête, jamais avec un comptage. Sur
// un 400, ils sont jetés sans rejeu et la file v2 dort une heure (ou jusqu'au
// prochain démarrage à froid : le sommeil n'est pas persisté).

public enum SocialEventsV2Wire {
    /// Plafond du schéma : 200 événements par lot. La cadence v2 en envoie 50.
    public static let maxEventsPerRequest = 200
    public static let batchSize = 50
    /// Un événement sérialisé tient en 2 Kio ; au-delà il ne part pas.
    public static let maxEventBytes = 2_048
    /// Au-delà de 72 h, la passerelle l'ignorerait : il ne part pas.
    public static let maxAge: TimeInterval = 72 * 3_600

    public static func isoString(_ date: Date) -> String { WireDate.string(from: date) }

    public static func date(fromISO text: String) -> Date? { WireDate.date(from: text) }

    /// Une fraction 0…1 à deux décimales.
    public static func fraction(_ value: Double) -> Double {
        guard value.isFinite else { return 0 }
        return (min(1, max(0, value)) * 100).rounded() / 100
    }

    /// Un événement encodé, prêt à rester en file. `nil` s'il dépasse 2 Kio.
    public static func encode(_ event: SocialEventV2) throws -> Data? {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys]
        let data = try encoder.encode(event)
        return data.count <= maxEventBytes ? data : nil
    }

    /// Le corps `{ context, events }` à partir d'événements DÉJÀ encodés : le
    /// contexte est écrit une fois, et chaque événement garde à l'octet près
    /// ce qui a été mis en file (même `eventId` au rejeu).
    public static func body(context: SocialEventContext, events: [Data]) throws -> Data {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys]
        var body = Data(#"{"context":"#.utf8)
        body.append(try encoder.encode(context))
        body.append(Data(#","events":["#.utf8))
        for (index, event) in events.enumerated() {
            if index > 0 { body.append(Data(",".utf8)) }
            body.append(event)
        }
        body.append(Data("]}".utf8))
        return body
    }
}

/// La réponse étendue de la porte. Un serveur antérieur ne rend que
/// `recorded` et `rejected` : le reste est facultatif.
public struct SocialEventsV2Receipt: Decodable, Sendable, Equatable {
    public let recorded: Int
    public let rejected: Int
    public let ignored: Int?
    public let accepts: [String]?
    public let sampling: [String: Double]?

    public init(recorded: Int, rejected: Int, ignored: Int? = nil, accepts: [String]? = nil, sampling: [String: Double]? = nil) {
        self.recorded = recorded
        self.rejected = rejected
        self.ignored = ignored
        self.accepts = accepts
        self.sampling = sampling
    }

    /// Le serveur sait-il lire ce type ? Sans annonce, on suppose oui : seul un
    /// 400 dira le contraire.
    public func accepts(type: String) -> Bool {
        accepts.map { $0.contains(type) } ?? true
    }
}

/// Le sommeil de la file v2 après un refus de forme (400).
public struct SocialEventsV2Gate: Sendable, Equatable {
    public static let sleepAfterRefusal: TimeInterval = 3_600

    public private(set) var sleepingUntil: Date?

    public init() {}

    public func isOpen(at now: Date) -> Bool {
        sleepingUntil.map { now >= $0 } ?? true
    }

    public mutating func noteRefused(at now: Date) {
        sleepingUntil = now.addingTimeInterval(Self.sleepAfterRefusal)
    }
}

/// Ce qu'un envoi v2 a donné — ce qui décide du sort des lignes en file.
public enum SocialEventsV2Outcome: Sendable, Equatable {
    /// Accepté (même partiellement) : on retire.
    case delivered(SocialEventsV2Receipt)
    /// Le serveur ne sait pas lire la v2 (400) : on retire SANS rejeu et on dort.
    case unsupported
    /// Refus définitif hors forme (401, 403, 4xx) : on retire.
    case refused
    /// Panne de réseau, 5xx, 408, 429 : on rejouera, même `eventId`.
    case transient
}

public enum SocialEventsV2Dispatch {

    public static func outcome(of error: Error) -> SocialEventsV2Outcome {
        if case .server(400, _)? = error as? MeeshyError { return .unsupported }
        if case .serverError(400, _)? = error as? APIError { return .unsupported }
        return SocialEventsDispatch.isPermanentRefusal(error) ? .refused : .transient
    }

    /// Envoie des événements déjà encodés sous une identité, avec le contexte
    /// restreint à ce que cette identité a le droit de porter.
    public static func deliver(
        _ events: [Data],
        context: SocialEventContext,
        credential: SocialEventsCredential,
        sentAt: Date,
        through service: PostServiceProviding
    ) async -> SocialEventsV2Outcome {
        guard !events.isEmpty else { return .delivered(SocialEventsV2Receipt(recorded: 0, rejected: 0)) }
        do {
            let body = try SocialEventsV2Wire.body(
                context: context.restricted(for: credential).sent(at: sentAt),
                events: Array(events.prefix(SocialEventsV2Wire.maxEventsPerRequest))
            )
            return .delivered(try await service.recordSocialEventsV2(body: body, credential: credential))
        } catch {
            return outcome(of: error)
        }
    }
}
