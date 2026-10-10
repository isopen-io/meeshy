import Foundation
import Testing
@testable import MeeshySDK

/// La mission personnelle du jour et son minuteur (#9539) : chaque carte de mission porte un minuteur jusqu'à la fin de
/// sa plage ; passé la fin, elle dit « Terminée » ou « Manquée » et plus aucune action ne reste.
@Suite("Jeu Meeshy — la mission personnelle et son minuteur")
struct GamePersonalMissionTests {

    private func date(_ iso: String) throws -> Date {
        try #require(GameMissionClock.parse(iso))
    }

    // MARK: - Le minuteur

    @Test("avant la plage : la carte annonce dans combien de temps elle commence")
    func upcoming() throws {
        let phase = GameMissionClock.phase(
            start: try date("2026-10-06T14:00:00.000Z"), end: try date("2026-10-06T16:00:00.000Z"),
            completed: false, now: try date("2026-10-06T13:30:00.000Z")
        )
        #expect(phase == .upcoming(startsIn: 1800))
    }

    @Test("pendant la plage : il reste le temps jusqu'à la fin")
    func running() throws {
        let phase = GameMissionClock.phase(
            start: try date("2026-10-06T14:00:00.000Z"), end: try date("2026-10-06T16:00:00.000Z"),
            completed: false, now: try date("2026-10-06T14:45:00.000Z")
        )
        #expect(phase == .running(remaining: 4500))
    }

    @Test("faite avant la fin : « faite », plus de minuteur")
    func doneInTime() throws {
        let phase = GameMissionClock.phase(
            start: nil, end: try date("2026-10-06T16:00:00.000Z"), completed: true, now: try date("2026-10-06T15:00:00.000Z")
        )
        #expect(phase == .done)
    }

    @Test("la plage est passée et la mission était faite : « Terminée »")
    func finished() throws {
        let phase = GameMissionClock.phase(
            start: nil, end: try date("2026-10-06T16:00:00.000Z"), completed: true, now: try date("2026-10-06T16:00:00.000Z")
        )
        #expect(phase == .finished)
    }

    @Test("la plage est passée et la mission n'était pas faite : « Manquée »")
    func missed() throws {
        let phase = GameMissionClock.phase(
            start: nil, end: try date("2026-10-06T16:00:00.000Z"), completed: false, now: try date("2026-10-06T16:00:01.000Z")
        )
        #expect(phase == .missed)
    }

    @Test("l'action (changer la mission) ne reste que tant que la plage court")
    func actionOnlyWhileRunning() throws {
        #expect(GameMissionClock.Phase.running(remaining: 10).allowsAction)
        #expect(!GameMissionClock.Phase.upcoming(startsIn: 10).allowsAction)
        #expect(!GameMissionClock.Phase.done.allowsAction)
        #expect(!GameMissionClock.Phase.finished.allowsAction)
        #expect(!GameMissionClock.Phase.missed.allowsAction)
    }

    // Le jour de jeu est celui du COMPTE (`dayKeyOf(now, User.timezone)`, repli UTC côté passerelle) : sa fin se lit
    // dans le même fuseau et au calendrier grégorien, jamais dans ceux de l'appareil (#9539).

    @Test("une mission du jour court jusqu'à minuit dans le fuseau du COMPTE, où que soit l'appareil")
    func dailyMissionEndsWithItsAccountDay() throws {
        let paris = try #require(GameMissionClock.endOfDay("2026-10-06", timezone: "Europe/Paris"))
        #expect(paris == (try date("2026-10-06T22:00:00.000Z")))
        let newYork = try #require(GameMissionClock.endOfDay("2026-10-06", timezone: "America/New_York"))
        #expect(newYork == (try date("2026-10-07T04:00:00.000Z")))
    }

    @Test("sans fuseau au compte, ou avec un fuseau inconnu : le jour de jeu est celui d'UTC, comme la passerelle")
    func dailyMissionFallsBackToUTC() throws {
        let utc = try date("2026-10-07T00:00:00.000Z")
        #expect(GameMissionClock.endOfDay("2026-10-06", timezone: nil) == utc)
        #expect(GameMissionClock.endOfDay("2026-10-06", timezone: "") == utc)
        #expect(GameMissionClock.endOfDay("2026-10-06", timezone: "Mars/Olympus") == utc)
    }

    @Test("un compte sans fuseau lu à 00 h 30 à Paris : la mission d'hier (UTC) court encore, elle n'est pas « Manquée »")
    func aDayThatStillRunsOnTheServerIsNotMissedOnTheDevice() throws {
        let end = try #require(GameMissionClock.endOfDay("2026-10-06", timezone: nil))
        let halfPastMidnightInParis = try date("2026-10-06T22:30:00.000Z")
        #expect(GameMissionClock.phase(start: nil, end: end, completed: false, now: halfPastMidnightInParis) == .running(remaining: 5400))
    }

    @Test("le passage à l'heure d'hiver ne décale pas la fin du jour")
    func dailyMissionEndsAtMidnightAcrossADaylightChange() throws {
        let end = try #require(GameMissionClock.endOfDay("2026-10-25", timezone: "Europe/Paris"))
        #expect(end == (try date("2026-10-25T23:00:00.000Z")))
    }

    @Test("une clé qui n'est pas un jour du calendrier ne fabrique aucune fin")
    func notADay() {
        #expect(GameMissionClock.endOfDay("pas-un-jour", timezone: "Europe/Paris") == nil)
        #expect(GameMissionClock.endOfDay("2026-13-40", timezone: "Europe/Paris") == nil)
        #expect(GameMissionClock.endOfDay("2026-02-30", timezone: nil) == nil)
        #expect(GameMissionClock.endOfDay("2026-10", timezone: nil) == nil)
    }

    @Test("une date illisible ne se devine pas")
    func unreadableDate() {
        #expect(GameMissionClock.parse("demain") == nil)
        #expect(GameMissionClock.parse("2026-10-06T14:00:00Z") != nil)
        #expect(GameMissionClock.parse("2026-10-06T14:00:00.250Z") != nil)
    }

    // MARK: - Ce que le bloc sert

    private func personalJSON(state: String = "active") -> String {
        """
        {"id":"p1","templateKey":"send-voice","difficulty":"easy","signal":"axis:content.voice","prism":false,"target":2,"progress":1,
        "reward":40,"glory":0,"completedAt":null,"startsAt":"2026-10-06T14:00:00.000Z","endsAt":"2026-10-06T16:00:00.000Z","state":"\(state)"}
        """
    }

    private func missions(personal: String?) throws -> GameBlock.Missions {
        let tail = personal.map { ",\"personal\":\($0)" } ?? ""
        let json = """
        {"dayKey":"2026-10-06","prismDay":false,"unlocked":true,"items":[],"rerollAvailable":true\(tail)}
        """
        return try JSONDecoder().decode(GameBlock.Missions.self, from: Data(json.utf8))
    }

    @Test("le bloc sert la mission personnelle à côté des trois du jour")
    func decodesPersonal() throws {
        let personal = try #require(try missions(personal: personalJSON()).personal)
        #expect(personal.mission.id == "p1")
        #expect(personal.state == .active)
        #expect(personal.startsAtDate == (try date("2026-10-06T14:00:00.000Z")))
        #expect(personal.endsAtDate == (try date("2026-10-06T16:00:00.000Z")))
    }

    @Test("un ancien serveur ne la sert pas : aucune mission personnelle")
    func absentPersonal() throws {
        #expect(try missions(personal: nil).personal == nil)
        #expect(try missions(personal: "null").personal == nil)
    }

    @Test("une mission personnelle illisible tombe seule, sans emporter le bloc")
    func unreadablePersonalFallsAlone() throws {
        let block = try missions(personal: personalJSON(state: "inconnu"))
        #expect(block.personal == nil)
        #expect(block.dayKey == "2026-10-06")
    }
}
