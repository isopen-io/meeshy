import XCTest
@testable import MeeshySDK

/// Les bornes d'une identité saisie (#13825) : un pseudo a au moins 3
/// caractères rognés, un prénom, un nom ou un nom affiché au moins 2.
final class IdentityRulesTests: XCTestCase {

    func test_bounds_arePseudoThree_andPersonNameTwo() {
        XCTAssertEqual(IdentityRules.pseudoMin, 3)
        XCTAssertEqual(IdentityRules.personNameMin, 2)
        XCTAssertEqual(IdentityRules.minimum(for: .pseudo), 3)
        XCTAssertEqual(IdentityRules.minimum(for: .firstName), 2)
        XCTAssertEqual(IdentityRules.minimum(for: .lastName), 2)
        XCTAssertEqual(IdentityRules.minimum(for: .displayName), 2)
    }

    func test_registrationIdentity_readsTheSamePseudoBound() {
        XCTAssertEqual(RegistrationIdentity.pseudoMin, IdentityRules.pseudoMin)
    }

    func test_pseudo_twoCharactersRefused_threeAccepted() {
        XCTAssertFalse(IdentityRules.meetsMinimum("Al", for: .pseudo))
        XCTAssertTrue(IdentityRules.meetsMinimum("Ali", for: .pseudo))
    }

    func test_pseudo_isTrimmedBeforeCounting() {
        XCTAssertFalse(IdentityRules.meetsMinimum("  Al  ", for: .pseudo))
        XCTAssertFalse(IdentityRules.meetsMinimum(" a\n", for: .pseudo))
        XCTAssertTrue(IdentityRules.meetsMinimum("  Ali ", for: .pseudo))
    }

    func test_personName_oneCharacterRefused_twoAccepted() {
        for field in [IdentityRules.Field.firstName, .lastName, .displayName] {
            XCTAssertFalse(IdentityRules.meetsMinimum("A", for: field), "\(field)")
            XCTAssertTrue(IdentityRules.meetsMinimum("Al", for: field), "\(field)")
            XCTAssertTrue(IdentityRules.meetsMinimum("Sy", for: field), "\(field)")
        }
    }

    func test_personName_isTrimmedBeforeCounting() {
        XCTAssertFalse(IdentityRules.meetsMinimum("  A  ", for: .firstName))
        XCTAssertTrue(IdentityRules.meetsMinimum("  Li ", for: .lastName))
    }

    func test_personName_countsPerceivedCharacters_notScalars() {
        let decomposedE = "E\u{0301}"
        XCTAssertFalse(IdentityRules.meetsMinimum(decomposedE, for: .firstName))
    }

    /// La mesure de la passerelle (`visibleNameLength`, #13825) : un émoji se
    /// voit, un caractère de format, une balise ou un remplissage hangul non.
    func test_personName_countsVisibleCharacters_likeTheGateway() {
        for typed in ["😀😀", "🇫🇷🇨🇲", "A😀", "Ét", "E\u{0301}t", "A★"] {
            XCTAssertTrue(IdentityRules.meetsMinimum(typed, for: .displayName), typed)
            XCTAssertFalse(IdentityRules.isTooShort(typed, for: .firstName), typed)
        }
        for typed in ["😀", "🇫🇷", "👨‍👩‍👧", "A\u{200E}", "A\u{2060}", "A\u{00AD}", "A\u{3164}", "A<b></b>", "A\u{200B}"] {
            XCTAssertFalse(IdentityRules.meetsMinimum(typed, for: .displayName), typed)
            XCTAssertTrue(IdentityRules.isTooShort(typed, for: .lastName), typed)
        }
    }

    /// Le pseudo d'un INVITÉ se mesure sur ce que la passerelle en sert
    /// (`sanitizeUsername` : lettres ASCII, chiffres, `_ . -`).
    func test_guestPseudo_isMeasuredOnWhatTheGatewayKeeps() {
        XCTAssertTrue(IdentityRules.isGuestPseudoTooShort("Al#"))
        XCTAssertTrue(IdentityRules.isGuestPseudoTooShort("Zoé"))
        XCTAssertFalse(IdentityRules.isGuestPseudoTooShort("Zoe"))
        XCTAssertFalse(IdentityRules.isGuestPseudoTooShort(" a.b "))
        XCTAssertFalse(IdentityRules.isGuestPseudoTooShort("   "))
        XCTAssertTrue(IdentityRules.meetsGuestPseudoMinimum("Ali"))
        XCTAssertFalse(IdentityRules.meetsGuestPseudoMinimum("Zoé"))
        XCTAssertFalse(IdentityRules.meetsGuestPseudoMinimum(""))
    }

    func test_emptyValue_meetsNoMinimum_butIsNotTooShort() {
        XCTAssertFalse(IdentityRules.meetsMinimum("", for: .pseudo))
        XCTAssertFalse(IdentityRules.meetsMinimum("   ", for: .displayName))
        XCTAssertFalse(IdentityRules.isTooShort("", for: .pseudo))
        XCTAssertFalse(IdentityRules.isTooShort("   ", for: .firstName))
    }

    func test_isTooShort_onlyForATypedValueBelowTheBound() {
        XCTAssertTrue(IdentityRules.isTooShort("Al", for: .pseudo))
        XCTAssertFalse(IdentityRules.isTooShort("Ali", for: .pseudo))
        XCTAssertTrue(IdentityRules.isTooShort(" A ", for: .lastName))
        XCTAssertFalse(IdentityRules.isTooShort("Al", for: .lastName))
    }

    func test_shortFields_listsTheTypedFieldsBelowTheirBound_inOrder() {
        XCTAssertEqual(
            IdentityRules.shortFields(firstName: "A", lastName: "B", displayName: "C"),
            [.firstName, .lastName, .displayName]
        )
        XCTAssertEqual(
            IdentityRules.shortFields(firstName: "Al", lastName: "", displayName: " X "),
            [.displayName]
        )
        XCTAssertEqual(IdentityRules.shortFields(firstName: "", lastName: "  ", displayName: "Al"), [])
    }
}
