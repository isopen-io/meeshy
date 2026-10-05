import XCTest
@testable import Meeshy
import MeeshySDK

/// Ce que le jeu DIT (#9383, #9379) : aucun nom ne sort comme une clé brute, l'accord
/// ne passe pas par un `== 1` isolé, et chaque refus a sa phrase.
@MainActor
final class GameCopyTests: XCTestCase {

    private func assertNotRaw(_ text: String, _ label: String, file: StaticString = #filePath, line: UInt = #line) {
        XCTAssertFalse(text.isEmpty, "\(label) : vide", file: file, line: line)
        XCTAssertFalse(text.hasPrefix("game."), "\(label) rend une clé brute : \(text)", file: file, line: line)
        XCTAssertFalse(text.hasPrefix("onboarding."), "\(label) rend une clé brute : \(text)", file: file, line: line)
    }

    // MARK: - L'accord

    func test_zeroIsSingularInFrenchAndPortuguese_notInEnglish() {
        XCTAssertTrue(GameCopy.isSingular(0, languageCode: "fr"))
        XCTAssertTrue(GameCopy.isSingular(0, languageCode: "pt"))
        XCTAssertFalse(GameCopy.isSingular(0, languageCode: "en"))
    }

    func test_oneIsSingularEverywhere_twoNever() {
        for language in ["fr", "en", "es", "de", "it", "pt", "ar"] {
            XCTAssertTrue(GameCopy.isSingular(1, languageCode: language), language)
            XCTAssertFalse(GameCopy.isSingular(2, languageCode: language), language)
        }
    }

    func test_pointsAndMeeshes_carryTheCount_andTheSingularDiffersFromThePlural() {
        XCTAssertNotEqual(GameCopy.points(1), GameCopy.points(2))
        XCTAssertTrue(GameCopy.points(1294).contains(GameCopy.formatCount(1294)))
        XCTAssertTrue(GameCopy.meeshes(9).contains(GameCopy.formatCount(9)))
        assertNotRaw(GameCopy.meeshes(0), "aucune Meesh")
    }

    // MARK: - Les noms

    func test_everyTierRankTreasuryFlameFormEditionAndDifficulty_hasAName() {
        for tier in LevelTierKey.allCases { assertNotRaw(GameCopy.tierName(tier), "palier \(tier)") }
        for rank in GloryRank.allCases { assertNotRaw(GameCopy.rankName(rank), "rang \(rank)") }
        for tier in TreasuryTierKey.allCases { assertNotRaw(GameCopy.treasuryName(tier), "trésor \(tier)") }
        for form in FlameFormKey.allCases { assertNotRaw(GameCopy.flameFormName(form), "flamme \(form)") }
        for edition in MeeshEdition.allCases { assertNotRaw(GameCopy.editionName(edition), "édition \(edition)") }
        for difficulty in MissionDifficulty.allCases { assertNotRaw(GameCopy.difficultyName(difficulty), "difficulté \(difficulty)") }
    }

    func test_theNamesAreAllDistinct() {
        XCTAssertEqual(Set(GloryRank.allCases.map(GameCopy.rankName)).count, GloryRank.allCases.count)
        XCTAssertEqual(Set(LevelTierKey.allCases.map(GameCopy.tierName)).count, LevelTierKey.allCases.count)
    }

    func test_rankLabel_addsTheRomanDivision_exceptForMyth() {
        XCTAssertEqual(GameCopy.rankLabel(.voix, division: .ii), "\(GameCopy.rankName(.voix)) II")
        XCTAssertEqual(GameCopy.rankLabel(.mythe, division: nil), GameCopy.rankName(.mythe))
    }

    // MARK: - Les missions

    func test_everyTemplateOfTheLaw_hasAPhrase_neverTheGenericOne() {
        let generic = GameCopy.missionTitle(templateKey: "inconnu", target: 3)
        for template in GameMissions.templates {
            let phrase = GameCopy.missionTitle(templateKey: template.key, target: max(2, template.baseTarget))
            assertNotRaw(phrase, template.key)
            XCTAssertNotEqual(phrase, generic, "le gabarit \(template.key) n'a pas sa phrase")
        }
    }

    func test_aTemplateThisClientDoesNotKnow_staysAGenericMission() {
        XCTAssertEqual(GameCopy.missionTitle(templateKey: "futur", target: 1), GameCopy.missionTitle(templateKey: "autre-futur", target: 9))
    }

    func test_aMissionPhraseAgreesWithItsTarget() {
        XCTAssertNotEqual(
            GameCopy.missionTitle(templateKey: "send-voice", target: 1),
            GameCopy.missionTitle(templateKey: "send-voice", target: 4)
        )
        XCTAssertTrue(GameCopy.missionTitle(templateKey: "react-messages", target: 5).contains(GameCopy.formatCount(5)))
    }

    // MARK: - Les refus

    func test_everyRefusalCodeHasItsOwnSentence_distinctFromTheGenericOne() {
        let generic = GameCopy.errorMessage(for: nil as GameErrorCode?)
        assertNotRaw(generic, "refus générique")
        let sentences = GameErrorCode.allCases.map { GameCopy.errorMessage(for: $0) }
        XCTAssertEqual(Set(sentences).count, GameErrorCode.allCases.count)
        for code in GameErrorCode.allCases {
            let sentence = GameCopy.errorMessage(for: code)
            assertNotRaw(sentence, code.rawValue)
            XCTAssertNotEqual(sentence, generic, code.rawValue)
        }
    }

    func test_aRejectionOfTheServer_isReadFromItsCode() {
        let error = MeeshyError.rejected(APIRejection(statusCode: 409, code: "CHEST_NOT_READY", message: "x"))
        XCTAssertEqual(GameCopy.errorMessage(for: error), GameCopy.errorMessage(for: .chestNotReady))
    }

    func test_aNetworkFailure_isTheGenericSentence() {
        XCTAssertEqual(GameCopy.errorMessage(for: URLError(.timedOut)), GameCopy.errorMessage(for: nil as GameErrorCode?))
    }

    // MARK: - Les chiffres lus

    func test_clock_isWrittenByTheLocale_notByHand() {
        let french = Locale(identifier: "fr_FR")
        XCTAssertEqual(GameCopy.clock(minuteOfDay: 9 * 60 + 5, locale: french), "09:05")
        XCTAssertEqual(GameCopy.clock(minuteOfDay: 21 * 60, locale: french), "21:00")
        XCTAssertNotEqual(GameCopy.clock(minuteOfDay: 21 * 60, locale: Locale(identifier: "en_US")), "21:00", "12 h en anglais américain")
    }

    func test_chance_isOneOverTheOdds() {
        XCTAssertTrue(GameCopy.chance(1.0 / 6.0).contains(GameCopy.formatCount(6)))
        XCTAssertTrue(GameCopy.chance(1.0 / 20.0).contains(GameCopy.formatCount(20)))
    }

    // MARK: - Mee et Meo

    func test_everyGuideAction_hasALabel() {
        for action in GuideAction.allCases { assertNotRaw(GameGuideCopy.actionLabel(action), action.rawValue) }
    }

    func test_everyOnboardingStep_saysFourThingsAndItsButton() {
        for step in GameGuide.onboardingSteps {
            let copy = GameGuideCopy.step(step)
            for (label, text) in [("what", copy.what), ("means", copy.means), ("next", copy.next), ("short", copy.short), ("action", copy.action)] {
                assertNotRaw(text, "\(step.key) \(label)")
            }
        }
    }

    func test_theEightRulesAreInOrder() {
        XCTAssertEqual(GameGuideCopy.rules.map(\.index), Array(1...8))
        for rule in GameGuideCopy.rules {
            assertNotRaw(rule.title, "règle \(rule.index)")
            assertNotRaw(rule.body, "règle \(rule.index)")
        }
    }

    func test_everyMomentOfTheLaw_isToldWithItsNumbers() {
        let events: [GuideEvent] = [
            .firstLevel(level: 2, pointsToNext: 50),
            .newTier(tier: .lueur, nextTierLevel: 20),
            .newTier(tier: .galaxie, nextTierLevel: nil),
            .missionsUnlocked,
            .firstMintPossible(price: 1221, levelsLost: 2, gloryGain: 100),
            .firstMintPossible(price: 1221, levelsLost: 0, gloryGain: 100),
            .firstMint(levelBefore: 14, levelAfter: 9, tailwindUntilLevel: 14),
            .badgeExtinguished(missingActions: 37),
            .priceRises(nextPrice: 1294),
            .newRank(rank: .voix, division: .ii, glory: 1700, gloryMissing: 466),
            .newRank(rank: .legende, division: .i, glory: 160_000, gloryMissing: nil),
            .treasuryTier(tier: .escarcelle, nextTierMissing: 40),
            .treasuryTier(tier: .reserve, nextTierMissing: nil),
            .flameAtRisk(days: 12),
            .flameOut(lostDays: 0, relightPrice: 3, canRelight: true),
            .flameOut(lostDays: 0, relightPrice: 3, canRelight: false),
            .returnAfterAbsence(daysAway: 9),
            .level100(canPrestige: true),
            .level100(canPrestige: false),
        ]
        for event in events {
            let moment = GameGuide.moment(for: event, seen: [])
            let copy = GameGuideCopy.moment(moment)
            for (label, text) in [("what", copy.what), ("means", copy.means), ("next", copy.next), ("short", copy.short), ("action", copy.action)] {
                assertNotRaw(text, "\(event.key.rawValue) \(label)")
            }
        }
    }

    func test_theFirstMintCard_citesTheLevelsBeforeAndAfter() {
        let moment = GameGuide.moment(for: .firstMint(levelBefore: 14, levelAfter: 9, tailwindUntilLevel: 14), seen: [])
        let means = GameGuideCopy.moment(moment).means
        XCTAssertTrue(means.contains(GameCopy.formatCount(14)))
        XCTAssertTrue(means.contains(GameCopy.formatCount(9)))
    }
}
