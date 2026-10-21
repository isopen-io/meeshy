import XCTest
@testable import Meeshy
import MeeshySDK

/// Page Progression (#10846, #10860) : la paire CONVERTIBLES / RECORD D'ÉTINCELLES et la paire NIVEAU / RECORD DE
/// NIVEAU sont TOUJOURS affichées, même quand le record égale le niveau (décision porteur 2026-10-16) ; vocabulaire des
/// trois records (porteur 2026-10-17, #10899).
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
        XCTAssertEqual(pairs.cycle, 8_200)
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

    /// La poche est « Ta lumière » (épopée, #11179, § 4) : ni « En poche » ni « Convertibles ».
    /// Le témoin lisait le libellé RÉSOLU et le comparait au français : la CI tourne en anglais et rougissait sans
    /// défaut. Le mot du porteur se vérifie au CATALOGUE ; l'écran, dans la langue où tournent les témoins.
    func test_pocketLabel_saysTaLumiere() throws {
        XCTAssertEqual(try catalogValue("game.sparks.pocket.label", "fr"), "Ta lumière")
        XCTAssertEqual(GameSparksCopy.pocketLabel, try catalogValue("game.sparks.pocket.label", Self.runningLanguage))
    }

    /// Après une renaissance : le cycle d'abord, puis tout ce qui a été reçu — « 8 200 cet Âge · 12 000 en tout » (#10899, #11179).
    func test_cumul_afterAPrestige_readsTheCycleThenTheSparkRecord() throws {
        let pairs = GameSparkPairs(level(sparks: 5_000, cycle: 8_200, lifetime: 12_000, levelMax: 40))
        XCTAssertEqual(try catalogValue("game.sparks.cumul.record", "fr"), "%1$@ cet Âge · %2$@ en tout")
        let format = try catalogValue("game.sparks.cumul.record", Self.runningLanguage)
        let expected = format.replacingOccurrences(of: "%1$@", with: GameCopy.formatCount(8_200))
            .replacingOccurrences(of: "%2$@", with: GameCopy.formatCount(12_000))
        XCTAssertEqual(pairs.cumulLine, expected)
        XCTAssertEqual(pairs.facts[1].value, expected, "la fiche dit le même cycle et le même record")
    }

    /// Sous le niveau : la plus haute lumière, nommée — « Ta plus haute lumière : niveau 40 » (#10899, #11179).
    func test_levelLine_saysTheLevelRecord() throws {
        XCTAssertEqual(try catalogValue("game.sparks.levelRecord.line", "fr"), "Ta plus haute lumière : niveau %@")
        let format = try catalogValue("game.sparks.levelRecord.line", Self.runningLanguage)
        XCTAssertEqual(GameSparksCopy.levelRecordLine(40), format.replacingOccurrences(of: "%@", with: GameCopy.formatCount(40)))
        let row = try AppSourceGuard.unit("Meeshy/Features/Main/Game/GameSparkPairs.swift")
        XCTAssertTrue(row.contains("small: GameSparksCopy.levelRecordLine(pairs.levelMax)"), "la paire du niveau dit son record")
    }

    /// La langue dans laquelle l'app hôte résout ses chaînes (la CI tourne en anglais, un poste peut être en français).
    private static var runningLanguage: String {
        let language = Bundle.main.preferredLocalizations.first ?? "en"
        return String(language.prefix(2))
    }

    private func catalogValue(_ key: String, _ locale: String) throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Localizable.xcstrings")
        let json = try XCTUnwrap(JSONSerialization.jsonObject(with: Data(contentsOf: url)) as? [String: Any])
        let entry = try XCTUnwrap((json["strings"] as? [String: Any])?[key] as? [String: Any])
        let unit = try XCTUnwrap(((entry["localizations"] as? [String: Any])?[locale] as? [String: Any])?["stringUnit"] as? [String: Any])
        return try XCTUnwrap(unit["value"] as? String)
    }

    /// Sans renaissance, le cycle égale le total : « 12 000 reçues depuis toujours », un seul nombre (#10899, #11179).
    func test_cumul_withoutPrestige_saysTheSparkRecord() throws {
        let pairs = GameSparkPairs(level(sparks: 5_000, cycle: 12_000, lifetime: 12_000, levelMax: 40))
        XCTAssertEqual(try catalogValue("game.sparks.record.line", "fr"), "%@ reçues depuis toujours")
        let format = try catalogValue("game.sparks.record.line", Self.runningLanguage)
        XCTAssertEqual(pairs.cumulLine, format.replacingOccurrences(of: "%@", with: GameCopy.formatCount(12_000)))
        XCTAssertEqual(pairs.facts[1].value, GameCopy.formatCount(12_000))
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
