import XCTest
@testable import MeeshySDK

/// #8035 — une adresse inconnue à la connexion devient un compte à vérifier,
/// et la vérification (code ou lien) ouvre la session.
final class EmailVerificationSessionTests: XCTestCase {

    private func decodeLogin(_ json: String) throws -> LoginResponseData {
        try JSONDecoder().decode(APIResponse<LoginResponseData>.self, from: Data(json.utf8)).data
    }

    private func bodyJSON(_ request: EmailVerificationRequest) throws -> [String: Any] {
        let data = try JSONEncoder().encode(request)
        return try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
    }

    // MARK: - Réponse de connexion

    func test_loginResponse_verificationRequired_decodesPendingVerificationWithServedEmail() throws {
        let data = try decodeLogin(#"{"success":true,"data":{"status":"verification-required","accountCreated":true,"email":"nouveau@exemple.com"}}"#)

        XCTAssertEqual(
            data.pendingEmailVerification(typedIdentifier: "NOUVEAU@exemple.com "),
            PendingEmailVerification(email: "nouveau@exemple.com", accountCreated: true)
        )
        XCTAssertNil(data.token)
        XCTAssertNil(data.user)
    }

    func test_loginResponse_verificationRequiredWithoutServedEmail_fallsBackToTypedAddress() throws {
        let data = try decodeLogin(#"{"success":true,"data":{"status":"verification-required"}}"#)

        XCTAssertEqual(
            data.pendingEmailVerification(typedIdentifier: " deja@exemple.com "),
            PendingEmailVerification(email: "deja@exemple.com", accountCreated: false)
        )
    }

    func test_loginResponse_nominalSession_isNotAPendingVerification() throws {
        let data = try decodeLogin(#"{"success":true,"data":{"token":"jwt","sessionToken":"sess","user":{"id":"u1","username":"alice"}}}"#)

        XCTAssertNil(data.pendingEmailVerification(typedIdentifier: "alice"))
        XCTAssertEqual(data.token, "jwt")
        XCTAssertEqual(data.user?.username, "alice")
    }

    // MARK: - Charge de vérification

    func test_codeRequest_carriesTypedPassword() throws {
        let body = try bodyJSON(.code("123456", email: "a@b.co", password: "s3cret!"))

        XCTAssertEqual(body["email"] as? String, "a@b.co")
        XCTAssertEqual(body["code"] as? String, "123456")
        XCTAssertEqual(body["password"] as? String, "s3cret!")
        XCTAssertNil(body["token"])
    }

    func test_codeRequest_withEmptyPassword_sendsNoPassword() throws {
        let body = try bodyJSON(.code("123456", email: "a@b.co", password: ""))

        XCTAssertNil(body["password"])
    }

    func test_linkRequest_sendsTokenAndNeverAPassword() throws {
        let body = try bodyJSON(.link(token: "tok", email: "a@b.co"))

        XCTAssertEqual(Set(body.keys), ["email", "token"])
    }

    // MARK: - AuthService.confirmEmail

    func test_confirmEmail_postsTheProofAndReturnsTheServedSession() async throws {
        let mock = MockAPIClient()
        let user = MeeshyUser(id: "u1", username: "alice", email: "a@b.co", role: "USER", systemLanguage: "fr",
                              createdAt: "2024-01-01T00:00:00.000Z", updatedAt: "2024-01-01T00:00:00.000Z")
        mock.stub("/auth/verify-email", result: APIResponse(
            success: true,
            data: LoginResponseData(user: user, token: "jwt", sessionToken: "sess", expiresIn: nil, requires2FA: nil, twoFactorToken: nil),
            error: nil
        ))

        let data = try await AuthService(api: mock).confirmEmail(.code("654321", email: "a@b.co", password: "pw"))

        XCTAssertEqual(data.token, "jwt")
        XCTAssertEqual(data.sessionToken, "sess")
        XCTAssertEqual(data.user?.id, "u1")
        XCTAssertEqual(mock.lastRequest?.endpoint, "/auth/verify-email")
        XCTAssertEqual(mock.lastRequest?.method, "POST")
        XCTAssertEqual(mock.lastRequest?.bodyJSON?["code"] as? String, "654321")
        XCTAssertEqual(mock.lastRequest?.bodyJSON?["password"] as? String, "pw")
    }

    func test_confirmEmail_legacyResponseWithoutSession_decodesAsNoSession() throws {
        let data = try decodeLogin(#"{"success":true,"data":{"message":"ok","alreadyVerified":false,"verifiedAt":"2026-09-26T10:00:00.000Z"}}"#)

        XCTAssertNil(data.token)
        XCTAssertNil(data.user)
    }
}
