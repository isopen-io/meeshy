import Foundation
#if canImport(MeeshySDK)
import MeeshySDK
#endif

// MARK: - Le calendrier des saisons servi, rejoué sur les vecteurs partagés (#10232)
//
// Pendant Swift de `packages/shared/__tests__/game/game-vectors-law-schedule.ts`
// (`evaluateGameVectorSchedule`) pour la loi de LECTURE `season-schedule` : le
// calendrier est donné BRUT, la normalisation fait partie de la loi rejouée.
// Sur divergence, c'est le TypeScript qui a raison.
//
// `season-edit` (la programmation par l'admin) n'a PAS de pendant ici : iOS lit le
// calendrier, il ne le programme jamais. Elle est nommée dans `adminOnlyLaws`, que
// `GameLawVectorTests` saute explicitement.

extension GameLawVectorEvaluator {

    static let scheduleLaws: [String] = ["season-schedule"]

    /// Les lois d'ADMINISTRATION du fichier de vecteurs : consommées par le web et la passerelle, jamais par iOS.
    static let adminOnlyLaws: Set<String> = ["season-edit"]

    static func evaluateSchedule(law: String, input: GameJSON) throws -> GameJSON {
        guard law == "season-schedule" else { throw GameLawVectorError.unknownLaw(law) }
        let schedule = SeasonSchedule.normalize(input["schedule"].foundationValue)
        let number = int(input, "season")
        let dayKey = string(input, "dayKey")
        let moment = LeagueMoment(dayKey: dayKey, minuteOfDay: int(input, "minuteOfDay"))
        let definition = schedule.definition(number: number)
        let claim = GameSeason.claim(season: number, step: 1, stepsReached: 1, claimed: [], sealOwned: false,
                                     stepPoints: definition?.stepPoints)
        return object([
            "revision": .int(schedule.revision),
            "kept": .array(schedule.seasons.map { .int($0.number) }),
            "calendar": schedule.calendar(number: number).map(scheduleCalendarJSON) ?? .null,
            "status": .string(schedule.status(number: number).rawValue),
            "stepPoints": .optionalInt(definition?.stepPoints),
            "claim": scheduleClaimJSON(claim),
            "season": .optionalInt(schedule.season(at: dayKey)),
            "week": .optionalInt(schedule.week(at: dayKey)),
            "seasonOfMoment": .optionalInt(schedule.season(of: moment)),
            "upcoming": .optionalInt(schedule.upcoming(of: moment)?.number),
        ])
    }

    private static func scheduleCalendarJSON(_ calendar: SeasonCalendar) -> GameJSON {
        object([
            "number": .int(calendar.number),
            "startDay": .string(calendar.startDay),
            "endDay": .string(calendar.endDay),
            "weekKeys": .array(calendar.weekKeys.map(GameJSON.string)),
            "themeKey": .string(calendar.themeKey),
        ])
    }

    private static func scheduleClaimJSON(_ claim: SeasonClaim) -> GameJSON {
        switch claim {
        case .allowed(let reward, let seal):
            return object([
                "allowed": .bool(true),
                "reward": object(["kind": .string(reward.kind.rawValue), "amount": .int(reward.amount)]),
                "seal": seal.map { object(["cosmeticKey": .string($0.cosmeticKey)]) } ?? .null,
            ])
        case .refused(let reason):
            return object(["allowed": .bool(false), "reason": .string(reason.rawValue)])
        }
    }
}

private extension GameJSON {
    /// La valeur Foundation (`JSONSerialization`) du JSON brut : ce que la passerelle et le disque livrent au SDK.
    /// Un booléen reste un booléen — `normalize` doit pouvoir le refuser là où la loi attend un nombre.
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
