import XCTest
@testable import Meeshy
import MeeshySDK

/// Page Progression (#10846) : la paire POCHE / TOTAL À VIE et la paire NIVEAU / MAX À VIE sont TOUJOURS affichées,
/// même quand le max égale le niveau (décision porteur 2026-10-16).
@MainActor
final class GameSparkPairsTests: XCTestCase {

    private func level(level: Int = 9, score: Int = 8_200, record: Int = 9, sparks: Int? = nil, cycle: Int? = nil,
                       lifetime: Int? = nil, levelMax: Int? = nil) -> GameBlock.Level {
        GameBlock.Level(level: level, tier: .etincelle, score: score, floorScore: 8_100, nextThreshold: 10_000,
                        pointsToNext: 1_800, progress: 0.05, record: record, prestige: 0, canPrestige: false,
                        sparks: sparks, sparksCycle: cycle, sparksLifetime: lifetime, levelMaxLifetime: levelMax)
    }

    func test_pairs_readThePocketTheLifetimeTheLevelAndItsMax() {
        let pairs = GameSparkPairs(level(sparks: 5_000, cycle: 8_200, lifetime: 12_000, levelMax: 40))
        XCTAssertEqual(pairs.pocket, 5_000)
        XCTAssertEqual(pairs.lifetime, 12_000)
        XCTAssertEqual(pairs.level, 9)
        XCTAssertEqual(pairs.levelMax, 40)
    }

    func test_theMaxEqualToTheLevel_isStillShown() {
        let pairs = GameSparkPairs(level(sparks: 100, lifetime: 100, levelMax: 9))
        XCTAssertEqual(pairs.levelMax, 9)
        XCTAssertEqual(pairs.facts.count, 4, "les deux paires, toujours")
    }

    /// Un serveur d'avant les étincelles : la poche se lit sur `score`, le total à vie jamais sous elle, le max sur le record.
    func test_olderServer_fallsBackSafely() {
        let pairs = GameSparkPairs(level(score: 8_200, record: 11))
        XCTAssertEqual(pairs.pocket, 8_200)
        XCTAssertEqual(pairs.lifetime, 8_200)
        XCTAssertEqual(pairs.levelMax, 11)
    }

    func test_facts_namePocketLifetimeLevelAndMax_inThatOrder() {
        let facts = GameSparkPairs(level(sparks: 5_000, lifetime: 12_000, levelMax: 40)).facts
        XCTAssertEqual(facts.map(\.label), [GameSparksCopy.pocketLabel, GameSparksCopy.lifetimeLabel,
                                            GameSparksCopy.levelLabel, GameSparksCopy.levelMaxLabel])
        XCTAssertEqual(facts[0].value, GameCopy.points(5_000))
        XCTAssertEqual(facts[3].value, GameCopy.formatCount(40))
    }

    /// La fiche du niveau porte les deux paires — et ne prend plus le CYCLE (`score`) pour la poche.
    func test_levelRingDetail_carriesBothPairs_andReadsThePocketNotTheCycle() {
        let detail = GameElementDetails.levelRing(level(score: 8_200, sparks: 5_000, cycle: 8_200, lifetime: 12_000, levelMax: 40))
        let labels = detail.facts.map(\.label)
        for label in [GameSparksCopy.pocketLabel, GameSparksCopy.lifetimeLabel, GameSparksCopy.levelLabel, GameSparksCopy.levelMaxLabel] {
            XCTAssertTrue(labels.contains(label), label)
        }
        XCTAssertEqual(detail.facts.first { $0.label == GameSparksCopy.pocketLabel }?.value, GameCopy.points(5_000))
    }

    func test_theHero_showsBothPairs() throws {
        let hero = AppSourceGuard.stripComments(try AppSourceGuard.unit("Meeshy/Features/Main/Game/GameHeroView.swift"))
        XCTAssertTrue(hero.contains("GameSparkPairsRow(pairs: GameSparkPairs(game.level))"))
    }
}
