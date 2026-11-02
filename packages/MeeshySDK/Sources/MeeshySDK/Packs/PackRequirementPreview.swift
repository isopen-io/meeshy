import Foundation

// MARK: - Ce qui reste à débloquer d'un pack, et comment (S21, #11276)
//
// MIROIR de `PackRequirementPreview` (`packages/shared/types/pack-unlock.ts`). La passerelle le sert pour
// un pack du registre NON possédé qui se gagne (rang, trophée, saison) ou qui a une fenêtre d'offre.
// Il MONTRE, avant le geste : le serveur reste juge à l'écriture. Tout est additif et tolérant — un
// ancien serveur ne le sert pas (l'absence vaut `nil`), une forme inattendue est ignorée, une règle
// d'un genre futur garde le verdict et perd sa ligne.

/// Où l'on en est d'une exigence chiffrée : la Gloire que le rang demande.
public struct PackRequirement: Codable, Hashable, Sendable {
    public let current: Int
    public let required: Int
    /// `0` quand l'exigence est remplie.
    public let missing: Int
    public let met: Bool

    public init(current: Int, required: Int, missing: Int, met: Bool) {
        self.current = current
        self.required = required
        self.missing = missing
        self.met = met
    }
}

/// La règle qui ouvre le pack, avec où en est le lecteur.
public enum PackRewardPreview: Codable, Hashable, Sendable {
    /// `rank` est la clé servie (`voix`) : une clé que ce client ne connaît pas se dit en Gloire seule.
    case rank(String, PackRequirement)
    case trophy(key: String, met: Bool)
    case season(number: Int, met: Bool)

    private enum CodingKeys: String, CodingKey { case kind, rank, requirement, key, number, met }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        switch try c.decode(String.self, forKey: .kind) {
        case "rank":
            self = .rank(try c.decode(String.self, forKey: .rank), try c.decode(PackRequirement.self, forKey: .requirement))
        case "trophy":
            self = .trophy(key: try c.decode(String.self, forKey: .key), met: try c.decode(Bool.self, forKey: .met))
        case "season":
            self = .season(number: try c.decode(Int.self, forKey: .number), met: try c.decode(Bool.self, forKey: .met))
        default:
            throw DecodingError.dataCorruptedError(forKey: .kind, in: c, debugDescription: "Unknown reward kind")
        }
    }

    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        switch self {
        case .rank(let rank, let requirement):
            try c.encode("rank", forKey: .kind)
            try c.encode(rank, forKey: .rank)
            try c.encode(requirement, forKey: .requirement)
        case .trophy(let key, let met):
            try c.encode("trophy", forKey: .kind)
            try c.encode(key, forKey: .key)
            try c.encode(met, forKey: .met)
        case .season(let number, let met):
            try c.encode("season", forKey: .kind)
            try c.encode(number, forKey: .number)
            try c.encode(met, forKey: .met)
        }
    }

    /// La récompense est remplie.
    var isMet: Bool {
        switch self {
        case .rank(_, let requirement): requirement.met
        case .trophy(_, let met), .season(_, let met): met
        }
    }
}

/// La fenêtre d'offre d'un pack : à venir, ouverte ou fermée.
public struct PackWindowPreview: Codable, Hashable, Sendable {
    public enum State: String, Codable, Hashable, Sendable {
        case upcoming, open, closed
    }

    public let state: State
    public let startsAt: Date?
    public let endsAt: Date?

    public init(state: State, startsAt: Date? = nil, endsAt: Date? = nil) {
        self.state = state
        self.startsAt = startsAt
        self.endsAt = endsAt
    }

    private enum CodingKeys: String, CodingKey { case state, startsAt, endsAt }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        state = try c.decode(State.self, forKey: .state)
        startsAt = Self.date(c, .startsAt)
        endsAt = Self.date(c, .endsAt)
    }

    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(state, forKey: .state)
        try c.encodeIfPresent(startsAt.map(WireDate.string(from:)), forKey: .startsAt)
        try c.encodeIfPresent(endsAt.map(WireDate.string(from:)), forKey: .endsAt)
    }

    /// Une date illisible tombe seule : la fenêtre garde son état. Le format est celui du fil (`WireDate`).
    private static func date(_ c: KeyedDecodingContainer<CodingKeys>, _ key: CodingKeys) -> Date? {
        guard let raw = try? c.decodeIfPresent(String.self, forKey: key) else { return nil }
        return WireDate.date(from: raw)
    }
}

/// Une chose à dire de ce qui reste à débloquer — le TEXTE est du ressort de l'écran qui l'affiche.
public enum PackUnlockClause: Hashable, Sendable {
    case rank(GloryRank, missing: Int)
    case glory(missing: Int)
    case trophy
    case season(Int)
    case upcoming(Date)
    case until(Date)
    case closed
}

public struct PackRequirementPreview: Codable, Hashable, Sendable {
    /// La récompense est remplie ET la fenêtre ouverte : le pack se débloque maintenant.
    public let met: Bool
    public let reward: PackRewardPreview?
    public let window: PackWindowPreview?

    public init(met: Bool, reward: PackRewardPreview?, window: PackWindowPreview?) {
        self.met = met
        self.reward = reward
        self.window = window
    }

    private enum CodingKeys: String, CodingKey { case met, reward, window }

    /// `met` est le verdict du serveur et seul champ requis ; une règle ou une fenêtre illisible tombe seule.
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        met = try c.decode(Bool.self, forKey: .met)
        reward = try? c.decodeIfPresent(PackRewardPreview.self, forKey: .reward)
        window = try? c.decodeIfPresent(PackWindowPreview.self, forKey: .window)
    }

    /// Ce qu'il reste à dire, la règle d'abord puis la fenêtre. Une récompense remplie ne se redit pas,
    /// une fenêtre ouverte sans fin non plus.
    public var clauses: [PackUnlockClause] {
        [rewardClause, windowClause].compactMap { $0 }
    }

    private var rewardClause: PackUnlockClause? {
        guard let reward, !reward.isMet else { return nil }
        switch reward {
        case .rank(let key, let requirement):
            return GloryRank(rawValue: key).map { .rank($0, missing: requirement.missing) } ?? .glory(missing: requirement.missing)
        case .trophy:
            return .trophy
        case .season(let number, _):
            return .season(number)
        }
    }

    private var windowClause: PackUnlockClause? {
        guard let window else { return nil }
        switch window.state {
        case .closed: return .closed
        case .upcoming: return window.startsAt.map { .upcoming($0) }
        case .open: return window.endsAt.map { .until($0) }
        }
    }
}
