import Foundation
#if canImport(MeeshySDK)
import MeeshySDK
#endif

// MARK: - Le Jeu Meeshy rejoué sur le fichier de vecteurs partagé (#9373)
//
// `packages/shared/fixtures/reading-modes/game.vectors.json` est PRODUIT par la
// loi TypeScript (`packages/shared/__tests__/game/game-vectors-law.ts`) et rejoué
// ici sur les résolveurs RÉELS du SDK (`GameLevels`, `GameMint`, `GameGlory`,
// `GameFlame`, `GameMissions`…) — jamais sur une réimplémentation de test.
// Sur divergence, c'est le TS qui a raison : le miroir bouge, jamais le vecteur
// sans lui.
//
// Ce fichier ne dépend d'aucun cadre de test : il évalue une entrée en JSON et
// compare deux JSON. `GameLawVectorTests` le branche sur Swift Testing.

/// Un JSON qui sait se comparer à 1e-4 près (les fractions sont arrondies à 1e-6
/// par le producteur).
enum GameJSON: Equatable {
    case null
    case bool(Bool)
    case number(Double)
    case string(String)
    case array([GameJSON])
    case object([String: GameJSON])

    static func parse(_ data: Data) throws -> GameJSON {
        GameJSON(try JSONSerialization.jsonObject(with: data, options: [.fragmentsAllowed]))
    }

    init(_ any: Any) {
        switch any {
        case is NSNull:
            self = .null
        case let number as NSNumber:
            self = CFGetTypeID(number) == CFBooleanGetTypeID() ? .bool(number.boolValue) : .number(number.doubleValue)
        case let string as String:
            self = .string(string)
        case let array as [Any]:
            self = .array(array.map(GameJSON.init))
        case let object as [String: Any]:
            self = .object(object.mapValues(GameJSON.init))
        default:
            self = .null
        }
    }

    static func int(_ value: Int) -> GameJSON { .number(Double(value)) }
    static func optionalInt(_ value: Int?) -> GameJSON { value.map(int) ?? .null }
    static func optionalString(_ value: String?) -> GameJSON { value.map(GameJSON.string) ?? .null }

    subscript(key: String) -> GameJSON {
        guard case .object(let fields) = self else { return .null }
        return fields[key] ?? .null
    }

    var stringValue: String? {
        guard case .string(let value) = self else { return nil }
        return value
    }

    var intValue: Int? {
        guard case .number(let value) = self else { return nil }
        return Int(value)
    }

    var boolValue: Bool? {
        guard case .bool(let value) = self else { return nil }
        return value
    }

    var isNull: Bool { self == .null }

    var arrayValue: [GameJSON] {
        guard case .array(let values) = self else { return [] }
        return values
    }

    /// La première différence, décrite avec son chemin — `nil` quand les deux se valent.
    static func firstDifference(expected: GameJSON, actual: GameJSON, path: String = "$",
                                tolerance: Double = 0.0001) -> String? {
        switch (expected, actual) {
        case (.null, .null):
            return nil
        case (.bool(let lhs), .bool(let rhs)):
            return lhs == rhs ? nil : "\(path): attendu \(lhs), obtenu \(rhs)"
        case (.number(let lhs), .number(let rhs)):
            return abs(lhs - rhs) <= tolerance ? nil : "\(path): attendu \(lhs), obtenu \(rhs)"
        case (.string(let lhs), .string(let rhs)):
            return lhs == rhs ? nil : "\(path): attendu « \(lhs) », obtenu « \(rhs) »"
        case (.array(let lhs), .array(let rhs)):
            guard lhs.count == rhs.count else { return "\(path): attendu \(lhs.count) éléments, obtenu \(rhs.count)" }
            for (index, pair) in zip(lhs, rhs).enumerated() {
                if let difference = firstDifference(expected: pair.0, actual: pair.1, path: "\(path)[\(index)]",
                                                    tolerance: tolerance) {
                    return difference
                }
            }
            return nil
        case (.object(let lhs), .object(let rhs)):
            guard Set(lhs.keys) == Set(rhs.keys) else {
                return "\(path): clés attendues \(lhs.keys.sorted()), obtenues \(rhs.keys.sorted())"
            }
            for key in lhs.keys.sorted() {
                if let difference = firstDifference(expected: lhs[key] ?? .null, actual: rhs[key] ?? .null,
                                                    path: "\(path).\(key)", tolerance: tolerance) {
                    return difference
                }
            }
            return nil
        default:
            return "\(path): attendu \(expected), obtenu \(actual)"
        }
    }
}

enum GameLawVectorError: Error, CustomStringConvertible {
    case unknownLaw(String)
    case malformed(String)

    var description: String {
        switch self {
        case .unknownLaw(let law): "loi inconnue du miroir Swift : « \(law) » — l'ajouter, ou le vecteur n'est rejoué par personne"
        case .malformed(let detail): "vecteur illisible : \(detail)"
        }
    }
}

/// L'évaluateur : pour une entrée `{ law, ... }`, la sortie de la loi Swift, dans la
/// MÊME forme JSON que la loi TypeScript (`evaluateGameVector`).
enum GameLawVectorEvaluator {

    static func evaluate(_ input: GameJSON) throws -> GameJSON {
        guard let law = input["law"].stringValue else { throw GameLawVectorError.malformed("champ `law` absent") }
        switch law {
        case "level": return level(input)
        case "level-record": return levelRecord(input)
        case "mint-price": return mintPrice(input)
        case "mint-preview": return try mintPreview(input)
        case "glory-standing": return gloryStanding(input)
        case "glory-gain": return try gloryGain(input)
        case "treasury": return treasury(input)
        case "flame-form": return flameForm(input)
        case "flame-advance": return flameAdvance(input)
        case "flame-status": return flameStatus(input)
        case "flame-relight": return flameRelight(input)
        case "tailwind": return tailwind(input)
        case "prism-hour": return prismHour(input)
        case "mission-objective": return missionObjective(input)
        case "mission-reward": return missionReward(input)
        case "rng": return rng(input)
        case "missions-draw": return missionsDraw(input)
        case "mission-reroll": return missionReroll(input)
        case "chest": return chest(input)
        case "guide": return try guide(input)
        default: throw GameLawVectorError.unknownLaw(law)
        }
    }

    private static func object(_ fields: [String: GameJSON]) -> GameJSON { .object(fields) }

    private static func int(_ json: GameJSON, _ key: String) -> Int { json[key].intValue ?? 0 }

    private static func string(_ json: GameJSON, _ key: String) -> String { json[key].stringValue ?? "" }

    private static func optionalString(_ json: GameJSON, _ key: String) -> String? { json[key].stringValue }

    private static func optionalInt(_ json: GameJSON, _ key: String) -> Int? { json[key].intValue }

    // MARK: Niveaux

    private static func level(_ input: GameJSON) -> GameJSON {
        let p = GameLevels.progress(forScore: int(input, "score"))
        return object([
            "level": .int(p.level),
            "tier": .string(p.tier.rawValue),
            "floorScore": .int(p.floorScore),
            "nextThreshold": .optionalInt(p.nextThreshold),
            "pointsToNext": .int(p.pointsToNext),
            "progress": .number(p.progress),
            "isMax": .bool(p.isMax),
        ])
    }

    private static func levelRecord(_ input: GameJSON) -> GameJSON {
        let level = int(input, "level")
        let previous = optionalInt(input, "previousRecord")
        let fresh = GameLevels.newLevelsReached(level: level, previousRecord: previous)
        return object([
            "record": .int(GameLevels.record(level: level, previousRecord: previous)),
            "newLevelsFrom": .int(fresh.from),
            "newLevelsTo": .int(fresh.to),
            "newLevelsCount": .int(fresh.count),
            "canPrestige": .bool(GameLevels.canPrestige(level: level, prestige: int(input, "prestige"))),
        ])
    }

    // MARK: Frappe

    private static func mintPrice(_ input: GameJSON) -> GameJSON {
        let n = int(input, "n")
        return object([
            "price": .int(GameMint.price(forNumber: n)),
            "edition": .string(GameMint.edition(forNumber: n).rawValue),
        ])
    }

    private static func mintPreview(_ input: GameJSON) throws -> GameJSON {
        let preview = GameMint.preview(score: int(input, "score"), mintedLifetime: int(input, "mintedLifetime"),
                                       debitablePoints: int(input, "debitablePoints"))
        return try GameJSON.parse(JSONEncoder().encode(preview))
    }

    // MARK: Gloire et trésor

    private static func gloryStanding(_ input: GameJSON) -> GameJSON {
        let s = GameGlory.standing(glory: int(input, "glory"), mythic: input["mythic"].boolValue ?? false)
        return object([
            "rank": .string(s.rank.rawValue),
            "division": .optionalInt(s.division?.rawValue),
            "divisionMinGlory": .optionalInt(s.divisionMinGlory),
            "nextRank": .optionalString(s.next?.rank.rawValue),
            "nextDivision": .optionalInt(s.next?.division.rawValue),
            "nextMinGlory": .optionalInt(s.next?.minGlory),
            "gloryMissing": .optionalInt(s.gloryMissing),
            "progress": .number(s.progress),
        ])
    }

    private static func gloryGain(_ input: GameJSON) throws -> GameJSON {
        guard let rarity = GameGlory.AchievementRarity(rawValue: string(input, "rarity")) else {
            throw GameLawVectorError.malformed("rareté inconnue « \(string(input, "rarity")) »")
        }
        return object([
            "achievement": .int(GameGlory.gloryForAchievement(rarity)),
            "newLevels": .int(GameGlory.gloryForNewLevels(level: int(input, "level"),
                                                         previousRecord: optionalInt(input, "previousRecord"))),
            "flameRecords": .int(GameGlory.gloryForFlameRecords(previousLongest: int(input, "previousLongest"),
                                                               longest: int(input, "longest"))),
        ])
    }

    private static func treasury(_ input: GameJSON) -> GameJSON {
        let t = GameTreasury.standing(held: int(input, "held"))
        return object([
            "tier": .optionalString(t.tier?.rawValue),
            "nextKey": .optionalString(t.next?.key.rawValue),
            "missing": .optionalInt(t.next?.missing),
        ])
    }

    // MARK: Flamme

    private static func flameForm(_ input: GameJSON) -> GameJSON {
        let days = int(input, "days")
        return object([
            "form": .optionalString(GameFlame.form(forDays: days)?.rawValue),
            "bonusPercent": .int(GameFlame.bonusPercent(forDays: days)),
            "bonus": .number(GameFlame.bonus(forDays: days)),
        ])
    }

    private static func flameAdvance(_ input: GameJSON) -> GameJSON {
        let t = GameFlame.advance(lastActiveDay: optionalString(input, "lastActiveDay"), today: string(input, "today"),
                                  streak: int(input, "streak"), freezes: int(input, "freezes"))
        return object([
            "outcome": .string(t.outcome.rawValue),
            "streak": .int(t.streak),
            "freezes": .int(t.freezes),
            "freezesUsed": .int(t.freezesUsed),
            "missedDays": .int(t.missedDays),
            "lostStreak": .int(t.lostStreak),
        ])
    }

    private static func flameStatus(_ input: GameJSON) -> GameJSON {
        let status = GameFlame.status(lastActiveDay: optionalString(input, "lastActiveDay"), today: string(input, "today"),
                                      streak: int(input, "streak"), freezes: int(input, "freezes"))
        return object(["status": .string(status.rawValue)])
    }

    private static func flameRelight(_ input: GameJSON) -> GameJSON {
        let decision = GameFlame.relightDecision(
            lastActiveDay: optionalString(input, "lastActiveDay"), today: string(input, "today"),
            streakBeforeBreak: int(input, "streakBeforeBreak"), lastRelightDay: optionalString(input, "lastRelightDay"),
            balance: int(input, "balance"))
        guard let refusal = decision.refusal else {
            return object(["allowed": .bool(true), "price": .int(decision.price)])
        }
        return object(["allowed": .bool(false), "reason": .string(refusal.rawValue), "price": .int(decision.price)])
    }

    // MARK: Boosts

    private static func tailwind(_ input: GameJSON) -> GameJSON {
        object(["factor": .number(GameBoosts.tailwind(level: int(input, "level"), levelRecord: int(input, "levelRecord")))])
    }

    private static func prismHour(_ input: GameJSON) -> GameJSON {
        let window = GameBoosts.prismHour(userId: string(input, "userId"), dayKey: string(input, "dayKey"))
        return object(["startMinute": .int(window.startMinute), "endMinute": .int(window.endMinute)])
    }

    // MARK: Missions

    private static func missionObjective(_ input: GameJSON) -> GameJSON {
        object(["target": .int(GameMissions.objective(baseTarget: int(input, "baseTarget"), level: int(input, "level")))])
    }

    private static func missionReward(_ input: GameJSON) -> GameJSON {
        object(["reward": .int(GameMissions.reward(basePoints: int(input, "basePoints"), level: int(input, "level"),
                                                   flameDays: int(input, "flameDays")))])
    }

    private static func rng(_ input: GameJSON) -> GameJSON {
        let parts = GameSeedParts(userId: string(input, "userId"), dayKey: string(input, "dayKey"), salt: string(input, "salt"))
        var generator = GameRandom(parts: parts)
        return object([
            "seed": .number(Double(GameSeed.seed(of: parts))),
            "draws": .array((0..<5).map { _ in .number(generator.next()) }),
        ])
    }

    private static func drawn(_ mission: DrawnMission) -> GameJSON {
        object([
            "difficulty": .string(mission.difficulty.rawValue),
            "templateKey": .string(mission.templateKey),
            "signal": .string(mission.signal.rawValue),
            "prism": .bool(mission.prism),
            "target": .int(mission.target),
            "reward": .int(mission.reward),
            "glory": .int(mission.glory),
        ])
    }

    private static func drawInput(_ input: GameJSON) -> MissionDrawInput {
        MissionDrawInput(
            userId: string(input, "userId"), dayKey: string(input, "dayKey"), level: int(input, "level"),
            flameDays: int(input, "flameDays"), treasury: int(input, "treasury"),
            unavailableSignals: input["unavailableSignals"].arrayValue.compactMap(\.stringValue).map { MissionSignal($0) })
    }

    private static func missionsDraw(_ input: GameJSON) -> GameJSON {
        let draw = GameMissions.draw(drawInput(input))
        return object([
            "dayKey": .string(draw.dayKey),
            "prismDay": .bool(draw.prismDay),
            "missions": .array(draw.missions.map(drawn)),
        ])
    }

    private static func missionReroll(_ input: GameJSON) -> GameJSON {
        let today = GameMissions.draw(MissionDrawInput(
            userId: string(input, "userId"), dayKey: string(input, "dayKey"), level: int(input, "level"),
            flameDays: int(input, "flameDays"), treasury: 0))
        let rerolled = GameMissions.reroll(
            userId: string(input, "userId"), dayKey: string(input, "dayKey"), level: int(input, "level"),
            flameDays: int(input, "flameDays"), missions: today.missions, index: int(input, "index"),
            rerollCount: int(input, "rerollCount"))
        return object(["mission": rerolled.map(drawn) ?? .null])
    }

    private static func chest(_ input: GameJSON) -> GameJSON {
        let chest = GameChest.daily(userId: string(input, "userId"), dayKey: string(input, "dayKey"))
        return object(["points": .int(chest.points), "fragment": .bool(chest.fragment), "freeze": .bool(chest.freeze)])
    }

    // MARK: Guide

    private static func guideEvent(_ json: GameJSON) throws -> GuideEvent {
        func tier(_ key: String) throws -> LevelTierKey {
            guard let value = LevelTierKey(rawValue: string(json, key)) else { throw GameLawVectorError.malformed("palier « \(key) »") }
            return value
        }
        switch string(json, "kind") {
        case "first-level": return .firstLevel(level: int(json, "level"), pointsToNext: int(json, "pointsToNext"))
        case "new-tier": return .newTier(tier: try tier("tier"), nextTierLevel: optionalInt(json, "nextTierLevel"))
        case "missions-unlocked": return .missionsUnlocked
        case "first-mint-possible":
            return .firstMintPossible(price: int(json, "price"), levelsLost: int(json, "levelsLost"), gloryGain: int(json, "gloryGain"))
        case "first-mint":
            return .firstMint(levelBefore: int(json, "levelBefore"), levelAfter: int(json, "levelAfter"),
                              tailwindUntilLevel: int(json, "tailwindUntilLevel"))
        case "badge-extinguished": return .badgeExtinguished(missingActions: int(json, "missingActions"))
        case "price-rises": return .priceRises(nextPrice: int(json, "nextPrice"))
        case "new-rank":
            guard let rank = GloryRank(rawValue: string(json, "rank")) else { throw GameLawVectorError.malformed("rang") }
            return .newRank(rank: rank, division: optionalInt(json, "division").flatMap(GloryDivision.init(rawValue:)),
                            glory: int(json, "glory"), gloryMissing: optionalInt(json, "gloryMissing"))
        case "treasury-tier":
            guard let key = TreasuryTierKey(rawValue: string(json, "tier")) else { throw GameLawVectorError.malformed("trésor") }
            return .treasuryTier(tier: key, nextTierMissing: optionalInt(json, "nextTierMissing"))
        case "flame-at-risk": return .flameAtRisk(days: int(json, "days"))
        case "flame-out":
            return .flameOut(lostDays: int(json, "lostDays"), relightPrice: int(json, "relightPrice"),
                             canRelight: json["canRelight"].boolValue ?? false)
        case "return-after-absence": return .returnAfterAbsence(daysAway: int(json, "daysAway"))
        case "level-100": return .level100(canPrestige: json["canPrestige"].boolValue ?? false)
        case let other: throw GameLawVectorError.malformed("événement de guide « \(other) »")
        }
    }

    private static func guideData(_ event: GuideEvent) -> GameJSON {
        switch event {
        case .firstLevel(let level, let pointsToNext):
            object(["level": .int(level), "pointsToNext": .int(pointsToNext)])
        case .newTier(let tier, let nextTierLevel):
            object(["tier": .string(tier.rawValue), "nextTierLevel": .optionalInt(nextTierLevel)])
        case .missionsUnlocked:
            object([:])
        case .firstMintPossible(let price, let levelsLost, let gloryGain):
            object(["price": .int(price), "levelsLost": .int(levelsLost), "gloryGain": .int(gloryGain)])
        case .firstMint(let levelBefore, let levelAfter, let tailwindUntilLevel):
            object(["levelBefore": .int(levelBefore), "levelAfter": .int(levelAfter),
                    "tailwindUntilLevel": .int(tailwindUntilLevel)])
        case .badgeExtinguished(let missingActions):
            object(["missingActions": .int(missingActions)])
        case .priceRises(let nextPrice):
            object(["nextPrice": .int(nextPrice)])
        case .newRank(let rank, let division, let glory, let gloryMissing):
            object(["rank": .string(rank.rawValue), "division": .optionalInt(division?.rawValue),
                    "glory": .int(glory), "gloryMissing": .optionalInt(gloryMissing)])
        case .treasuryTier(let tier, let nextTierMissing):
            object(["tier": .string(tier.rawValue), "nextTierMissing": .optionalInt(nextTierMissing)])
        case .flameAtRisk(let days):
            object(["days": .int(days)])
        case .flameOut(let lostDays, let relightPrice, let canRelight):
            object(["lostDays": .int(lostDays), "relightPrice": .int(relightPrice), "canRelight": .bool(canRelight)])
        case .returnAfterAbsence(let daysAway):
            object(["daysAway": .int(daysAway)])
        case .level100(let canPrestige):
            object(["canPrestige": .bool(canPrestige)])
        }
    }

    private static func guide(_ input: GameJSON) throws -> GameJSON {
        let event = try guideEvent(input["event"])
        let seen = input["seen"].arrayValue.compactMap(\.stringValue)
        let moment = GameGuide.moment(for: event, seen: seen)
        return object([
            "key": .string(moment.key.rawValue),
            "speaker": .string(moment.speaker.rawValue),
            "mood": .string(moment.mood.rawValue),
            "data": guideData(moment.event),
            "action": .string(moment.action.rawValue),
            "presentation": .string(moment.presentation.rawValue),
        ])
    }
}
