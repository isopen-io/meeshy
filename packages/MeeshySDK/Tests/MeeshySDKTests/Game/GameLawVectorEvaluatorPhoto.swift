import Foundation
#if canImport(MeeshySDK)
import MeeshySDK
#endif

// MARK: - La loi du carnet rejouée sur les vecteurs partagés (#10155)
//
// Pendant Swift de `packages/shared/__tests__/game/game-vectors-law-photo.ts`
// (`evaluateGameVectorPhoto`) : `photo-catch-up`, `photo-offer` et
// `photo-standing` rendent, dans la MÊME forme JSON que la loi TypeScript, la
// sortie de `GamePhotoCatchUpLaw` ; `photo-alert` celle de `GamePhotoAlerts`
// (#10173). Sur divergence, c'est le TypeScript qui a raison.

extension GameLawVectorEvaluator {

    static let photoLaws: [String] = ["photo-catch-up", "photo-offer", "photo-standing", "photo-alert"]

    static func evaluatePhoto(law: String, input: GameJSON) throws -> GameJSON {
        switch law {
        case "photo-catch-up": return try photoCatchUp(input)
        case "photo-offer": return try photoOffer(input)
        case "photo-standing": return try photoStanding(input)
        case "photo-alert": return try photoAlert(input)
        default: throw GameLawVectorError.unknownLaw(law)
        }
    }

    private static func kept(_ input: GameJSON) -> Set<String> {
        Set(input["kept"].arrayValue.compactMap(\.stringValue))
    }

    private static func photoEmblemJSON(_ emblem: PhotoStepEmblem) -> GameJSON {
        switch emblem {
        case .start:
            object(["kind": .string("start")])
        case .rank(let rank, let division):
            object(["kind": .string("rank"), "rank": .string(rank.rawValue), "division": .optionalInt(division?.rawValue)])
        case .tier(let tier, let level, let prestige, let times):
            object([
                "kind": .string("tier"), "tier": .string(tier.rawValue), "level": .int(level),
                "prestige": .int(prestige), "times": .int(times),
            ])
        case .levelHundred:
            object(["kind": .string("level-hundred"), "prestige": .int(0)])
        case .prestige(let number):
            object(["kind": .string("prestige"), "number": .int(number)])
        case .meesh(let number, let edition):
            object(["kind": .string("meesh"), "number": .int(number), "edition": .string(edition.rawValue)])
        case .treasury(let tier):
            object(["kind": .string("treasury"), "tier": .string(tier.rawValue)])
        case .flame(let form, let days):
            object(["kind": .string("flame"), "form": .string(form.rawValue), "days": .int(days)])
        }
    }

    private static func photoCatchUp(_ input: GameJSON) throws -> GameJSON {
        let standing = try photoStanding(of: input["standing"])
        let steps = GamePhotoCatchUpLaw.stepsReached(standing).map { step in
            object(["track": .string(step.track.rawValue), "id": .string(step.id), "emblem": photoEmblemJSON(step.emblem)])
        }
        let entries = GamePhotoCatchUpLaw.catchUp(standing, kept: kept(input)).map { entry in
            object([
                "id": .string(entry.id),
                "track": .string(entry.track.rawValue),
                "state": .string(entry.isOpen ? "open" : "locked"),
                "blockedBy": .optionalString(entry.blockedBy),
            ])
        }
        return object(["steps": .array(steps), "entries": .array(entries)])
    }

    private static func photoOffer(_ input: GameJSON) throws -> GameJSON {
        let ids = input["momentIds"].arrayValue.compactMap(\.stringValue)
        let offer = GamePhotoCatchUpLaw.offer(for: ids, standing: try photoStanding(of: input["standing"]), kept: kept(input))
        return object([
            "offer": .optionalString(offer),
            "tracks": .array(ids.map { .optionalString(GamePhotoCatchUpLaw.track(of: $0)?.rawValue) }),
        ])
    }

    /// Les cinq blocs du vecteur posés sur un bloc complet du même producteur (`GameBlockFixture`), puis décodés
    /// par le décodeur RÉEL du SDK : c'est `PhotoCatchUpStanding.init(game:)` qui est rejoué, pas une copie.
    private static func photoStanding(_ input: GameJSON) throws -> GameJSON {
        guard var block = try JSONSerialization.jsonObject(with: GameBlockFixture.data) as? [String: Any],
              case .object(let served) = input["game"] else {
            throw GameLawVectorError.malformed("bloc `game` absent")
        }
        for (key, value) in served { block[key] = value.foundationValue }
        let game = try JSONDecoder().decode(GameBlock.self, from: try JSONSerialization.data(withJSONObject: block))
        let standing = PhotoCatchUpStanding(game: game)
        var fields: [String: GameJSON] = [
            "rank": .string(standing.rank.rawValue),
            "division": .optionalInt(standing.division?.rawValue),
            "levelRecord": .int(standing.levelRecord),
            "prestige": .int(standing.prestige),
            "minted": .int(standing.minted),
            "treasuryTier": .optionalString(standing.treasuryTier?.rawValue),
            "flameRecord": .int(standing.flameRecord),
        ]
        // Absent devant un serveur qui ne le sert pas, comme `catchUpStandingOf` (#10911).
        if let past = standing.pastCycleRecords { fields["pastCycleRecords"] = .array(past.map(GameJSON.int)) }
        return object(fields)
    }
}

private extension GameJSON {
    /// La valeur Foundation que `JSONSerialization` réécrit : un entier reste un entier.
    var foundationValue: Any {
        switch self {
        case .null: NSNull()
        case .bool(let value): value
        case .number(let value): value.rounded() == value && abs(value) < 1e15 ? Int(value) as Any : value as Any
        case .string(let value): value
        case .array(let values): values.map(\.foundationValue)
        case .object(let fields): fields.mapValues(\.foundationValue)
        }
    }
}
