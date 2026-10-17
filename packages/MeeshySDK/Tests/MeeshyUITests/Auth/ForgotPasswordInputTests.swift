import XCTest
@testable import MeeshyUI
@testable import MeeshySDK

/// **« Mot de passe oublié » ne part pas tant que la saisie est incomplète (#10885).**
///
/// Chaque étape de `MeeshyForgotPasswordView` a son bouton, et chaque bouton
/// son prédicat : une demande qui partirait vide ne ferait que recevoir le refus
/// de la passerelle (`services/gateway/src/routes/password-reset.ts`).
@MainActor
final class ForgotPasswordInputTests: XCTestCase {

    // MARK: - E-mail

    func test_canRequestLink_emptyEmail_isFalse() {
        XCTAssertFalse(ForgotPasswordInput.canRequestLink(email: ""))
        XCTAssertFalse(ForgotPasswordInput.canRequestLink(email: "   "))
    }

    func test_canRequestLink_implausibleEmail_isFalse() {
        XCTAssertFalse(ForgotPasswordInput.canRequestLink(email: "ada"))
        XCTAssertFalse(ForgotPasswordInput.canRequestLink(email: "ada@meeshy"))
        XCTAssertFalse(ForgotPasswordInput.canRequestLink(email: "@meeshy.me"))
    }

    func test_canRequestLink_plausibleEmail_isTrue() {
        XCTAssertTrue(ForgotPasswordInput.canRequestLink(email: "ada@meeshy.me"))
        XCTAssertTrue(ForgotPasswordInput.canRequestLink(email: " ada@meeshy.me "))
    }

    func test_submittedEmail_trimsSurroundingSpaces() {
        XCTAssertEqual(ForgotPasswordInput.submittedEmail(" ada@meeshy.me \n"), "ada@meeshy.me")
    }

    // MARK: - Téléphone

    func test_canLookUp_emptyNumber_isFalse() {
        XCTAssertFalse(ForgotPasswordInput.canLookUp(phoneNumber: ""))
        XCTAssertFalse(ForgotPasswordInput.canLookUp(phoneNumber: " - . "))
    }

    func test_canLookUp_tooFewDigits_isFalse() {
        XCTAssertFalse(ForgotPasswordInput.canLookUp(phoneNumber: "06 12 34"))
        XCTAssertFalse(ForgotPasswordInput.canLookUp(phoneNumber: "12345678"))
    }

    func test_canLookUp_tooManyDigits_isFalse() {
        XCTAssertFalse(ForgotPasswordInput.canLookUp(phoneNumber: "1234567890123456"))
    }

    func test_canLookUp_nationalNumber_isTrue_evenWithSeparators() {
        XCTAssertTrue(ForgotPasswordInput.canLookUp(phoneNumber: "06 12 34 56 78"))
        XCTAssertTrue(ForgotPasswordInput.canLookUp(phoneNumber: "612345678"))
    }

    /// Le numéro EXISTE déjà sur un compte : la règle anti-faux de l'inscription
    /// (`PhonePlausibility`) n'a pas à refuser un numéro ancien qu'elle aurait
    /// refusé aujourd'hui — c'est la passerelle qui dit s'il est connu.
    func test_canLookUp_doesNotApplySignupAntiFakeRule() {
        XCTAssertTrue(ForgotPasswordInput.canLookUp(phoneNumber: "0611111234"))
    }

    // MARK: - Identité

    func test_canVerifyIdentity_missingField_isFalse() {
        XCTAssertFalse(ForgotPasswordInput.canVerifyIdentity(fullUsername: "", fullEmail: "ada@meeshy.me"))
        XCTAssertFalse(ForgotPasswordInput.canVerifyIdentity(fullUsername: "ada_l", fullEmail: ""))
    }

    func test_canVerifyIdentity_usernameTooShort_isFalse() {
        XCTAssertFalse(ForgotPasswordInput.canVerifyIdentity(fullUsername: " a ", fullEmail: "ada@meeshy.me"))
    }

    func test_canVerifyIdentity_implausibleEmail_isFalse() {
        XCTAssertFalse(ForgotPasswordInput.canVerifyIdentity(fullUsername: "ada_l", fullEmail: "ada@"))
    }

    func test_canVerifyIdentity_completeInput_isTrue() {
        XCTAssertTrue(ForgotPasswordInput.canVerifyIdentity(fullUsername: "ada_l", fullEmail: "ada@meeshy.me"))
    }

    // MARK: - Code SMS

    func test_canConfirm_incompleteCode_isFalse() {
        XCTAssertFalse(ForgotPasswordInput.canConfirm(code: ""))
        XCTAssertFalse(ForgotPasswordInput.canConfirm(code: "12345"))
        XCTAssertFalse(ForgotPasswordInput.canConfirm(code: "12a45b"))
    }

    func test_canConfirm_sixDigits_isTrue_evenWithSpaces() {
        XCTAssertTrue(ForgotPasswordInput.canConfirm(code: "123456"))
        XCTAssertTrue(ForgotPasswordInput.canConfirm(code: "123 456"))
    }

    func test_submittedCode_keepsSixDigitsOnly() {
        XCTAssertEqual(ForgotPasswordInput.submittedCode("123 456"), "123456")
    }
}
