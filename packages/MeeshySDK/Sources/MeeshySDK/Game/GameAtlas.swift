import Foundation

// MARK: - L'Atlas des langues (#9388)
//
// MIROIR de `packages/shared/utils/game/atlas.ts` — le passeport des langues
// vraiment échangées. Une langue est TAMPONNÉE quand un message est envoyé ET un
// reçu avec quelqu'un qui l'écrit. La langue d'un événement est celle de la
// PERSONNE d'en face.
//
// Le catalogue n'est PAS une liste de plus : c'est celui des langues servies par
// la passerelle (`SUPPORTED_LANGUAGE_CODES`), et `GameAtlasTests` le compare au
// fichier TypeScript. Un code verbatim (`en-US`, `pt_BR`) se range sous sa langue
// servie par `MeeshyUser.normalizeLanguageCode`, sans jamais tronquer un code à
// trois lettres en une autre langue. Un code hors catalogue n'inscrit rien.

public struct AtlasEntry: Sendable, Equatable {
    public let sent: Bool
    public let received: Bool
    /// Le jour où le tampon s'est posé, `nil` tant qu'il manque un sens.
    public let stampedOn: String?

    public init(sent: Bool, received: Bool, stampedOn: String?) {
        self.sent = sent
        self.received = received
        self.stampedOn = stampedOn
    }
}

public typealias AtlasState = [String: AtlasEntry]

public struct AtlasEvent: Sendable, Equatable {
    public enum Kind: String, Sendable, Hashable {
        case sent
        case received
    }

    public let kind: Kind
    public let language: String
    public let dayKey: String

    public init(kind: Kind, language: String, dayKey: String) {
        self.kind = kind
        self.language = language
        self.dayKey = dayKey
    }
}

public struct AtlasStep: Sendable, Equatable {
    public let state: AtlasState
    /// La langue qui vient d'être tamponnée, `nil` sinon.
    public let stamped: String?

    public init(state: AtlasState, stamped: String?) {
        self.state = state
        self.stamped = stamped
    }
}

public struct AtlasStamp: Sendable, Equatable {
    public let language: String
    public let stampedOn: String

    public init(language: String, stampedOn: String) {
        self.language = language
        self.stampedOn = stampedOn
    }
}

public struct AtlasPending: Sendable, Equatable {
    public let language: String
    public let sent: Bool
    public let received: Bool

    public init(language: String, sent: Bool, received: Bool) {
        self.language = language
        self.sent = sent
        self.received = received
    }
}

public struct AtlasSummary: Sendable, Equatable {
    public let stamped: Int
    public let total: Int
    public let remaining: Int
    /// Du plus ancien au plus récent ; à jour égal, dans l'ordre du catalogue.
    public let stamps: [AtlasStamp]
    /// Les échanges à moitié faits : un sens manque encore.
    public let pending: [AtlasPending]

    public init(stamped: Int, total: Int, remaining: Int, stamps: [AtlasStamp], pending: [AtlasPending]) {
        self.stamped = stamped
        self.total = total
        self.remaining = remaining
        self.stamps = stamps
        self.pending = pending
    }
}

public enum GameAtlas {
    /// Les langues servies, dans l'ordre du catalogue de la passerelle.
    public static let catalog: [String] = [
        "en", "fr", "es", "de", "it", "pt", "nl", "pl", "ru", "uk",
        "cs", "ro", "hu", "bg", "hr", "el", "tr", "sv", "da", "fi",
        "no", "lt", "hy", "ar", "he", "fa", "hi", "bn", "ur", "th",
        "vi", "id", "ms", "ja", "ko", "zh", "am", "sw", "yo", "ha",
        "rw", "rn", "sn", "lg", "om", "ti", "ny", "ee", "mg", "so",
        "ln", "ig", "zu", "xh", "af", "wo", "bas", "ksf", "nnh", "dua",
        "ewo", "sk", "sl", "sr", "ca", "et", "lv", "az", "kk", "uz",
        "ka", "ta", "ne", "my", "km", "lo", "tl", "ff", "tw", "ak",
        "bm", "byv", "fan",
    ]

    public static var total: Int { catalog.count }

    private static let catalogSet = Set(catalog)
    private static let catalogOrder: [String: Int] = Dictionary(uniqueKeysWithValues: catalog.enumerated().map { ($1, $0) })

    /// La langue servie d'un code, `nil` hors du catalogue.
    public static func language(of code: String?) -> String? {
        guard let code else { return nil }
        let trimmed = code.trimmingCharacters(in: .whitespacesAndNewlines)
        let primary = trimmed.split(whereSeparator: { $0 == "-" || $0 == "_" }).first?.lowercased() ?? ""
        if catalogSet.contains(primary) { return primary }
        guard let normalized = MeeshyUser.normalizeLanguageCode(code), catalogSet.contains(normalized) else { return nil }
        return normalized
    }

    public static func apply(_ event: AtlasEvent, to state: AtlasState) -> AtlasStep {
        guard let language = Self.language(of: event.language) else { return AtlasStep(state: state, stamped: nil) }
        let before = state[language] ?? AtlasEntry(sent: false, received: false, stampedOn: nil)
        let sent = before.sent || event.kind == .sent
        let received = before.received || event.kind == .received
        let justStamped = before.stampedOn == nil && sent && received
        var next = state
        next[language] = AtlasEntry(sent: sent, received: received, stampedOn: justStamped ? event.dayKey : before.stampedOn)
        return AtlasStep(state: next, stamped: justStamped ? language : nil)
    }

    /// Rejoue une suite d'événements datés.
    public static func fold(_ events: [AtlasEvent], from state: AtlasState = [:]) -> AtlasState {
        events.reduce(state) { apply($1, to: $0).state }
    }

    private static func index(of language: String) -> Int {
        catalogOrder[language] ?? Int.max
    }

    public static func summary(of state: AtlasState) -> AtlasSummary {
        let entries = state.sorted { index(of: $0.key) < index(of: $1.key) }
        let stamps = GameOrdering.stableSorted(
            entries.compactMap { language, entry in entry.stampedOn.map { AtlasStamp(language: language, stampedOn: $0) } }
        ) { lhs, rhs in
            lhs.stampedOn == rhs.stampedOn
                ? (index(of: lhs.language) < index(of: rhs.language) ? -1 : 1)
                : GameOrdering.compare(lhs.stampedOn, rhs.stampedOn)
        }
        let pending = entries.compactMap { language, entry in
            entry.stampedOn == nil ? AtlasPending(language: language, sent: entry.sent, received: entry.received) : nil
        }
        return AtlasSummary(stamped: stamps.count, total: total, remaining: total - stamps.count, stamps: stamps, pending: pending)
    }
}
