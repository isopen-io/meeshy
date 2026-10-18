import Foundation
#if canImport(MeeshySDK)
import MeeshySDK
#endif

// MARK: - Les alertes d'immortalisation rejouées sur les vecteurs partagés (#10173)
//
// Pendant Swift de `evaluatePhotoAlert` (`packages/shared/__tests__/game/game-vectors-law-photo.ts`) :
// la loi `photo-alert` rend, dans la MÊME forme JSON, la sortie de `GamePhotoAlerts` ; la loi
// `photo-moment` porte aussi l'identité de la réalisation du jour.

extension GameLawVectorEvaluator {

    static func photoDayMoment(_ dayKey: String) -> GameJSON {
        object([
            "id": .optionalString(GamePhotoMomentsV2.dayMomentId(dayKey)),
            "day": .optionalString(GamePhotoMomentsV2.day(ofMomentId: "day:\(dayKey)")),
        ])
    }

    static func photoAlert(_ input: GameJSON) throws -> GameJSON {
        switch string(input, "kind") {
        case "alert": return try photoAlertOf(input)
        case "pacing":
            let pace = GamePhotoAlerts.pacing(try photoPacing(input["pacing"]), policy: try photoPolicy(input["policy"]))
            return object(["pace": .string(pace.rawValue)])
        case "steps":
            let steps = GamePhotoCatchUpLaw.stepsReached(try photoStanding(of: input["standing"]), policy: try photoPolicy(input["policy"]))
            return object(["ids": .array(steps.map { .string($0.id) })])
        case "digest": return photoDigest(input)
        case "big": return object(["big": .array(strings(input["ids"]).map { .bool(GamePhotoAlerts.isBigMoment($0)) })])
        case "policy": return photoPolicyJSON(.standard)
        default: throw GameLawVectorError.malformed("photo-alert : kind « \(string(input, "kind")) »")
        }
    }

    private static func photoAlertOf(_ input: GameJSON) throws -> GameJSON {
        let baseline = input["baseline"].isNull ? nil : try photoStanding(of: input["baseline"])
        let alert = GamePhotoAlerts.alert(
            reached: strings(input["reached"]),
            standing: try photoStanding(of: input["standing"]),
            kept: strings(input["kept"]),
            presented: strings(input["presented"]),
            baseline: baseline,
            policy: try photoPolicy(input["policy"]),
            treasuryPeak: try optionalString(input, "treasuryPeak").map(treasuryTier),
            pacing: input["pacing"].isNull ? nil : try photoPacing(input["pacing"])
        )
        guard let alert else { return object(["alert": .null]) }
        return object(["alert": object([
            "announce": .string(alert.announce),
            "propose": .string(alert.propose),
            "reached": .array(alert.reached.map(GameJSON.string)),
        ])])
    }

    private static func photoDigest(_ input: GameJSON) -> GameJSON {
        let moments = input["moments"].arrayValue.map { json in
            PhotoMomentRecord(stepId: string(json, "stepId"), presentedAt: optionalString(json, "presentedAt"),
                              notifiedAt: optionalString(json, "notifiedAt"))
        }
        guard let digest = GamePhotoAlerts.digest(moments) else { return object(["digest": .null]) }
        return object(["digest": object(["stepIds": .array(digest.stepIds.map(GameJSON.string)), "count": .int(digest.count)])])
    }

    private static func strings(_ json: GameJSON) -> [String] {
        json.arrayValue.compactMap(\.stringValue)
    }

    private static func treasuryTier(_ key: String) throws -> TreasuryTierKey {
        guard let tier = TreasuryTierKey(rawValue: key) else { throw GameLawVectorError.malformed("palier inconnu « \(key) »") }
        return tier
    }

    static func photoStanding(of json: GameJSON) throws -> PhotoCatchUpStanding {
        guard let rank = GloryRank(rawValue: string(json, "rank")) else {
            throw GameLawVectorError.malformed("rang inconnu « \(string(json, "rank")) »")
        }
        return PhotoCatchUpStanding(
            rank: rank,
            division: optionalInt(json, "division").flatMap(GloryDivision5.init(rawValue:)),
            levelRecord: int(json, "levelRecord"),
            prestige: int(json, "prestige"),
            minted: int(json, "minted"),
            treasuryTier: try optionalString(json, "treasuryTier").map(treasuryTier),
            flameRecord: int(json, "flameRecord"),
            pastCycleRecords: json["pastCycleRecords"].isNull ? nil : json["pastCycleRecords"].arrayValue.compactMap(\.intValue)
        )
    }

    private static func photoPacing(_ json: GameJSON) throws -> PhotoAlertPacing {
        guard let surface = PhotoAlertPacing.Surface(rawValue: string(json, "surface")) else {
            throw GameLawVectorError.malformed("surface « \(string(json, "surface")) »")
        }
        return PhotoAlertPacing(
            now: int(json, "now"),
            dayKey: string(json, "dayKey"),
            sessionStartedAt: optionalInt(json, "sessionStartedAt"),
            surface: surface,
            shown: json["shown"].arrayValue.map { PhotoAlertPacing.Shown(at: int($0, "at"), dayKey: string($0, "dayKey")) }
        )
    }

    private static func photoPolicy(_ json: GameJSON) throws -> PhotoAlertPolicy {
        guard let photographs = PhotoAlertPolicy.Photographs(rawValue: string(json, "photographs")),
              let invitations = PhotoAlertPolicy.Invitations(rawValue: string(json, "invitations")),
              let backlog = PhotoAlertPolicy.Backlog(rawValue: string(json, "backlog")) else {
            throw GameLawVectorError.malformed("politique illisible")
        }
        let inApp = json["inApp"], push = json["push"]
        return PhotoAlertPolicy(
            photographs: photographs,
            invitations: invitations,
            backlog: backlog,
            inApp: .init(perDay: int(inApp, "perDay"), minGapMinutes: int(inApp, "minGapMinutes"),
                         sessionGraceMinutes: int(inApp, "sessionGraceMinutes")),
            push: .init(perDay: int(push, "perDay"), delayMinutes: int(push, "delayMinutes"),
                        nightFromHour: int(push, "nightFromHour"), nightToHour: int(push, "nightToHour"))
        )
    }

    private static func photoPolicyJSON(_ policy: PhotoAlertPolicy) -> GameJSON {
        object([
            "photographs": .string(policy.photographs.rawValue),
            "invitations": .string(policy.invitations.rawValue),
            "backlog": .string(policy.backlog.rawValue),
            "inApp": object(["perDay": .int(policy.inApp.perDay), "minGapMinutes": .int(policy.inApp.minGapMinutes),
                             "sessionGraceMinutes": .int(policy.inApp.sessionGraceMinutes)]),
            "push": object(["perDay": .int(policy.push.perDay), "delayMinutes": .int(policy.push.delayMinutes),
                            "nightFromHour": .int(policy.push.nightFromHour), "nightToHour": .int(policy.push.nightToHour)]),
        ])
    }
}
