import XCTest
@testable import MeeshySDK

// MARK: - La plausibilité du numéro (#6479)

/// Les trois exemples de la directive porteur, tenus des DEUX côtés : ce
/// fichier pour Swift, `packages/shared/__tests__/phone-plausibility.test.ts`
/// pour TypeScript. Une divergence rendrait le refus différent selon le
/// client, sur la MÊME saisie — le mode de panne que ce miroir existe pour
/// empêcher.
final class PhonePlausibilityTests: XCTestCase {

    func test_directiveExamples_areRefusedWithTheirReason() {
        XCTAssertEqual(PhonePlausibility.refusal("1111100000"), .identicalRun)
        XCTAssertEqual(PhonePlausibility.refusal("424242424242"), .repeatedPattern)
        XCTAssertFalse(PhonePlausibility.isPlausible("42424242"))
    }

    func test_lengthBound_isNineDigits() {
        XCTAssertEqual(PhonePlausibility.minDigits, 9)
        XCTAssertEqual(PhonePlausibility.refusal("06123456"), .tooShort)
        XCTAssertTrue(PhonePlausibility.isPlausible("061234567"))
    }

    /// LE témoin qui sépare « contient » de « EST ». Une règle qui chercherait
    /// le motif n'importe où refuserait ce numéro parfaitement ordinaire.
    func test_aNumberThatContainsARepeatedUnitWithoutBeingOne_isPlausible() {
        XCTAssertTrue(PhonePlausibility.isPlausible("0642424242"))
        XCTAssertTrue(PhonePlausibility.isPlausible("0644441230"))
    }

    func test_classicFakes_areRefused() {
        XCTAssertEqual(PhonePlausibility.refusal("0600000000"), .identicalRun)
        XCTAssertEqual(PhonePlausibility.refusal("123123123"), .repeatedPattern)
    }

    /// L'ABSENCE est plausible — le numéro n'est pas requis (#6424).
    func test_emptyOrPunctuationOnly_isPlausible() {
        XCTAssertTrue(PhonePlausibility.isPlausible(""))
        XCTAssertTrue(PhonePlausibility.isPlausible("+ ( ) - ."))
        XCTAssertEqual(PhonePlausibility.digitsOnly("+33 6 12.34-56 78"), "33612345678")
    }

    func test_formattingDecidesNothing() {
        XCTAssertTrue(PhonePlausibility.isPlausible("06 12.34 56 78"))
    }
}
