import Foundation
import Testing
@testable import MeeshySDK

/// Le calendrier des saisons SERVI (#10232) — les comportements que les vecteurs ne disent qu'en chiffres.
/// Miroir de `packages/shared/utils/game/season-schedule.ts` ; les cas de bout en bout vivent dans
/// `GameLawVectorTests` (loi `season-schedule`).
@Suite("Jeu Meeshy — le calendrier des saisons servi")
struct GameSeasonScheduleTests {

    private static func def(_ number: Int, _ startDay: String, status: String = "scheduled",
                            themeKey: String = "language:fr", stepPoints: Int = 100, copy: Any = NSNull()) -> [String: Any] {
        ["number": number, "startDay": startDay, "status": status, "themeKey": themeKey, "stepPoints": stepPoints, "copy": copy]
    }

    private static func copy(title: String = "Saison du Japon") -> [String: Any] {
        Dictionary(uniqueKeysWithValues: SeasonSchedule.copyLocales.map { locale in
            (locale, ["title": title, "tagline": "Huit semaines", "description": "Une langue, quarante étapes."])
        })
    }

    @Test("le calendrier vide rend exactement la constante de `GameSeason`")
    func emptyScheduleIsTheConstant() {
        let schedule = SeasonSchedule.default
        #expect(schedule.revision == 0)
        for number in 1...5 {
            #expect(schedule.calendar(number: number) == GameSeason.calendar(number: number))
        }
        for day in ["2026-10-11", "2026-12-21", "2027-02-14", "2027-02-15", "2027-06-01"] {
            #expect(schedule.season(at: day) == GameSeason.season(at: day))
            #expect(schedule.week(at: day) == GameSeason.week(at: day))
        }
        let before = LeagueMoment(dayKey: "2026-10-11", minuteOfDay: 600)
        #expect(schedule.upcoming(of: before) == GameSeason.upcoming(of: before))
    }

    @Test("un calendrier illisible rend le repli, jamais une erreur")
    func unreadableScheduleFallsBack() {
        #expect(SeasonSchedule.normalize("pas un calendrier") == .default)
        #expect(SeasonSchedule.normalize(["revision": -1, "seasons": []]) == .default)
        #expect(SeasonSchedule.normalize(["revision": 1.5, "seasons": []]) == .default)
        #expect(SeasonSchedule.normalize(["revision": 2]) == .default)
        #expect(SeasonSchedule.normalize(data: Data("{".utf8)) == .default)
    }

    @Test("une définition illisible est ignorée : un mardi, des points hors bornes, un booléen pour un numéro")
    func unlawfulDefinitionsAreDropped() {
        let schedule = SeasonSchedule.normalize(["revision": 4, "seasons": [
            Self.def(1, "2026-12-22"),
            Self.def(2, "2027-03-01", stepPoints: 500),
            ["number": true, "startDay": "2027-05-03", "status": "scheduled", "themeKey": "language:fr", "stepPoints": 100],
            Self.def(3, "2027-05-03", themeKey: "language:xx"),
        ]])
        #expect(schedule.revision == 4)
        #expect(schedule.seasons.isEmpty)
    }

    @Test("décaler une saison future laisse un intervalle sans saison, puis les suivantes s'enchaînent depuis elle")
    func shiftedSeasonLeavesAGap() {
        let schedule = SeasonSchedule.normalize(["revision": 2, "seasons": [
            Self.def(1, "2026-12-21"),
            Self.def(2, "2027-03-01", themeKey: "language:ja", stepPoints: 150),
        ]])
        #expect(schedule.season(at: "2027-02-20") == nil)
        let gap = LeagueMoment(dayKey: "2027-02-20", minuteOfDay: 600)
        #expect(schedule.upcoming(of: gap)?.number == 2)
        #expect(schedule.calendar(number: 2)?.themeKey == "language:ja")
        #expect(schedule.season(at: "2027-03-01") == 2)
        #expect(schedule.calendar(number: 3)?.startDay == "2027-04-26")
        #expect(schedule.definition(number: 2)?.stepPoints == 150)
        #expect(schedule.definition(number: 3)?.stepPoints == GameSeason.stepPoints)
    }

    @Test("une saison en pause n'a plus de dates, ni celles qui la suivent")
    func pausedSeasonHasNoDates() {
        let schedule = SeasonSchedule.normalize(["revision": 2, "seasons": [
            Self.def(1, "2026-12-21"),
            Self.def(2, "2027-02-15", status: "paused"),
        ]])
        #expect(schedule.calendar(number: 2) == nil)
        #expect(schedule.calendar(number: 3) == nil)
        #expect(schedule.status(number: 3) == .paused)
        #expect(schedule.season(at: "2027-03-01") == nil)
        #expect(schedule.upcoming(of: LeagueMoment(dayKey: "2027-03-01", minuteOfDay: 600)) == nil)
    }

    @Test("une saison qui chevauche la précédente est ignorée")
    func overlappingSeasonIsDropped() {
        let schedule = SeasonSchedule.normalize(["revision": 3, "seasons": [
            Self.def(1, "2026-12-21"), Self.def(2, "2027-02-01"), Self.def(3, "2027-05-03", stepPoints: 120),
        ]])
        #expect(schedule.seasons.map(\.number) == [1, 3])
    }

    @Test("des textes en sept langues dans les limites passent ; des textes illisibles tombent seuls, jamais les dates")
    func copyIsBounded() {
        let lawful = SeasonSchedule.normalize(["revision": 1, "seasons": [Self.def(1, "2026-12-21", copy: Self.copy())]])
        #expect(lawful.seasons.first?.copy?["ar"]?.title == "Saison du Japon")
        let tooLong = SeasonSchedule.normalize(["revision": 1, "seasons": [
            Self.def(1, "2026-12-21", copy: Self.copy(title: String(repeating: "é", count: 31))),
        ]])
        #expect(tooLong.seasons.map(\.number) == [1])
        #expect(tooLong.seasons.first?.copy == nil)
        for forbidden in ["Va sur www.meeshy", "Voir meeshy.me/saison", "Gagne 10 €", "Prix en USD", "Saison\u{200B}cachée", "\u{202E}esrever"] {
            let refused = SeasonSchedule.normalize(["revision": 1, "seasons": [Self.def(1, "2026-12-21", copy: Self.copy(title: forbidden))]])
            #expect(refused.seasons.first?.copy == nil, "« \(forbidden) » ne devient jamais un texte de saison")
            #expect(refused.seasons.first?.startDay == "2026-12-21", "les dates restent")
        }
    }

    @Test("une saison en pause garde sa date prévue : ce qui la chevauche est ignoré, la suivante non définie en dérive")
    func pausedSeasonKeepsItsPlannedDate() {
        let schedule = SeasonSchedule.normalize(["revision": 3, "seasons": [
            Self.def(1, "2026-12-21"), Self.def(2, "2027-03-01", status: "paused"), Self.def(3, "2027-03-15"),
        ]])
        #expect(schedule.seasons.map(\.number) == [1, 2])
        #expect(schedule.definition(number: 3)?.startDay == "2027-04-26")
        #expect(schedule.calendar(number: 3) == nil)
    }

    @Test("la récompense d'une étape porte les points de SA saison ; sans eux, la loi (100)")
    func stepRewardCarriesTheSeasonPoints() {
        #expect(GameSeason.stepReward(1) == SeasonReward(kind: .points, amount: 100))
        #expect(GameSeason.stepReward(1, stepPoints: 150) == SeasonReward(kind: .points, amount: 150))
        #expect(GameSeason.stepReward(1, stepPoints: 0) == SeasonReward(kind: .points, amount: 100))
        #expect(GameSeason.stepReward(5, stepPoints: 150) == SeasonReward(kind: .fragment, amount: 1))
        let claim = GameSeason.claim(season: 2, step: 3, stepsReached: 3, claimed: [], sealOwned: false, stepPoints: 70)
        #expect(claim == .allowed(reward: SeasonReward(kind: .points, amount: 70), seal: nil))
    }

    @Test("le bloc saison lit `stepPoints` quand il est servi, et s'en passe quand il ne l'est pas")
    func seasonBlockDecodesOptionalStepPoints() throws {
        let base: [String: Any] = [
            "number": 1, "themeKey": "language:fr", "startDay": "2026-12-21", "endDay": "2027-02-14", "week": 1,
            "stars": 0, "steps": 0, "stepsTotal": 40, "starsToNext": 4, "progress": 0, "completed": false,
            "claimedSteps": [], "nextReward": NSNull(), "sealOwned": false, "sealPrice": 10,
        ]
        let without = try JSONDecoder().decode(GameSeasonBlock.self, from: JSONSerialization.data(withJSONObject: base))
        #expect(without.stepPoints == nil)
        #expect(without.servedStepPoints == GameSeason.stepPoints)
        var served = base
        served["stepPoints"] = 150
        let with = try JSONDecoder().decode(GameSeasonBlock.self, from: JSONSerialization.data(withJSONObject: served))
        #expect(with.servedStepPoints == 150)
    }
}
