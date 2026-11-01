import Foundation

/// La progression d'un lien vers le cran suivant — `RelationLinkView.progress`
/// (`packages/shared/types/relation.ts`, #13933).
///
/// `needed` est `nil` quand aucune série n'est exigée (Connaissance -> Ami, ou le
/// sommet). `missing` ne nomme que les natures d'interaction qui manquent encore à
/// la Connaissance automatique (`message`, `reaction`, `postView`, `audio`).
public struct RelationProgress: Codable, Sendable, Equatable {
    public let activeWeeks: Int
    public let needed: Int?
    public let missing: [String]

    public init(activeWeeks: Int = 0, needed: Int? = nil, missing: [String] = []) {
        self.activeWeeks = activeWeeks
        self.needed = needed
        self.missing = missing
    }

    private enum CodingKeys: String, CodingKey { case activeWeeks, needed, missing }

    /// Un bloc incomplet ne fait pas tomber le lien : ce qui manque se lit zéro, absent, vide.
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        activeWeeks = (try? c.decodeIfPresent(Int.self, forKey: .activeWeeks)) ?? 0
        needed = (try? c.decodeIfPresent(Int.self, forKey: .needed)) ?? nil
        missing = (try? c.decodeIfPresent([String].self, forKey: .missing)) ?? []
    }
}

/// Ce que le client PROPOSE depuis un lien : le cran suivant est ouvert, verrouillé
/// (la série n'est pas servie comme atteinte), ou il n'y en a plus.
public enum RelationRaiseOffer: Sendable, Equatable {
    case available(RelationLevel)
    case locked(RelationLevel)
    case none
}

/// Un lien tel que `GET /relations` le sert (`RelationLinkView`, #13933). `userId` est
/// l'AUTRE personne ; jamais un nom, une présence ni un cool-down (RG-07) — l'écran
/// hydrate la personne par ses propres caches.
///
/// Le décodage est tolérant et fermé par défaut : un niveau que ce client ne connaît pas
/// se lit `public` (jamais un niveau plus haut), une éligibilité illisible se lit `nil`.
public struct RelationLink: Codable, CacheIdentifiable, Identifiable, Sendable, Equatable {
    public let userId: String
    public let effectiveLevel: RelationLevel
    public let grantedByMe: RelationLevel
    public let since: String?
    public let progress: RelationProgress
    public let eligibleFor: RelationLevel?

    public var id: String { userId }

    public init(
        userId: String,
        effectiveLevel: RelationLevel,
        grantedByMe: RelationLevel,
        since: String? = nil,
        progress: RelationProgress = RelationProgress(),
        eligibleFor: RelationLevel? = nil
    ) {
        self.userId = userId
        self.effectiveLevel = effectiveLevel
        self.grantedByMe = grantedByMe
        self.since = since
        self.progress = progress
        self.eligibleFor = eligibleFor
    }

    private enum CodingKeys: String, CodingKey {
        case userId, effectiveLevel, grantedByMe, since, progress, eligibleFor
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        userId = try c.decode(String.self, forKey: .userId)
        effectiveLevel = RelationLevel(wire: try? c.decodeIfPresent(String.self, forKey: .effectiveLevel))
        grantedByMe = RelationLevel(wire: try? c.decodeIfPresent(String.self, forKey: .grantedByMe))
        since = (try? c.decodeIfPresent(String.self, forKey: .since)) ?? nil
        progress = (try? c.decodeIfPresent(RelationProgress.self, forKey: .progress)) ?? RelationProgress()
        let served = RelationLevel(wire: try? c.decodeIfPresent(String.self, forKey: .eligibleFor))
        eligibleFor = served == .public ? nil : served
    }

    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(userId, forKey: .userId)
        try c.encode(effectiveLevel.rawValue, forKey: .effectiveLevel)
        try c.encode(grantedByMe.rawValue, forKey: .grantedByMe)
        try c.encodeIfPresent(since, forKey: .since)
        try c.encode(progress, forKey: .progress)
        try c.encodeIfPresent(eligibleFor?.rawValue, forKey: .eligibleFor)
    }

    /// Le cran suivant, ouvert ou verrouillé selon la loi de demande. Le cool-down n'est
    /// pas servi (un refus ne fuit pas) : le serveur le dit UNE fois, à la demande.
    public func raiseOffer(now: Date = Date()) -> RelationRaiseOffer {
        guard let target = RelationRequestRule.rung(after: effectiveLevel) else { return .none }
        let verdict = RelationRequestRule.evaluate(
            target: target, current: effectiveLevel, eligibleFor: eligibleFor, cooldownUntil: nil, now: now
        )
        return verdict == .allowed ? .available(target) : .locked(target)
    }
}
