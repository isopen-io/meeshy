import XCTest
import MeeshySDK
@testable import Meeshy

/// #4362 — un changement d'e-mail se TERMINE dans l'application : le lien
/// reçu sur la nouvelle adresse, collé dans la Sécurité, est remis à
/// `verifyEmailChange`, puis l'utilisateur courant est relu sans geste de plus.
///
/// Témoins `async`, comme `PhoneChangeFlowModelTests` : un témoin synchrone
/// qui libère `MockAuthManager` abat l'hôte de test sur iOS 26.1.
@MainActor
final class EmailChangeConfirmationTests: XCTestCase {

    private let token = String(repeating: "a1b2c3d4", count: 8)

    private func makeSUT(
        verify: Result<VerifyEmailChangeResponse, Error>? = nil
    ) -> (EmailChangeConfirmation, MockUserService, MockAuthManager) {
        let userService = MockUserService()
        if let verify { userService.verifyEmailChangeResult = verify }
        let auth = MockAuthManager()
        return (EmailChangeConfirmation(userService: userService, authManager: auth), userService, auth)
    }

    func test_token_fromFragmentLink_readsTheSecret() async {
        let link = "https://meeshy.me/settings/verify-email-change?via=email&token=#token=\(token)"
        XCTAssertEqual(EmailChangeConfirmation.token(from: link), token)
    }

    func test_token_fromQueryLinkSentBefore_readsTheSecret() async {
        let link = "https://staging.meeshy.me/settings/verify-email-change?token=\(token)"
        XCTAssertEqual(EmailChangeConfirmation.token(from: link), token)
    }

    func test_token_bareTokenWithSurroundingSpaces_isKept() async {
        XCTAssertEqual(EmailChangeConfirmation.token(from: "  \(token)\n"), token)
    }

    func test_token_otherLinkOrGarbage_isNil() async {
        XCTAssertNil(EmailChangeConfirmation.token(from: "https://meeshy.me/reset-password?via=email#token=\(token)"))
        XCTAssertNil(EmailChangeConfirmation.token(from: "bonjour"))
        XCTAssertNil(EmailChangeConfirmation.token(from: ""))
    }

    func test_canConfirm_followsThePastedLink() async {
        let (sut, _, _) = makeSUT()
        XCTAssertFalse(sut.canConfirm)
        sut.pastedLink = "https://meeshy.me/settings/verify-email-change?via=email#token=\(token)"
        XCTAssertTrue(sut.canConfirm)
    }

    func test_confirm_success_verifiesTheTokenAndRefreshesTheUser() async {
        let (sut, service, auth) = makeSUT()
        sut.pastedLink = "https://meeshy.me/settings/verify-email-change?via=email&token=#token=\(token)"
        let confirmed = await sut.confirm()
        XCTAssertTrue(confirmed)
        XCTAssertEqual(service.verifyEmailChangeCallCount, 1)
        XCTAssertEqual(service.lastVerifyEmailChangeToken, token)
        XCTAssertEqual(auth.checkExistingSessionCallCount, 1)
        XCTAssertEqual(sut.pastedLink, "")
        XCTAssertNil(sut.error)
        XCTAssertFalse(sut.isConfirming)
    }

    func test_confirm_badRequest_saysLinkInvalidAndKeepsTheUser() async {
        let (sut, _, auth) = makeSUT(verify: .failure(MeeshyError.server(statusCode: 400, message: "Invalid verification token")))
        sut.pastedLink = token
        let confirmed = await sut.confirm()
        XCTAssertFalse(confirmed)
        XCTAssertEqual(sut.error, String(localized: "settings.security.email.link_invalid", defaultValue: "Lien invalide ou expiré", bundle: .main))
        XCTAssertEqual(auth.checkExistingSessionCallCount, 0)
        XCTAssertEqual(sut.pastedLink, token)
    }

    func test_confirm_unknownError_showsGenericMessage() async {
        let (sut, _, _) = makeSUT(verify: .failure(URLError(.notConnectedToInternet)))
        sut.pastedLink = token
        _ = await sut.confirm()
        XCTAssertEqual(sut.error, String(localized: "common.error.generic", defaultValue: "Une erreur est survenue", bundle: .main))
    }

    func test_confirm_unreadableInput_sendsNothing() async {
        let (sut, service, _) = makeSUT()
        sut.pastedLink = "bonjour"
        let confirmed = await sut.confirm()
        XCTAssertFalse(confirmed)
        XCTAssertEqual(service.verifyEmailChangeCallCount, 0)
        XCTAssertEqual(sut.error, String(localized: "settings.security.email.link_invalid", defaultValue: "Lien invalide ou expiré", bundle: .main))
    }
}
