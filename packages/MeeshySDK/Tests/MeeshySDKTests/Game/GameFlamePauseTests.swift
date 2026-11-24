import Foundation
import Testing
@testable import MeeshySDK

/// La Flamme en veille (#17372, #20510) : la loi est le miroir de `packages/shared/utils/game/flame-pause.ts`, et le
/// bloc la lit sans jamais tomber.
@Suite("Jeu Meeshy — la Flamme en veille")
struct GameFlamePauseTests {

    private static let week = GameFlamePause(from: "2026-11-24", until: "2026-11-30")

    @Test("la veille s'ouvre DEMAIN, pour le nombre de jours annoncé")
    func opensTomorrow() {
        #expect(GameFlamePauseLaw.canPause(today: "2026-11-23", days: 7, status: .lit, pause: nil) == .allowed(Self.week))
        #expect(GameFlamePauseLaw.canPause(today: "2026-11-23", days: 1, status: .atRisk, pause: nil)
                == .allowed(GameFlamePause(from: "2026-11-24", until: "2026-11-24")))
        #expect(GameFlamePauseLaw.canPause(today: "2026-11-23", days: 3, status: .covered, pause: nil)
                == .allowed(GameFlamePause(from: "2026-11-24", until: "2026-11-26")))
    }

    @Test("hors de un à sept jours, la veille est refusée", arguments: [0, 8, -1])
    func refusesInvalidDays(days: Int) {
        #expect(GameFlamePauseLaw.canPause(today: "2026-11-23", days: days, status: .lit, pause: nil) == .refused(.invalidDays))
    }

    @Test("rien à garder sans Flamme, ni pour une Flamme éteinte")
    func refusesWithoutFlame() {
        #expect(GameFlamePauseLaw.canPause(today: "2026-11-23", days: 3, status: .none, pause: nil) == .refused(.noFlame))
        #expect(GameFlamePauseLaw.canPause(today: "2026-11-23", days: 3, status: .out, pause: nil) == .refused(.noFlame))
    }

    @Test("une seconde annonce pendant une veille en cours ou à venir est refusée")
    func refusesDuringAPause() {
        for today in ["2026-11-23", "2026-11-27", "2026-11-30"] {
            #expect(GameFlamePauseLaw.canPause(today: today, days: 3, status: .lit, pause: Self.week) == .refused(.alreadyPaused))
        }
    }

    @Test("une fois par trimestre civil : la veille de novembre ferme décembre, pas janvier")
    func oncePerQuarter() {
        #expect(GameFlamePauseLaw.canPause(today: "2026-12-05", days: 3, status: .lit, pause: Self.week) == .refused(.quarterlyLimit))
        #expect(GameFlamePauseLaw.canPause(today: "2026-12-31", days: 3, status: .lit, pause: Self.week)
                == .allowed(GameFlamePause(from: "2027-01-01", until: "2027-01-03")))
        #expect(GameFlamePauseLaw.quarter(of: "2026-03-31") == "2026-T1")
        #expect(GameFlamePauseLaw.quarter(of: "2026-04-01") == "2026-T2")
        #expect(GameFlamePauseLaw.quarter(of: "2026-12-31") == "2026-T4")
    }

    @Test("une veille terminée avant de commencer ne compte pas pour le trimestre")
    func cancelledPauseDoesNotCount() {
        let cancelled = GameFlamePause(from: "2026-11-24", until: "2026-11-23")
        #expect(GameFlamePauseLaw.canPause(today: "2026-11-25", days: 2, status: .lit, pause: cancelled)
                == .allowed(GameFlamePause(from: "2026-11-26", until: "2026-11-27")))
    }

    @Test("annoncée, la veille commence après aujourd'hui ; commencée, non")
    func startsAfterToday() {
        #expect(Self.week.startsAfter("2026-11-23"))
        #expect(!Self.week.startsAfter("2026-11-24"))
        #expect(!Self.week.startsAfter("2026-11-27"))
    }

    private static func withPause(_ pause: String) -> Data {
        Data(GameBlockFixture.json.replacingOccurrences(
            of: "\"canRelight\":false}", with: "\"canRelight\":false,\"pause\":\(pause)}"
        ).utf8)
    }

    @Test("la veille servie se lit, et survit à l'aller-retour")
    func pauseIsRead() throws {
        let flame = try #require(GameBlock.parse(Self.withPause(#"{"from":"2026-11-24","until":"2026-11-30"}"#))).flame
        #expect(flame.pause == Self.week)
        let roundTrip = try JSONDecoder().decode(GameBlock.Flame.self, from: JSONEncoder().encode(flame))
        #expect(roundTrip == flame)
    }

    @Test("un serveur antérieur ou une veille illisible ne casse pas le bloc : la carte d'avant",
          arguments: [#""oops""#, #"{"from":"demain","until":"2026-11-30"}"#, #"{"from":"2026-11-24"}"#, "null"])
    func pauseIsTolerant(served: String) throws {
        let block = try #require(GameBlock.parse(Self.withPause(served)))
        #expect(block.flame.pause == nil)
        #expect(block.flame.days == 4)
        #expect(try #require(GameBlock.parse(GameBlockFixture.data)).flame.pause == nil)
    }

    @Test("la réponse de l'annonce se décode, rejouée comprise")
    func responseDecodes() throws {
        let json = #"{"status":"already-paused","pause":{"from":"2026-11-24","until":"2026-11-30"}}"#
        let response = try JSONDecoder().decode(FlamePauseResponse.self, from: Data(json.utf8))
        #expect(response.pause == Self.week)
        #expect(response.alreadyDone)
    }

    @Test("le refus porte sa raison, posée à la racine de l'enveloppe")
    func rejectionCarriesItsReason() throws {
        let body = #"{"success":false,"error":"refus","code":"FLAME_PAUSE_NOT_ALLOWED","reason":"quarterly-limit"}"#
        let envelope = try JSONDecoder().decode(APIRejectionEnvelope.self, from: Data(body.utf8))
        let rejection = envelope.rejection(statusCode: 409, fallbackMessage: "x")
        #expect(rejection.code == "FLAME_PAUSE_NOT_ALLOWED")
        #expect(rejection.reason == "quarterly-limit")
        #expect(FlamePauseRefusal(rawValue: rejection.reason ?? "") == .quarterlyLimit)
    }
}
