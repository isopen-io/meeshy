import XCTest
import MeeshySDK
import MeeshyUI
@testable import Meeshy

/// La célébration plein écran montre le jeu (#9466, #9390) : la médaille d'un badge à la place de `medal.fill`, et le
/// liseré de la rareté mesurée d'un succès — fail-closed, comme la ligne du succès sur Progression.
@MainActor
final class AchievementRevealMedalTests: XCTestCase {

    // MARK: - La médaille d'un badge

    func test_aBadgeIsDrawnAsItsMedal_familyGlyphAndMaterialOfItsTier() throws {
        let medal = try XCTUnwrap(RevealMedal(reveal: .badge(axis: EngagementAxisKey.textMessage.rawValue, threshold: 100)))
        XCTAssertEqual(medal.family, GameMedalFamily(EngagementAxisKey.textMessage.family))
        XCTAssertEqual(medal.glyph, GameMedalGlyph(axis: .textMessage))
        XCTAssertEqual(medal.material, .gold)
        XCTAssertEqual(medal.threshold, 100)
    }

    func test_theSevenTiersWearTheSevenMaterials() throws {
        let expected: [(Int, GameMaterial)] = [
            (1, .copper), (10, .bronze), (50, .silver), (100, .gold), (500, .platinum), (1_000, .obsidian), (5_000, .prism),
        ]
        for (threshold, material) in expected {
            let medal = try XCTUnwrap(RevealMedal(reveal: .badge(axis: EngagementAxisKey.story.rawValue, threshold: threshold)))
            XCTAssertEqual(medal.material, material, "palier \(threshold)")
        }
    }

    func test_anAxisThisClientDoesNotKnow_keepsTheSymbol_neverAnInventedMedal() {
        XCTAssertNil(RevealMedal(reveal: .badge(axis: "axe.futur", threshold: 100)))
    }

    func test_onlyABadgeIsAMedal() {
        XCTAssertNil(RevealMedal(reveal: .achievement(.firstContent)))
        XCTAssertNil(RevealMedal(reveal: .streak(days: 30)))
        XCTAssertNil(RevealMedal(reveal: .level(12)))
    }

    // MARK: - La rareté d'un succès

    private func composed() throws -> EngagementReveal {
        let family = try XCTUnwrap(AchievementCatalog.families.first { $0.id == "conversation.join.count" })
        return .composedAchievement(family: family, tier: 10)
    }

    func test_theRarityKey_isTheOneTheGatewayMeasuresUnder() throws {
        XCTAssertEqual(EngagementReveal.achievement(.firstContent).achievementRarityKey, "achievement.first_content")
        let reveal = try composed()
        guard case .composedAchievement(let family, let tier) = reveal else { return XCTFail("un succès composé") }
        XCTAssertEqual(reveal.achievementRarityKey, family.key(tier: tier))
        XCTAssertNil(EngagementReveal.badge(axis: EngagementAxisKey.story.rawValue, threshold: 10).achievementRarityKey)
        XCTAssertNil(EngagementReveal.streak(days: 7).achievementRarityKey)
        XCTAssertNil(EngagementReveal.level(3).achievementRarityKey)
    }

    private func game(rarities: [String: GameRarityEntry]?) -> GameBlock {
        GameFixture.game().replacing(wave2: GameWave2(achievementRarities: rarities))
    }

    func test_theRarityIsReadInTheGameBlock_underTheKeyOfTheAchievement() {
        let entry = GameRarityEntry(rarity: .epic, holders: 50, population: 1_000)
        let block = game(rarities: ["achievement.first_content": entry])
        XCTAssertEqual(EngagementReveal.achievement(.firstContent).rarity(in: block), entry)
        XCTAssertNil(EngagementReveal.achievement(.editor).rarity(in: block), "une autre clé : aucune rareté")
        XCTAssertNil(EngagementReveal.achievement(.firstContent).rarity(in: game(rarities: nil)), "un ancien serveur ne la sert pas")
        XCTAssertNil(EngagementReveal.achievement(.firstContent).rarity(in: nil), "pas de cache : rien")
    }

    func test_theRimIsOnlyThatOfARarityWeMayShow() {
        XCTAssertEqual(RevealRim.border(for: GameRarityEntry(rarity: .epic, holders: 50, population: 1_000)), .violet)
        XCTAssertEqual(RevealRim.border(for: GameRarityEntry(rarity: .legendary, holders: 30, population: 5_000)), .gold)
        XCTAssertEqual(RevealRim.border(for: GameRarityEntry(rarity: .mythic, holders: 20, population: 5_000)), .prism)
        XCTAssertNil(RevealRim.border(for: GameRarityEntry(rarity: .epic, holders: 5, population: 1_000)), "sous 20 titulaires : fail-closed")
        XCTAssertNil(RevealRim.border(for: GameRarityEntry(rarity: .epic, holders: 50, population: 500)), "sous 1 000 comptes : fail-closed")
        XCTAssertNil(RevealRim.border(for: nil))
    }

    func test_whileTheGameIsHidden_theCelebrationCarriesNoRarity() {
        let entry = GameRarityEntry(rarity: .epic, holders: 50, population: 1_000)
        let block = game(rarities: ["achievement.first_content": entry])
        let reveal = EngagementReveal.achievement(.firstContent)
        XCTAssertEqual(RevealRim.entry(of: reveal, in: block, hidden: false), entry)
        XCTAssertNil(RevealRim.entry(of: reveal, in: block, hidden: true), "« Jeu masqué » : liseré compris")
    }

    // MARK: - Où c'est branché

    private func source(_ relative: String) throws -> String {
        let root = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
        return try String(contentsOf: root.appendingPathComponent(relative), encoding: .utf8)
    }

    func test_theFullScreenCelebrationDrawsTheMedalAndWearsTheRim() throws {
        let view = try source("Meeshy/Features/Main/Views/AchievementRevealView.swift")
        XCTAssertTrue(view.contains("GameMedalView("), "la médaille remplace le symbole d'un badge")
        XCTAssertTrue(view.contains("gameRarityRim("), "la célébration porte le liseré de rareté")
        XCTAssertTrue(view.contains("GameRarityLine("), "le nom de la rareté se lit en toutes lettres")
        XCTAssertFalse(view.contains("\"medal.fill\""), "le symbole littéral d'avant ne vit plus dans la vue")
    }

    func test_everyDoorToTheCelebrationPassesTheRarity() throws {
        for host in ["Meeshy/Features/Main/Views/EngagementRevealHost.swift",
                     "Meeshy/Features/Main/Views/ProgressionHub.swift",
                     "Meeshy/Features/Main/Game/ProgressionConceptPage.swift"] {
            XCTAssertTrue(try source(host).contains("RevealRim.entry("), "\(host) doit passer la rareté mesurée à la célébration")
        }
    }
}
