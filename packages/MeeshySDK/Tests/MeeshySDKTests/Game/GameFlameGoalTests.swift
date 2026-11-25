import Foundation
import Testing
@testable import MeeshySDK

/// L'objectif de Flamme (#17379, #20522) : la loi est le miroir de `packages/shared/utils/game/flame-goal.ts`, et le
/// bloc la lit sans jamais tomber.
@Suite("Jeu Meeshy — l'objectif de Flamme")
struct GameFlameGoalTests {

    private static func flame(goal: String?) throws -> GameBlock.Flame {
        let goalField = goal.map { #","goal":\#($0)"# } ?? ""
        let json = #"{"days":1,"form":"braise","bonusPercent":1,"freezes":0,"maxFreezes":2,"freezePrice":1,"relightPrice":3,"status":"lit","canRelight":false\#(goalField)}"#
        return try JSONDecoder().decode(GameBlock.Flame.self, from: Data(json.utf8))
    }

    @Test("l'échelle : les trois choix du premier jour, puis les formes de la Flamme au-delà")
    func ladder() {
        #expect(GameFlameGoalLaw.firstChoices == [7, 14, 30])
        #expect(GameFlameGoalLaw.ladder == [7, 14, 30, 100, 365])
        #expect(GameFlameGoalLaw.next(after: 7) == 14)
        #expect(GameFlameGoalLaw.next(after: 30) == 100)
        #expect(GameFlameGoalLaw.next(after: 365) == nil)
    }

    @Test("un objectif choisi au premier jour court, et dit ce qu'il reste")
    func chosenRuns() {
        #expect(GameFlameGoalLaw.servedAfterChoosing(target: 14, streak: 1)
                == GameServedFlameGoal(offer: [], current: GameServedFlameGoal.Current(target: 14, remaining: 13, reached: false, next: nil)))
    }

    @Test("une marche choisie sur une Flamme qui l'atteint déjà est atteinte, et propose la suivante")
    func chosenReached() {
        #expect(GameFlameGoalLaw.servedAfterChoosing(target: 100, streak: 100)
                == GameServedFlameGoal(offer: [365], current: GameServedFlameGoal.Current(target: 100, remaining: 0, reached: true, next: 365)))
        #expect(GameFlameGoalLaw.servedAfterChoosing(target: 7, streak: 0) == nil, "sans Flamme, rien à retenir")
    }

    @Test("la clé qui ferme le signe des aïeux est celle du web")
    func nextSeenKey() {
        #expect(GameFlameGoalLaw.nextSeenKey(reachedTarget: 7) == "flame-goal-next-7")
    }

    @Test("le bloc lit l'objectif servi, avec `next` nul")
    func decodesTheServedGoal() throws {
        let flame = try Self.flame(goal: #"{"offer":[],"current":{"target":7,"remaining":6,"reached":false,"next":null}}"#)
        #expect(flame.goal == GameServedFlameGoal(offer: [], current: GameServedFlameGoal.Current(target: 7, remaining: 6, reached: false, next: nil)))
        let choose = try Self.flame(goal: #"{"offer":[7,14,30],"current":null}"#)
        #expect(choose.goal == GameServedFlameGoal(offer: [7, 14, 30], current: nil))
    }

    @Test("un serveur antérieur ou un objectif illisible rend la carte d'avant, sans faire tomber le bloc")
    func tolerantDecoding() throws {
        #expect(try Self.flame(goal: nil).goal == nil)
        #expect(try Self.flame(goal: #"{"offer":"sept"}"#).goal == nil)
        #expect(try Self.flame(goal: #"{"offer":[-7],"current":null}"#).goal == nil)
        #expect(try Self.flame(goal: #"{"offer":[],"current":{"target":7}}"#).goal == nil)
    }

    @Test("la réponse du choix porte l'objectif servi")
    func decodesTheResponse() throws {
        let json = #"{"status":"already-chosen","goal":{"offer":[],"current":{"target":30,"remaining":29,"reached":false,"next":null}}}"#
        let response = try JSONDecoder().decode(FlameGoalResponse.self, from: Data(json.utf8))
        #expect(response.alreadyDone)
        #expect(response.goal.current?.remaining == 29)
    }
}
