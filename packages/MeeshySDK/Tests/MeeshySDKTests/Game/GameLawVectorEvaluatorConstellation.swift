import Foundation
#if canImport(MeeshySDK)
import MeeshySDK
#endif

// MARK: - La constellation et la prochaine bascule rejouées sur les vecteurs partagés (#10053, #10225)
//
// Pendant Swift de `packages/shared/__tests__/game/game-vectors-law-constellation.ts`. Sur divergence, c'est le
// TypeScript qui a raison.

extension GameLawVectorEvaluator {

    static let constellationLaws: [String] = ["constellation", "constellation-key", "league-next-close"]

    static func evaluateConstellation(law: String, input: GameJSON) throws -> GameJSON {
        switch law {
        case "constellation":
            let shape = GameConstellation.of(collected: int(input, "collected"))
            return object([
                "collected": .int(shape.collected),
                "stars": .int(shape.stars),
                "inStar": .int(shape.inStar),
                "toNextStar": .int(shape.toNextStar),
                "cosmetics": .array(shape.cosmetics.map {
                    object(["star": .int($0.star), "kind": .string($0.kind.rawValue), "cosmeticKey": .string($0.cosmeticKey)])
                }),
            ])
        case "constellation-key":
            return object(["valid": .bool(GameConstellation.isCosmeticKey(string(input, "key")))])
        case "league-next-close":
            let close = GameLeague.nextWeekClose(after: LeagueMoment(dayKey: string(input, "dayKey"), minuteOfDay: int(input, "minuteOfDay")))
            return object(["dayKey": .string(close.dayKey), "minuteOfDay": .int(close.minuteOfDay)])
        default:
            throw GameLawVectorError.unknownLaw(law)
        }
    }
}
