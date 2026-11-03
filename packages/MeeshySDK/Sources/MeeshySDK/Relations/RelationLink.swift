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
/// l'AUTRE personne ; jamais un nom ni une présence — l'écran hydrate la personne par ses
/// propres caches. `GET /relations/:userId` peut servir en plus `raiseBlockedUntil` et
/// `canRaise` (#14910) : absents, la proposition de montée reste celle d'avant.
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
    public let raiseBlockedUntil: Date?
    public let canRaise: Bool?

    public var id: String { userId }

    public init(
        userId: String,
        effectiveLevel: RelationLevel,
        grantedByMe: RelationLevel,
        since: String? = nil,
        progress: RelationProgress = RelationProgress(),
        eligibleFor: RelationLevel? = nil,
        raiseBlockedUntil: Date? = nil,
        canRaise: Bool? = nil
    ) {
        self.userId = userId
        self.effectiveLevel = effectiveLevel
        self.grantedByMe = grantedByMe
        self.since = since
        self.progress = progress
        self.eligibleFor = eligibleFor
        self.raiseBlockedUntil = raiseBlockedUntil
        self.canRaise = canRaise
    }

    private enum CodingKeys: String, CodingKey {
        case userId, effectiveLevel, grantedByMe, since, progress, eligibleFor, raiseBlockedUntil, canRaise
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
        raiseBlockedUntil = Self.instant((try? c.decodeIfPresent(String.self, forKey: .raiseBlockedUntil)) ?? nil)
        canRaise = (try? c.decodeIfPresent(Bool.self, forKey: .canRaise)) ?? nil
    }

    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(userId, forKey: .userId)
        try c.encode(effectiveLevel.rawValue, forKey: .effectiveLevel)
        try c.encode(grantedByMe.rawValue, forKey: .grantedByMe)
        try c.encodeIfPresent(since, forKey: .since)
        try c.encode(progress, forKey: .progress)
        try c.encodeIfPresent(eligibleFor?.rawValue, forKey: .eligibleFor)
        try c.encodeIfPresent(raiseBlockedUntil.map(Self.wireInstant), forKey: .raiseBlockedUntil)
        try c.encodeIfPresent(canRaise, forKey: .canRaise)
    }

    /// Le lien après MA baisse : le niveau effectif et mon accord plafonnés au cran visé ; l'éligibilité servie ne
    /// vaut plus pour ce nouveau niveau, elle se relira au serveur.
    public func lowered(to level: RelationLevel) -> RelationLink {
        RelationLink(
            userId: userId,
            effectiveLevel: min(effectiveLevel, level),
            grantedByMe: min(grantedByMe, level),
            since: since,
            progress: progress,
            eligibleFor: nil,
            raiseBlockedUntil: raiseBlockedUntil,
            canRaise: canRaise
        )
    }

    private static func instant(_ wire: String?) -> Date? {
        guard let wire else { return nil }
        return WireDate.date(from: wire)
    }

    private static func wireInstant(_ date: Date) -> String {
        WireDate.string(from: date)
    }

    /// Le cran suivant, ouvert ou verrouillé selon la loi de demande. Le blocage de montée
    /// (`raiseBlockedUntil`, `canRaise == false`) verrouille quand il est servi ; absent, le
    /// serveur le dit UNE fois, à la demande.
    public func raiseOffer(now: Date = Date()) -> RelationRaiseOffer {
        guard let target = RelationRequestRule.rung(after: effectiveLevel) else { return .none }
        guard canRaise != false else { return .locked(target) }
        let verdict = RelationRequestRule.evaluate(
            target: target, current: effectiveLevel, eligibleFor: eligibleFor, cooldownUntil: raiseBlockedUntil, now: now
        )
        return verdict == .allowed ? .available(target) : .locked(target)
    }
}
