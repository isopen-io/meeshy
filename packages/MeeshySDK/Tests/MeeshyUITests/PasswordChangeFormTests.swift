import XCTest
@testable import MeeshyUI

/// #9186 — un compte créé sans mot de passe en POSE un depuis Sécurité : le
/// bouton ne reste plus grisé faute d'un « mot de passe actuel » qui n'existe pas.
final class PasswordChangeFormTests: XCTestCase {

    private func makeForm(hasPassword: Bool?, current: String = "") -> PasswordChangeForm {
        PasswordChangeForm(
            hasPassword: hasPassword,
            currentPassword: current,
            newPassword: "Meeshy-2026!",
            confirmPassword: "Meeshy-2026!"
        )
    }

    func test_canSubmit_accountWithoutPassword_needsNoCurrentPassword() {
        let form = makeForm(hasPassword: false)

        XCTAssertFalse(form.asksCurrentPassword)
        XCTAssertTrue(form.canSubmit)
        XCTAssertNil(form.submittedCurrentPassword)
    }

    func test_canSubmit_accountWithPassword_staysDisabledWithoutTheCurrentOne() {
        XCTAssertTrue(makeForm(hasPassword: true).asksCurrentPassword)
        XCTAssertFalse(makeForm(hasPassword: true).canSubmit)
        XCTAssertTrue(makeForm(hasPassword: true, current: "ancien").canSubmit)
        XCTAssertEqual(makeForm(hasPassword: true, current: "ancien").submittedCurrentPassword, "ancien")
    }

    func test_canSubmit_unknownAccountState_keepsTheChangeForm() {
        XCTAssertTrue(makeForm(hasPassword: nil).asksCurrentPassword)
        XCTAssertFalse(makeForm(hasPassword: nil).canSubmit)
    }

    func test_canSubmit_accountWithoutPassword_stillRequiresAValidMatchingPair() {
        let short = PasswordChangeForm(hasPassword: false, newPassword: "court", confirmPassword: "court")
        let mismatch = PasswordChangeForm(hasPassword: false, newPassword: "Meeshy-2026!", confirmPassword: "Meeshy-2027!")

        XCTAssertFalse(short.canSubmit)
        XCTAssertFalse(mismatch.canSubmit)
    }
}
