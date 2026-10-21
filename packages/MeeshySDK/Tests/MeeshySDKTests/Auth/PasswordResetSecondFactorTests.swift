import XCTest
@testable import MeeshySDK

/// #10867 — un compte protégé par la double authentification réinitialise son
/// mot de passe depuis iOS. Contrat : `resolveResetPasswordOutcome`
/// (`apps/web/src/lib/view/auth-feedback.ts`), passerelle #10866.
final class PasswordResetSecondFactorTests: XCTestCase {

    // MARK: - Le transport

    func test_submitPasswordReset_sendsTheCodeAndTheConfirmation() async throws {
        let mock = MockAPIClient()
        mock.stub("/auth/reset-password", result: SimpleAPIResponse(success: true, message: "ok", error: nil))
        let service = AuthService(api: mock)

        try await service.submitPasswordReset(token: "tok", newPassword: "Nouveau-mdp-42", twoFactorCode: "123456")

        XCTAssertEqual(mock.lastRequest?.endpoint, "/auth/reset-password")
        XCTAssertEqual(mock.lastRequest?.bodyJSON?["token"] as? String, "tok")
        XCTAssertEqual(mock.lastRequest?.bodyJSON?["newPassword"] as? String, "Nouveau-mdp-42")
        XCTAssertEqual(mock.lastRequest?.bodyJSON?["confirmPassword"] as? String, "Nouveau-mdp-42")
        XCTAssertEqual(mock.lastRequest?.bodyJSON?["twoFactorCode"] as? String, "123456")
    }

    func test_submitPasswordReset_withoutCode_omitsTheField() async throws {
        let mock = MockAPIClient()
        mock.stub("/auth/reset-password", result: SimpleAPIResponse(success: true, message: "ok", error: nil))
        let service = AuthService(api: mock)

        try await service.submitPasswordReset(token: "tok", newPassword: "Nouveau-mdp-42", twoFactorCode: nil)

        XCTAssertNil(mock.lastRequest?.bodyJSON?["twoFactorCode"])
        XCTAssertEqual(mock.lastRequest?.bodyJSON?["confirmPassword"] as? String, "Nouveau-mdp-42")
    }

    func test_verifyResetToken_postsTheTokenInTheBody_andReadsRequires2FA() async throws {
        let mock = MockAPIClient()
        mock.stub("/auth/reset-password/verify-token",
                  result: APIResponse(success: true, data: ResetTokenVerification(valid: true, requires2FA: true), error: nil))
        let service = AuthService(api: mock)

        let verification = try await service.verifyResetToken("tok")

        XCTAssertEqual(verification, ResetTokenVerification(valid: true, requires2FA: true))
        XCTAssertEqual(mock.lastRequest?.method, "POST")
        XCTAssertEqual(mock.lastRequest?.bodyJSON?["token"] as? String, "tok")
        XCTAssertNil(mock.lastRequest?.queryItems)
    }

    func test_resetPassword_rendsSesRefusTypes() {
        XCTAssertEqual(AuthEndpoint.resetPassword.rejectionPolicy, .structured)
        XCTAssertEqual(MeeshyEndpointPolicy.rejectionPolicy(forLegacyPath: "/auth/reset-password"), .structured)
    }

    // MARK: - Le refus, par code

    private func rejected(_ code: String?, _ message: String = "x", status: Int = 400) -> Error {
        MeeshyError.rejected(APIRejection(statusCode: status, code: code, message: message))
    }

    func test_outcome_readsEachGatewayCode() {
        XCTAssertEqual(PasswordResetOutcome(error: rejected("RESET_TOKEN_INVALID")), .invalidToken)
        XCTAssertEqual(PasswordResetOutcome(error: rejected("TWO_FACTOR_ATTEMPTS_EXHAUSTED")), .attemptsExhausted)
        XCTAssertEqual(PasswordResetOutcome(error: rejected("RESET_PASSWORD_WEAK")), .weakPassword)
        XCTAssertEqual(PasswordResetOutcome(error: rejected("RESET_PASSWORD_REUSED")), .reusedPassword)
        XCTAssertEqual(PasswordResetOutcome(error: rejected("TWO_FACTOR_REQUIRED")), .secondFactorRequired)
        XCTAssertEqual(PasswordResetOutcome(error: rejected("TWO_FACTOR_INVALID")), .secondFactorInvalid)
        XCTAssertEqual(PasswordResetOutcome(error: rejected("ACCOUNT_LOCKED")), .accountLocked)
    }

    func test_outcome_withoutCode_fallsBackOnTheHistoricalText() {
        XCTAssertEqual(PasswordResetOutcome(error: rejected(nil, "Invalid or expired reset token")), .invalidToken)
        XCTAssertEqual(PasswordResetOutcome(error: rejected(nil, "Too many invalid 2FA codes. Request a new link.")), .attemptsExhausted)
        XCTAssertEqual(PasswordResetOutcome(error: rejected(nil, "Password requirements: at least 12 characters")), .weakPassword)
        XCTAssertEqual(PasswordResetOutcome(error: rejected(nil, "This password was used recently")), .reusedPassword)
        XCTAssertEqual(PasswordResetOutcome(error: rejected(nil, "2FA code required")), .secondFactorRequired)
        XCTAssertEqual(PasswordResetOutcome(error: rejected(nil, "Invalid 2FA code")), .secondFactorInvalid)
        XCTAssertEqual(PasswordResetOutcome(error: rejected(nil, "Account is locked")), .accountLocked)
        XCTAssertEqual(PasswordResetOutcome(error: MeeshyError.server(statusCode: 400, message: "Invalid 2FA code")), .secondFactorInvalid)
    }

    func test_outcome_rateLimitOfflineAndOutage() {
        XCTAssertEqual(PasswordResetOutcome(error: MeeshyError.server(statusCode: 429, message: "Trop de requetes")), .rateLimited)
        XCTAssertEqual(PasswordResetOutcome(error: MeeshyError.network(.noConnection)), .offline)
        XCTAssertEqual(PasswordResetOutcome(error: MeeshyError.server(statusCode: 503, message: "x")), .failed(reference: "503"))
        XCTAssertEqual(PasswordResetOutcome(error: rejected("RESET_PASSWORD_MISMATCH")), .failed(reference: "RESET_PASSWORD_MISMATCH"))
    }

    // MARK: - Le parcours

    func test_flow_aTokenThatRequires2FA_asksForTheCodeUpFront() {
        let flow = PasswordResetFlow().verified(ResetTokenVerification(valid: true, requires2FA: true))

        XCTAssertTrue(flow.requiresSecondFactor)
        XCTAssertEqual(flow.phase, .form)
        XCTAssertNil(flow.notice)
    }

    func test_flow_aDeadToken_showsTheInvalidLinkScreen() {
        let flow = PasswordResetFlow().verified(ResetTokenVerification(valid: false, requires2FA: false))

        XCTAssertEqual(flow.phase, .linkInvalid)
    }

    func test_flow_TWO_FACTOR_REQUIRED_atSubmit_revealsTheCodeField() {
        let flow = PasswordResetFlow().resolved(.secondFactorRequired)

        XCTAssertTrue(flow.requiresSecondFactor)
        XCTAssertEqual(flow.phase, .form)
        XCTAssertEqual(flow.notice, .secondFactorRequired)
    }

    func test_flow_eachRefusalKeepsItsReason() {
        XCTAssertEqual(PasswordResetFlow().resolved(.secondFactorInvalid).notice, .secondFactorInvalid)
        XCTAssertEqual(PasswordResetFlow().resolved(.weakPassword).notice, .weakPassword)
        XCTAssertEqual(PasswordResetFlow().resolved(.reusedPassword).notice, .reusedPassword)
        XCTAssertEqual(PasswordResetFlow().resolved(.accountLocked).notice, .accountLocked)
        XCTAssertEqual(PasswordResetFlow().resolved(.rateLimited).notice, .rateLimited)
        XCTAssertEqual(PasswordResetFlow().resolved(.offline).notice, .offline)
        XCTAssertEqual(PasswordResetFlow().resolved(.failed(reference: "503")).notice, .failed(reference: "503"))
        XCTAssertEqual(PasswordResetFlow().resolved(.weakPassword).phase, .form)
    }

    func test_flow_exhaustedAndInvalid_haveTheirOwnScreens() {
        XCTAssertEqual(PasswordResetFlow().resolved(.attemptsExhausted).phase, .attemptsExhausted)
        XCTAssertEqual(PasswordResetFlow().resolved(.invalidToken).phase, .linkInvalid)
        XCTAssertEqual(PasswordResetFlow().resolved(.saved).phase, .saved)
    }

    func test_flow_canSubmit_requiresSixDigitsOnlyWhenTheCodeIsRequired() {
        let open = PasswordResetFlow()
        let guarded = PasswordResetFlow(requiresSecondFactor: true)

        XCTAssertTrue(open.canSubmit(newPassword: "abcdefgh", confirmPassword: "abcdefgh", code: ""))
        XCTAssertFalse(open.canSubmit(newPassword: "abcdefgh", confirmPassword: "abcdefgi", code: ""))
        XCTAssertFalse(guarded.canSubmit(newPassword: "abcdefgh", confirmPassword: "abcdefgh", code: "12345"))
        XCTAssertTrue(guarded.canSubmit(newPassword: "abcdefgh", confirmPassword: "abcdefgh", code: "123456"))
    }

    func test_codeSanitizing_keepsSixDigits() {
        XCTAssertEqual(PasswordResetFlow.sanitizedCode("12 34-5678"), "123456")
        XCTAssertEqual(PasswordResetFlow.sanitizedCode("abc"), "")
    }

    func test_flow_submittedCode_isNilWhenNotRequired() {
        XCTAssertNil(PasswordResetFlow().submittedCode("123456"))
        XCTAssertEqual(PasswordResetFlow(requiresSecondFactor: true).submittedCode("123456"), "123456")
    }
}
