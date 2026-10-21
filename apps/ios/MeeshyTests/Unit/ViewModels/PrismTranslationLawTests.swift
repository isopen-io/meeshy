import XCTest
@testable import Meeshy
import MeeshySDK

@MainActor
final class PrismTranslationLawTests: XCTestCase {

    private func translation(target: String, source: String = "en") -> MessageTranslation {
        MessageTranslation(
            id: "t-\(target)", messageId: "m1", sourceLanguage: source, targetLanguage: target,
            translatedContent: "texte \(target)", translationModel: nil, confidenceScore: nil
        )
    }

    private func message(id: String, originalLanguage: String) -> MeeshyMessage {
        MeeshyMessage(id: id, conversationId: "c1", senderId: "u1", content: "x", originalLanguage: originalLanguage)
    }

    func test_prismTranslation_originAtLowerRank_servesPrimaryTranslation() {
        let served = PrismTranslationLaw.prismTranslation(
            in: [translation(target: "fr")], originalLanguage: "en", preferredLanguages: ["fr", "en"]
        )

        XCTAssertEqual(served?.targetLanguage, "fr")
    }

    func test_prismTranslation_originAtRank1_returnsNil() {
        let served = PrismTranslationLaw.prismTranslation(
            in: [translation(target: "en", source: "fr")], originalLanguage: "fr", preferredLanguages: ["fr", "en"]
        )

        XCTAssertNil(served)
    }

    func test_prismTranslation_noMatch_returnsNil_neverFirst() {
        let served = PrismTranslationLaw.prismTranslation(
            in: [translation(target: "de")], originalLanguage: "en", preferredLanguages: ["fr"]
        )

        XCTAssertNil(served)
    }

    func test_prismTranslation_matchesTargetCaseInsensitively() {
        let served = PrismTranslationLaw.prismTranslation(
            in: [translation(target: "FR")], originalLanguage: "en", preferredLanguages: ["fr"]
        )

        XCTAssertEqual(served?.targetLanguage, "FR")
    }

    func test_translatedFromLanguage_skipsAutoAndEmpty() {
        let translations = [translation(target: "fr", source: "auto"), translation(target: "es", source: ""), translation(target: "de", source: "KO")]

        XCTAssertEqual(PrismTranslationLaw.translatedFromLanguage(of: translations), "ko")
    }

    func test_translatedFromLanguage_onlyAuto_isNil() {
        XCTAssertNil(PrismTranslationLaw.translatedFromLanguage(of: [translation(target: "fr", source: "auto")]))
    }

    func test_messageIdsWhoseOriginChanged_listsOnlyTheMessagesPresentOnBothSidesWithAnotherOrigin() {
        let before = [message(id: "a", originalLanguage: "fr"), message(id: "b", originalLanguage: "en"), message(id: "gone", originalLanguage: "fr")]
        let after = [message(id: "a", originalLanguage: "KO"), message(id: "b", originalLanguage: "EN"), message(id: "new", originalLanguage: "es")]

        XCTAssertEqual(PrismTranslationLaw.messageIdsWhoseOriginChanged(from: before, to: after), ["a"])
    }

    func test_dominantSplit_tieBreaksAlphabetically_andListsExceptions() {
        let split = PrismTranslationLaw.dominantSplit(["m1": "fr", "m2": "en", "m3": "fr", "m4": "en"])

        XCTAssertEqual(split.language, "en")
        XCTAssertEqual(split.exceptions, ["m1": "fr", "m3": "fr"])
    }

    func test_dominantSplit_singleLanguage_hasNoException() {
        let split = PrismTranslationLaw.dominantSplit(["m1": "fr", "m2": "fr"])

        XCTAssertEqual(split.language, "fr")
        XCTAssertTrue(split.exceptions.isEmpty)
    }

    func test_dominantSplit_empty_hasNoLanguage() {
        let split = PrismTranslationLaw.dominantSplit([:])

        XCTAssertNil(split.language)
        XCTAssertTrue(split.exceptions.isEmpty)
    }
}
