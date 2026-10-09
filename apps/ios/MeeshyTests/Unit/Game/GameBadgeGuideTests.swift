import XCTest
import SwiftUI
@testable import Meeshy
import MeeshySDK
import MeeshyUI

/// **Chaque badge dit SA règle** (#9640, jumelle de #9639) — ce qui compte pour CET axe, sa matière et pourquoi, ses
/// étoiles sur sept, ses sept paliers (atteints datés, à venir avec leur seuil), ce qu'il manque pour la prochaine
/// étoile ; l'étagère range les badges par famille avec leur suite ; « Comprendre les badges » mène, partout, à LA
/// section badges du carnet des règles. La loi est celle du SDK (`BadgeGuideResolver`) : ces témoins interrogent sa
/// mise en mots (`GameBadgeGuideModel`), la fiche, l'étagère, la carte de navigation et le carnet.
@MainActor
final class GameBadgeGuideTests: XCTestCase {

    private var ecran: RenderedScreen?

    override func tearDown() {
        ecran?.dismount()
        ecran = nil
        super.tearDown()
    }

    private static let october = "2026-10-03T09:00:00.000Z"

    private func guide(_ axis: EngagementAxisKey = .textMessage, count: Int, served: [BadgeServedTier] = []) -> GameBadgeGuideModel {
        GameBadgeGuideModel.make(BadgeGuideResolver.resolve(axis: axis, count: count, served: served))
    }

    private func progress(counters: [APIEngagementProgress.Counter], served: [APIEngagementProgress.Milestone] = []) -> EngagementProgress {
        EngagementProgressResolver.resolve(APIEngagementProgress(
            counters: counters, milestones: served,
            streak: .init(currentStreakDays: 0, longestStreakDays: 0), level: .init(engagementScore: 0)
        ))
    }

    private func longDate(_ iso: String) -> String {
        EngagementProgressResolver.reachedDate(iso)?.formatted(date: .long, time: .omitted) ?? ""
    }

    // MARK: - Ce qui compte : la phrase de l'AXE, jamais celle de la famille

    func test_whatCounts_eachAxisHasItsOwnSentence_neverTheFamilyOne() {
        let sentences = EngagementAxisKey.allCases.map { ProgressionCopy.whatCounts(for: $0) }
        XCTAssertEqual(Set(sentences).count, EngagementAxisKey.allCases.count, "deux badges partagent leur explication")
        XCTAssertFalse(sentences.contains(GameDetailText.what(.badge) ?? ""), "un badge dit encore la phrase de la famille")
        XCTAssertNotEqual(ProgressionCopy.whatCounts(for: .friendship), ProgressionCopy.whatCounts(for: .trackedLink),
                          "les amitiés et les liens disent la même chose")
    }

    // MARK: - La matière, et pourquoi

    func test_make_beforeTheFirstTier_saysNoStarYet_andTheCopperToCome() {
        let model = guide(count: 0)

        XCTAssertNil(model.material)
        XCTAssertEqual(model.reason, GameBadgeGuideText.reasonNone)
        XCTAssertEqual(model.stars, 0)
        XCTAssertEqual(model.starsMax, 7)
        XCTAssertEqual(model.ladder.count, 7, "sept paliers, du cuivre au prisme")
        XCTAssertEqual(model.ladder.first?.state, .next)
        XCTAssertEqual(model.ladder.dropFirst().map(\.state), Array(repeating: .upcoming, count: 6))
        XCTAssertEqual(model.next, GameBadgeGuideText.next(missing: "1", material: GameCopy.materialName(.copper), threshold: "1"))
    }

    func test_make_aCrossedThreshold_saysWhyThisMaterial_andWhatIsMissingForTheNextStar() {
        let model = guide(count: 12)

        XCTAssertEqual(model.material, .bronze)
        XCTAssertEqual(model.reason, GameBadgeGuideText.reasonCrossed(
            material: GameCopy.materialName(.bronze), threshold: GameCopy.formatCount(10), count: GameCopy.formatCount(12)
        ))
        XCTAssertEqual(model.stars, 2)
        XCTAssertEqual(model.next, GameBadgeGuideText.next(
            missing: GameCopy.formatCount(38), material: GameCopy.materialName(.silver), threshold: GameCopy.formatCount(50)
        ))
        XCTAssertEqual(model.ladder.map(\.state), [.reached, .reached, .next, .upcoming, .upcoming, .upcoming, .upcoming])
        XCTAssertEqual(model.ladder[2].line, GameBadgeGuideText.rungNext(missing: GameCopy.formatCount(38)))
        XCTAssertEqual(model.ladder[3].line, GameBadgeGuideText.rungUpcoming(threshold: GameCopy.formatCount(100)))
        XCTAssertEqual(model.upcoming.map(\.threshold), [50, 100, 500, 1_000, 5_000], "la suite du badge, dans l'ordre")
    }

    func test_make_aTierHeldByItsEngravedTrace_saysWhenItWasEarned_withItsServedDate() {
        let model = guide(count: 3, served: [BadgeServedTier(threshold: 10, reachedAt: Self.october)])

        XCTAssertEqual(model.material, .bronze, "le palier gravé tient la matière même compteur retombé")
        XCTAssertEqual(model.reason, GameBadgeGuideText.reasonServed(material: GameCopy.materialName(.bronze), threshold: GameCopy.formatCount(10)))
        XCTAssertEqual(model.ladder[1].line, GameDetailText.earnedOn(longDate(Self.october)))
        XCTAssertEqual(model.ladder[0].line, GameDetailText.earned, "sans date servie, aucune date ne s'invente")
    }

    func test_make_atThePrism_theLadderIsComplete() {
        let model = guide(count: 6_000)

        XCTAssertEqual(model.material, .prism)
        XCTAssertEqual(model.stars, 7)
        XCTAssertEqual(model.next, GameBadgeGuideText.complete)
        XCTAssertTrue(model.upcoming.isEmpty)
    }

    // MARK: - VoiceOver : un palier, une phrase

    func test_everyRung_readsInOneSentence_materialThresholdAndState() {
        let model = guide(count: 12)
        for rung in model.ladder {
            XCTAssertTrue(rung.accessibilityLabel.contains(rung.materialName), "\(rung.threshold) : la matière n'est pas dite")
            XCTAssertTrue(rung.accessibilityLabel.contains(rung.thresholdLabel), "\(rung.threshold) : le seuil n'est pas dit")
        }
        XCTAssertEqual(model.ladder[0].accessibilityLabel,
                       GameBadgeGuideText.rungReachedA11y(material: GameCopy.materialName(.copper), threshold: GameCopy.formatCount(1)))
        XCTAssertEqual(model.ladder[2].accessibilityLabel, GameBadgeGuideText.rungNextA11y(
            material: GameCopy.materialName(.silver), threshold: GameCopy.formatCount(50), missing: GameCopy.formatCount(38)
        ))
        XCTAssertEqual(model.ladder[3].accessibilityLabel,
                       GameBadgeGuideText.rungUpcomingA11y(material: GameCopy.materialName(.gold), threshold: GameCopy.formatCount(100)))
    }

    func test_aBadge_readsInOneSentence_itsAxisItsMaterialItsStarsAndTheNextStep() {
        let model = guide(.friendship, count: 12)
        let sentence = model.accessibilityLabel(axisTitle: ProgressionCopy.title(for: .friendship))

        XCTAssertTrue(sentence.hasPrefix(ProgressionCopy.title(for: .friendship)))
        XCTAssertTrue(sentence.contains(GameCopy.materialName(.bronze)))
        XCTAssertTrue(sentence.contains(GameBadgeGuideText.starsA11y(lit: GameCopy.formatCount(2), max: GameCopy.formatCount(7))))
        XCTAssertTrue(sentence.contains(model.next))
    }

    // MARK: - La fiche d'un badge dit CE badge

    func test_theDetailOfABadge_saysWhatCountsForItsAxis_andCarriesItsGuide() throws {
        let served = progress(counters: [.init(axisKey: "content.text_message", count: 12), .init(axisKey: "social.friendship", count: 3)])
        let text = try XCTUnwrap(served.axes.first { $0.axis == .textMessage })
        let friends = try XCTUnwrap(served.axes.first { $0.axis == .friendship })

        let detail = GameElementDetails.badge(for: text, progress: served)

        XCTAssertEqual(detail.what, ProgressionCopy.whatCounts(for: .textMessage))
        XCTAssertEqual(detail.whatTitle, GameBadgeGuideText.countsLabel)
        XCTAssertEqual(detail.badge, GameBadgeGuideModel.make(BadgeGuideResolver.resolve(text)))
        XCTAssertEqual(detail.how, detail.badge?.next, "« comment l'obtenir » dit ce qu'il manque pour la prochaine étoile")
        XCTAssertTrue(detail.facts.contains { $0.label == GameBadgeGuideText.starsLabel && $0.value == ConceptText.ratio("2", "7") })
        XCTAssertNotEqual(GameElementDetails.badge(for: friends, progress: served).what, detail.what,
                          "deux badges ne partagent pas leurs explications")
    }

    func test_theSheetOfABadge_showsItsStarsItsReasonItsSevenRungs_andTheGuideLink() {
        let served = progress(counters: [.init(axisKey: "content.text_message", count: 12)])
        let detail = GameElementDetails.badge(for: served.axes.first { $0.axis == .textMessage }!, progress: served)
        var opened = 0
        let rendu = RenderedScreen(GameElementSheet(detail: detail, onOpenConcept: nil, onOpenBadgesGuide: { opened += 1 }),
                                   size: CGSize(width: 402, height: 2400))
        ecran = rendu

        let vus = rendu.identifiers
        for identifier in ["game.badge.stars", "game.badge.reason", "game.badge.ladder", "game.badge.guide"] {
            XCTAssertTrue(vus.contains(identifier), "« \(identifier) » manque à la fiche du badge. Vus : \(vus)")
        }
        for threshold in GameBadgeTiers.materials.map(\.threshold) {
            XCTAssertTrue(vus.contains("game.badge.rung.\(threshold)"), "le palier \(threshold) manque à l'échelle")
        }
        XCTAssertEqual(rendu.node("game.badge.reason")?.label, detail.badge?.reason)
        XCTAssertEqual(opened, 0, "rien ne s'ouvre sans toucher")
    }

    func test_theSheetOfAnotherElement_offersNoBadgeGuide() {
        let detail = GameElementDetails.freeze(GameFixture.game().flame)
        let rendu = RenderedScreen(GameElementSheet(detail: detail, onOpenConcept: nil, onOpenBadgesGuide: {}),
                                   size: CGSize(width: 402, height: 1600))
        ecran = rendu

        XCTAssertFalse(rendu.identifiers.contains("game.badge.guide"), "« Comprendre les badges » n'a rien à faire hors d'un badge")
        XCTAssertFalse(rendu.identifiers.contains("game.badge.ladder"))
    }

    // MARK: - L'étagère : par famille, un badge par axe, avec sa suite

    func test_theShelf_groupsTheEarnedBadgesByFamily_oneBadgePerAxis_withItsSuite() {
        let served = progress(counters: [
            .init(axisKey: "social.friendship", count: 60),
            .init(axisKey: "content.text_message", count: 12),
            .init(axisKey: "social.tracked_link", count: 1),
            .init(axisKey: "content.audio_message", count: 0),
        ])

        let groups = GameBadges.shelf(for: served)

        XCTAssertEqual(groups.map(\.family), [.content, .social], "l'ordre déclaré des familles, une famille vide ne paraît pas")
        XCTAssertEqual(groups.first?.entries.map(\.axis), [.textMessage], "un badge jamais gagné ne paraît pas")
        XCTAssertEqual(groups.last?.entries.map(\.axis), [.trackedLink, .friendship], "l'ordre du catalogue dans la famille")
        let friends = groups.last?.entries.last
        XCTAssertEqual(friends?.item.threshold, 50, "le badge montre SON plus haut palier, pas un par palier")
        XCTAssertEqual(friends?.guide.upcoming.map(\.threshold), [100, 500, 1_000, 5_000], "la suite de ses paliers")
    }

    func test_theShelf_offersTheGuideLink_evenBeforeTheFirstBadge() {
        var opened = 0
        let vue = GameBadgeShelfView(progress: progress(counters: [])).environment(\.gameOpenBadgesGuide, { opened += 1 })
        let rendu = RenderedScreen(vue, size: CGSize(width: 402, height: 800))
        ecran = rendu

        XCTAssertTrue(rendu.identifiers.contains("game.badge.guide"), "l'étagère n'offre pas « Comprendre les badges » : \(rendu.identifiers)")
        XCTAssertGreaterThanOrEqual(rendu.frame(of: "game.badge.guide")?.height ?? 0, MeeshyControlSize.tapTarget, "une cible de 44 pt")
    }

    // MARK: - « Comprendre les badges » : UNE adresse, la section badges du carnet

    func test_theBadgesGuide_isTheBadgesSectionOfTheRules_oneLevelBelowProgression() {
        let route = GameNavigationMap.badgesGuide

        XCTAssertEqual(route, .progressionRules(rule: nil, section: .badges))
        XCTAssertEqual(GameNavigationMap.parent(of: route), .progression, "le carnet est une porte de la première page")
        XCTAssertEqual(GameNavigationMap.level(of: route), 2)
        XCTAssertEqual(GameNavigationMap.chain(to: route), [.progression, route])
    }

    // MARK: - La section badges du carnet des règles

    func test_theRulesBadgesSection_saysTheSevenMaterialsInOrder_andTheTwentyBadgesByFamily() {
        XCTAssertEqual(GameRulesBadges.materials.map(\.threshold), [1, 10, 50, 100, 500, 1_000, 5_000])
        XCTAssertEqual(GameRulesBadges.materials.map { GameMaterial(badge: $0.key) },
                       [.copper, .bronze, .silver, .gold, .platinum, .obsidian, .prism])
        XCTAssertEqual(GameRulesBadges.families.map(\.family), EngagementAxisFamily.allCases)
        XCTAssertEqual(GameRulesBadges.families.flatMap(\.guides).map(\.axis).sorted { $0.rawValue < $1.rawValue },
                       EngagementAxisKey.allCases.sorted { $0.rawValue < $1.rawValue }, "les vingt badges, chacun une fois")
    }

    func test_theRulesPage_rendersTheBadgesSection() {
        let rendu = RenderedScreen(GameRulesPage(focusedRule: nil, focusedSection: .badges), size: CGSize(width: 402, height: 9000))
        ecran = rendu

        let vus = rendu.identifiers
        XCTAssertTrue(vus.contains(GameRulesPage.sectionID(.badges)), "la section badges manque au carnet. Vus : \(vus)")
        for axis in EngagementAxisKey.allCases {
            XCTAssertTrue(vus.contains("game.rules.badges.axis.\(axis.rawValue)"), "\(axis.rawValue) manque à la section badges")
        }
    }

    // MARK: - Une médaille dessine le glyphe de SON axe

    /// Les alias de famille (`.text`, `.voice`, `.comment`, `.conversation`, `.tool`, `.social`) sont dépréciés depuis
    /// #9639 : un glyphe par axe. Aucune source de l'app ne les emploie plus.
    func test_noAppSource_drawsAMedalWithAFamilyGlyph() throws {
        let root = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("Meeshy")
        let walker = try XCTUnwrap(FileManager.default.enumerator(at: root, includingPropertiesForKeys: nil))
        let pattern = try NSRegularExpression(pattern: #"(glyph:\s*|GameMedalGlyph)\.(text|voice|comment|conversation|tool|social)\b"#)
        var offenders: [String] = []
        for case let url as URL in walker where url.pathExtension == "swift" {
            let code = try String(contentsOf: url, encoding: .utf8)
            if pattern.firstMatch(in: code, range: NSRange(code.startIndex..., in: code)) != nil {
                offenders.append(url.lastPathComponent)
            }
        }
        XCTAssertEqual(offenders, [], "ces fichiers dessinent encore le glyphe d'une famille")
    }

    // MARK: - Le catalogue : la phrase de chaque axe, dans les sept langues

    func test_everyWhatCountsSentence_isTranslatedInTheSevenLanguages() throws {
        let catalog = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Localizable.xcstrings")
        let root = try XCTUnwrap(try JSONSerialization.jsonObject(with: Data(contentsOf: catalog)) as? [String: Any])
        let strings = try XCTUnwrap(root["strings"] as? [String: Any])
        for axis in EngagementAxisKey.allCases {
            let key = "progression.axis.\(axis.rawValue).counts"
            let localizations = (strings[key] as? [String: Any])?["localizations"] as? [String: Any] ?? [:]
            var values: [String: String] = [:]
            for locale in ["fr", "en", "es", "de", "it", "pt-BR", "ar"] {
                let unit = (localizations[locale] as? [String: Any])?["stringUnit"] as? [String: Any]
                values[locale] = unit?["value"] as? String
                XCTAssertFalse((values[locale] ?? "").isEmpty, "\(key) : pas de \(locale)")
            }
            XCTAssertNotEqual(values["en"], values["fr"], "\(key) : l'anglais est le français recopié")
        }
    }
}
