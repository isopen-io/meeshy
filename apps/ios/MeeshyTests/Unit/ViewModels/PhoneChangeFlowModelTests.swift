import XCTest
import MeeshySDK
@testable import Meeshy

/// #8843 — le flux d'ajout / changement de numéro par SMS, extrait de
/// `SecurityView` pour être partagé avec la proposition faite avant la
/// recherche de contacts. Une seule source : envoi du code, saisie des six
/// chiffres, vérification, rafraîchissement de l'utilisateur courant.
@MainActor
final class PhoneChangeFlowModelTests: XCTestCase {

    private func makeSUT(
        changePhone: Result<ChangePhoneResponse, Error>? = nil,
        verify: Result<VerifyPhoneChangeResponse, Error>? = nil
    ) -> (PhoneChangeFlowModel, MockUserService, MockAuthManager) {
        let userService = MockUserService()
        if let changePhone { userService.changePhoneResult = changePhone }
        if let verify { userService.verifyPhoneChangeResult = verify }
        let auth = MockAuthManager()
        return (PhoneChangeFlowModel(userService: userService, authManager: auth), userService, auth)
    }

    func test_init_startsIdleWithNothingTyped() {
        let (sut, _, _) = makeSUT()
        XCTAssertEqual(sut.step, .idle)
        XCTAssertEqual(sut.newPhone, "")
        XCTAssertEqual(sut.code, "")
        XCTAssertNil(sut.error)
    }

    func test_beginEditing_movesToEditing() {
        let (sut, _, _) = makeSUT()
        sut.beginEditing()
        XCTAssertEqual(sut.step, .editing)
    }

    func test_canSend_shortNumber_isFalse() {
        let (sut, _, _) = makeSUT()
        sut.newPhone = "12345"
        XCTAssertFalse(sut.canSend)
        sut.newPhone = "+33612"
        XCTAssertTrue(sut.canSend)
    }

    func test_sendCode_success_movesToCodeSent() async {
        let (sut, service, _) = makeSUT()
        sut.beginEditing()
        sut.newPhone = "+33612345678"
        await sut.sendCode()
        XCTAssertEqual(service.changePhoneCallCount, 1)
        XCTAssertEqual(sut.step, .codeSent)
        XCTAssertFalse(sut.isSending)
        XCTAssertNil(sut.error)
    }

    func test_sendCode_meeshyError_keepsEditingWithItsDescription() async {
        let failure = MeeshyError.server(statusCode: 409, message: "Numéro déjà utilisé")
        let (sut, _, _) = makeSUT(changePhone: .failure(failure))
        sut.beginEditing()
        sut.newPhone = "+33612345678"
        await sut.sendCode()
        XCTAssertEqual(sut.step, .editing)
        XCTAssertEqual(sut.error, failure.errorDescription)
        XCTAssertFalse(sut.isSending)
    }

    func test_sendCode_unknownError_showsGenericMessage() async {
        let (sut, _, _) = makeSUT(changePhone: .failure(URLError(.notConnectedToInternet)))
        sut.newPhone = "+33612345678"
        await sut.sendCode()
        XCTAssertEqual(sut.error, String(localized: "common.error.generic", defaultValue: "Une erreur est survenue", bundle: .main))
    }

    func test_requestCode_forExistingNumber_sendsItAndMovesToCodeSent() async {
        let (sut, service, _) = makeSUT()
        await sut.requestCode(for: "+33612345678")
        XCTAssertEqual(sut.newPhone, "+33612345678")
        XCTAssertEqual(service.changePhoneCallCount, 1)
        XCTAssertEqual(sut.step, .codeSent)
    }

    func test_code_keepsOnlySixDigits() {
        let (sut, _, _) = makeSUT()
        sut.code = "12a3 45678"
        XCTAssertEqual(sut.code, "123456")
        XCTAssertTrue(sut.canVerify)
    }

    func test_verifyCode_success_refreshesUserAndResets() async {
        let (sut, service, auth) = makeSUT()
        await sut.requestCode(for: "+33612345678")
        sut.code = "123456"
        let verified = await sut.verifyCode()
        XCTAssertTrue(verified)
        XCTAssertEqual(service.verifyPhoneChangeCallCount, 1)
        XCTAssertEqual(auth.checkExistingSessionCallCount, 1)
        XCTAssertEqual(sut.step, .idle)
        XCTAssertEqual(sut.code, "")
        XCTAssertEqual(sut.newPhone, "")
        XCTAssertFalse(sut.isVerifying)
    }

    func test_verifyCode_badRequest_saysCodeInvalid() async {
        let (sut, _, auth) = makeSUT(verify: .failure(MeeshyError.server(statusCode: 400, message: "bad")))
        await sut.requestCode(for: "+33612345678")
        sut.code = "000000"
        let verified = await sut.verifyCode()
        XCTAssertFalse(verified)
        XCTAssertEqual(sut.step, .codeSent)
        XCTAssertEqual(sut.error, String(localized: "settings.security.phone.code_invalid", defaultValue: "Code incorrect ou expiré", bundle: .main))
        XCTAssertEqual(auth.checkExistingSessionCallCount, 0)
    }

    func test_cancel_resetsEverything() async {
        let (sut, _, _) = makeSUT(changePhone: .failure(URLError(.timedOut)))
        sut.beginEditing()
        sut.newPhone = "+33612345678"
        await sut.sendCode()
        sut.cancel()
        XCTAssertEqual(sut.step, .idle)
        XCTAssertEqual(sut.newPhone, "")
        XCTAssertEqual(sut.code, "")
        XCTAssertNil(sut.error)
    }
}
