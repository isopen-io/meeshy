import Foundation
import Testing
@testable import MeeshySDK

/// LE RECORD DE CHAQUE CYCLE CLOS (#10911) — miroir de `closedCycleRecord`, `pastCycleRecordsAfterPrestige` et
/// `levelReachCount` (`packages/shared/utils/game/prestige.ts`, `photo-catch-up.ts`). La loi du carnet est en plus
/// rejouée sur les vecteurs partagés (`GameLawVectorEvaluatorPhoto`).
@Suite("Jeu Meeshy — un palier refait après un Prestige, et combien de fois il a été atteint")
struct GamePrestigeCycleRecordsTests {

    @Test("le cycle clos garde le plus haut du record et du niveau, jamais sous le niveau du Prestige")
    func closedCycleRecord() {
        #expect(GamePrestige.closedCycleRecord(levelRecord: 130, level: 110) == 130)
        #expect(GamePrestige.closedCycleRecord(levelRecord: 90, level: 120) == 120)
        #expect(GamePrestige.closedCycleRecord(levelRecord: nil, level: 1) == 100)
    }

    @Test("il s'ajoute aux cycles déjà clos ; devant un serveur qui ne les sert pas, rien ne s'invente")
    func pastCycleRecordsAfterPrestige() {
        #expect(GamePrestige.pastCycleRecordsAfterPrestige([150], levelRecord: 110, level: 100) == [150, 110])
        #expect(GamePrestige.pastCycleRecordsAfterPrestige(nil, levelRecord: 110, level: 100) == nil)
    }

    @Test("un cycle clos sans record servi a atteint au moins le niveau 100, jamais au-delà")
    func levelReachCount() {
        #expect(GamePhotoCatchUpLaw.levelReachCount(PhotoCatchUpStanding(levelRecord: 34, prestige: 2), level: 30) == 3)
        #expect(GamePhotoCatchUpLaw.levelReachCount(PhotoCatchUpStanding(levelRecord: 120, prestige: 2), level: 101) == 1)
        #expect(GamePhotoCatchUpLaw.levelReachCount(PhotoCatchUpStanding(levelRecord: 120, prestige: 2, pastCycleRecords: [130]), level: 101) == 2)
    }

    @Test("une identité de palier par cycle, celle d'hier au premier")
    func tierStepId() {
        #expect(GamePhotoCatchUpLaw.tierStepId(.lueur, prestige: 0) == "tier:lueur")
        #expect(GamePhotoCatchUpLaw.tierStepId(.lueur, prestige: 3) == "tier:lueur:3")
        #expect(GamePhotoCatchUpLaw.track(of: "tier:lueur:3") == .tier)
    }

    @Test("le bloc servi porte le record des cycles clos jusqu'à la situation du carnet")
    func decodesPastCycleRecords() throws {
        let ladder = #"{"level":12,"tier":"lueur","floorScore":14400,"nextThreshold":16900,"pointsToNext":2500,"progress":0,"record":12,"cap":499,"isMax":false,"pastCycleRecords":[150,100]}"#
        let decoded = try JSONDecoder().decode(GameBlock.Level.Ladder.self, from: Data(ladder.utf8))
        #expect(decoded.pastCycleRecords == [150, 100])
    }
}
