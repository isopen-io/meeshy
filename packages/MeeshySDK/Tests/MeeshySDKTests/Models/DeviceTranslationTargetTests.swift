import Foundation
import XCTest
@testable import MeeshySDK

/// #9899 — la langue que l'APPAREIL doit calculer, élue par le Prisme. Miroir de
/// `apps/web/src/lib/device-translation/target.test.ts` : la même descente que le
/// serveur, lue à l'envers.
final class DeviceTranslationTargetTests: XCTestCase {

    private let everything: (String, String) -> Bool = { _, _ in true }
    private let nothing: (String, String) -> Bool = { _, _ in false }

    private func resolve(
        preferred: [String],
        original: String?,
        translated: [String] = [],
        canTranslate: (String, String) -> Bool
    ) -> DeviceTranslationPair? {
        DeviceTranslationTarget.resolve(
            preferredLanguages: preferred, originalLanguage: original,
            translatedLanguages: translated, canTranslate: canTranslate
        )
    }

    func test_resolve_whenTheServerAlreadyServesRankOne_computesNothing() {
        XCTAssertNil(resolve(preferred: ["fr", "en"], original: "sw", translated: ["fr"], canTranslate: everything))
    }

    func test_resolve_whenTheMessageIsAlreadyWrittenInRankOne_computesNothing() {
        XCTAssertNil(resolve(preferred: ["fr", "en"], original: "fr", canTranslate: everything))
    }

    func test_resolve_rankOneWithoutAServerTranslation_isComputedEvenWhenRankTwoIsServed() {
        XCTAssertEqual(
            resolve(preferred: ["fr", "en"], original: "sw", translated: ["en"], canTranslate: everything),
            DeviceTranslationPair(source: "sw", target: "fr")
        )
    }

    func test_resolve_aRankTheEngineCannotTranslate_isSkipped() {
        XCTAssertEqual(
            resolve(preferred: ["ewo", "fr"], original: "en", canTranslate: { _, target in target != "ewo" }),
            DeviceTranslationPair(source: "en", target: "fr")
        )
    }

    func test_resolve_stopsAtTheServedRank_neverComputingALessPreferredLanguage() {
        XCTAssertNil(
            resolve(preferred: ["ewo", "fr", "en"], original: "sw", translated: ["fr"], canTranslate: { _, target in target != "ewo" })
        )
    }

    func test_resolve_theOriginalLanguageCompetesAtItsRank() {
        XCTAssertEqual(
            resolve(preferred: ["fr", "en"], original: "en", canTranslate: everything),
            DeviceTranslationPair(source: "en", target: "fr")
        )
        XCTAssertNil(resolve(preferred: ["fr", "en"], original: "en", canTranslate: nothing))
    }

    func test_resolve_comparesNormalizedCodes() {
        XCTAssertNil(resolve(preferred: ["fr-FR"], original: "sw", translated: ["fr"], canTranslate: everything))
        XCTAssertNil(resolve(preferred: ["fr"], original: "FR_ca", canTranslate: everything))
        XCTAssertEqual(
            resolve(preferred: ["PT-br"], original: "en-US", canTranslate: everything),
            DeviceTranslationPair(source: "en", target: "pt")
        )
    }

    func test_resolve_withoutAKnownOriginalLanguage_computesNothing() {
        XCTAssertNil(resolve(preferred: ["fr"], original: nil, canTranslate: everything))
        XCTAssertNil(resolve(preferred: ["fr"], original: "  ", canTranslate: everything))
    }

    func test_resolve_withoutAReaderLanguage_computesNothing() {
        XCTAssertNil(resolve(preferred: [], original: "sw", canTranslate: everything))
        XCTAssertNil(resolve(preferred: [" ", ""], original: "sw", canTranslate: everything))
    }

    func test_candidates_listsTheRanksAboveTheFirstServedOneInTheReadersOrder() {
        XCTAssertEqual(
            DeviceTranslationTarget.candidates(
                preferredLanguages: ["fr", "es-ES", "en", "de"], originalLanguage: "sw", translatedLanguages: ["en"]
            ),
            DeviceTranslationCandidates(source: "sw", targets: ["fr", "es"])
        )
    }

    func test_candidates_dropsADuplicatedRank() {
        XCTAssertEqual(
            DeviceTranslationTarget.candidates(
                preferredLanguages: ["fr", "fr-FR", "en"], originalLanguage: "sw", translatedLanguages: []
            ),
            DeviceTranslationCandidates(source: "sw", targets: ["fr", "en"])
        )
    }

    func test_readerSpelling_takesTheRankAsTheReaderWroteIt() {
        XCTAssertEqual(DeviceTranslationTarget.readerSpelling(of: "pt", in: ["fr", "pt-BR"]), "pt-BR")
        XCTAssertEqual(DeviceTranslationTarget.readerSpelling(of: "fr", in: ["fr", "pt-BR"]), "fr")
        XCTAssertEqual(DeviceTranslationTarget.readerSpelling(of: "en", in: ["EN_us", "fr"]), "EN_us")
    }

    func test_readerSpelling_withoutARankThatCarriesTheTarget_keepsTheNormalizedForm() {
        XCTAssertEqual(DeviceTranslationTarget.readerSpelling(of: "de", in: ["fr", " "]), "de")
        XCTAssertEqual(DeviceTranslationTarget.readerSpelling(of: "de", in: []), "de")
    }

    func test_candidates_hasNothingWhenTheFirstRankIsServed() {
        XCTAssertNil(
            DeviceTranslationTarget.candidates(
                preferredLanguages: ["fr", "en"], originalLanguage: "sw", translatedLanguages: ["fr-CA"]
            )
        )
    }
}
