import XCTest
@testable import MeeshyUI
@testable import MeeshySDK

/// **La borne du pseudo, appliquée PENDANT la saisie (#8082).**
///
/// Constat de recette : `direction_recette` (17 caractères) passait le
/// formulaire et la passerelle le refusait (`body/username must NOT have more
/// than 16 characters`). Miroir de `usernameRefusal`
/// (`packages/shared/utils/username-rule.ts`) — bornes `usernameMinLength` /
/// `usernameMaxLength` du schéma d'inscription.
@MainActor
final class SignupFormUsernameTests: XCTestCase {

    private func makeForm(username: String?) -> SignupForm {
        SignupForm(
            username: username,
            displayName: "Awa",
            email: "awa@example.com",
            password: "motdepasse",
            country: CountryPicker.countries[0],
            systemLanguage: "fr",
            regionalLanguage: "en"
        )
    }

    // MARK: - Les bornes

    func test_usernameBounds_matchRegistrationIdentity_andTheSharedSchema() {
        XCTAssertEqual(SignupForm.usernameMaxLength, RegistrationIdentity.pseudoMax)
        XCTAssertEqual(SignupForm.usernameMinLength, RegistrationIdentity.pseudoMin)
        XCTAssertEqual(SignupForm.usernameMaxLength, 16)
        XCTAssertEqual(SignupForm.usernameMinLength, 2)
    }

    // MARK: - Le motif du refus

    func test_usernameRefusal_seventeenCharacters_isTooLong() {
        XCTAssertEqual(SignupForm.usernameRefusal("direction_recette"), .tooLong)
    }

    func test_usernameRefusal_sixteenCharacters_isAccepted() {
        XCTAssertNil(SignupForm.usernameRefusal("direction_recett"))
    }

    func test_usernameRefusal_singleCharacter_isTooShort() {
        XCTAssertEqual(SignupForm.usernameRefusal("a"), .tooShort)
    }

    func test_usernameRefusal_spaceAccentOrDot_areInvalidCharacters() {
        XCTAssertEqual(SignupForm.usernameRefusal("jean paul"), .invalidCharacters)
        XCTAssertEqual(SignupForm.usernameRefusal("josé"), .invalidCharacters)
        XCTAssertEqual(SignupForm.usernameRefusal("jean.paul"), .invalidCharacters)
    }

    func test_usernameRefusal_lengthBeforeCharacters() {
        XCTAssertEqual(SignupForm.usernameRefusal(String(repeating: "é", count: 20)), .tooLong)
    }

    // MARK: - Sur le formulaire

    func test_form_tooLongUsername_blocksSubmitAndIdentity() {
        let form = makeForm(username: "direction_recette")

        XCTAssertEqual(form.usernameRefusal, .tooLong)
        XCTAssertFalse(form.canSubmit)
        XCTAssertFalse(form.isIdentityDefined)
    }

    func test_form_sixteenCharacterUsername_submits() {
        let form = makeForm(username: "direction_recett")

        XCTAssertNil(form.usernameRefusal)
        XCTAssertTrue(form.canSubmit)
    }

    func test_form_untouchedUsername_derivedFromEmail_isAccepted() {
        XCTAssertNil(makeForm(username: nil).usernameRefusal)
    }

    func test_form_typedUsername_isJudgedTrimmed_likeWhatLeaves() {
        XCTAssertNil(makeForm(username: "  awa_n  ").usernameRefusal)
    }
}
