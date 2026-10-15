import Foundation

/// **La ligne d'arrivées regroupées de Meeshy Global** (#7740, #7759) —
/// « Aïcha, Tom et 12 autres viennent d'arriver — dis-leur salut ».
///
/// Même contrat que `JoinNoticeMetadata` : le sens voyage dans
/// `Message.metadata` (`kind == "members-arrived"`), jamais dans le texte. Le
/// `content` stocké n'est qu'un repli FRANÇAIS ; la phrase se compose chez le
/// lecteur avec les quatre clés `system.members.arrived.*`, celles que la ligne
/// de liste dit déjà (`ConversationPreviewComposer`).
///
/// Jumeau TypeScript : `parseArrivalsNotice` / `arrivalsNoticeLine`
/// (`packages/shared/utils/arrivals-notice.ts`) — toute évolution touche les deux.
public struct ArrivalsNoticeMetadata: Codable, Sendable, Equatable {

    public static let kind = "members-arrived"

    public struct Arrival: Codable, Sendable, Equatable {
        public let participantId: String
        public let displayName: String

        public init(participantId: String, displayName: String) {
            self.participantId = participantId
            self.displayName = displayName
        }

        private enum CodingKeys: String, CodingKey {
            case participantId, displayName
        }

        public init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy: CodingKeys.self)
            participantId = try c.decode(String.self, forKey: .participantId)
            displayName = try c.decode(String.self, forKey: .displayName)
            guard !participantId.isEmpty, !displayName.isEmpty else {
                throw DecodingError.dataCorruptedError(forKey: .displayName, in: c, debugDescription: "arrivant incomplet")
            }
        }

        public func encode(to encoder: Encoder) throws {
            var c = encoder.container(keyedBy: CodingKeys.self)
            try c.encode(participantId, forKey: .participantId)
            try c.encode(displayName, forKey: .displayName)
        }
    }

    /// Les derniers arrivés EN TÊTE : ce sont eux qu'on invite à saluer.
    public let arrivals: [Arrival]
    /// Nombre total d'arrivées de la fenêtre, noms gardés ou non.
    public let count: Int
    /// ISO 8601 — l'instant où la ligne a été ouverte.
    public let windowStartedAt: String

    public init(arrivals: [Arrival], count: Int, windowStartedAt: String) {
        self.arrivals = arrivals
        self.count = max(count, arrivals.count)
        self.windowStartedAt = windowStartedAt
    }

    private enum CodingKeys: String, CodingKey {
        case kind, arrivals, count, windowStartedAt
    }

    /// Un arrivant malformé est écarté sans perdre les autres, comme `parseArrival`.
    private struct LenientArrival: Decodable {
        let arrival: Arrival?

        init(from decoder: Decoder) throws {
            arrival = try? Arrival(from: decoder)
        }
    }

    /// VALIDE plutôt que caste, comme `parseArrivalsNotice` : `metadata` est
    /// partagé par toutes les familles d'avis.
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        let kind = try c.decodeIfPresent(String.self, forKey: .kind)
        guard kind == Self.kind else {
            throw DecodingError.dataCorruptedError(forKey: .kind, in: c, debugDescription: "metadata.kind is not '\(Self.kind)'")
        }
        let parsed = try c.decode([LenientArrival].self, forKey: .arrivals).compactMap(\.arrival)
        let rawCount = try c.decode(Double.self, forKey: .count)
        windowStartedAt = try c.decode(String.self, forKey: .windowStartedAt)
        guard !parsed.isEmpty, rawCount.isFinite, abs(rawCount) < 1_000_000_000 else {
            throw DecodingError.dataCorruptedError(forKey: .arrivals, in: c, debugDescription: "ligne d'arrivées illisible")
        }
        arrivals = parsed
        count = max(Int(rawCount.rounded(.down)), parsed.count)
    }

    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(Self.kind, forKey: .kind)
        try c.encode(arrivals, forKey: .arrivals)
        try c.encode(count, forKey: .count)
        try c.encode(windowStartedAt, forKey: .windowStartedAt)
    }

    /// Miroir de `arrivalsLineKey` : trois arrivées au plus se nomment toutes.
    /// Un compte illisible (`nan`) se dit au pluriel, jamais au singulier.
    public static func lineKey(count: Double) -> ConversationPreviewStringKey {
        if count <= 1 { return .systemMembersArrivedOne }
        if count == 2 { return .systemMembersArrivedTwo }
        if count == 3 { return .systemMembersArrivedThree }
        return .systemMembersArrivedMany
    }

    public var lineKey: ConversationPreviewStringKey {
        Self.lineKey(count: Double(count))
    }

    /// Les noms des DERNIERS arrivés, et le nombre des autres — `arrivalsNoticeLine`.
    public var lineParams: [String: String] {
        let named = lineKey == .systemMembersArrivedMany ? 2 : min(count, 3)
        let names = arrivals.prefix(named).map(\.displayName)
        return [
            "first": names.first ?? "",
            "second": names.count > 1 ? names[1] : "",
            "third": names.count > 2 ? names[2] : "",
            "others": String(max(0, count - names.count)),
            "count": String(count),
        ]
    }

    /// La phrase dans la langue des libellés prêtés par l'app.
    public func text(_ strings: ConversationPreviewStrings) -> String {
        strings(lineKey, lineParams)
    }
}
