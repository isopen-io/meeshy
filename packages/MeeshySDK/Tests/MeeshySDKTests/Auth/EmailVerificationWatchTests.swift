import XCTest
@testable import MeeshySDK

/// #8083 — l'écran du code apprend que l'adresse a été prouvée AILLEURS (lien
/// ouvert sur l'ordinateur), sans jamais en recevoir une session : décision
/// porteur « si et seulement si », le téléphone ne se connecte que par le code
/// saisi sur lui ou le lien ouvert sur lui.
final class EmailVerificationWatchTests: XCTestCase {

    private func decodeLogin(_ json: String) throws -> LoginResponseData {
        try JSONDecoder().decode(APIResponse<LoginResponseData>.self, from: Data(json.utf8)).data
    }

    // MARK: - Le jeton d'attente voyage avec la vérification requise

    func test_verificationRequired_carriesThePendingSessionToken() throws {
        let data = try decodeLogin(#"{"success":true,"data":{"status":"verification-required","accountCreated":true,"email":"a@b.co","pendingSessionToken":"attente-opaque"}}"#)

        XCTAssertEqual(data.pendingEmailVerification(typedIdentifier: "a@b.co")?.pendingSessionToken, "attente-opaque")
    }

    func test_verificationRequired_withoutToken_stillAsksForTheCode() throws {
        let data = try decodeLogin(#"{"success":true,"data":{"status":"verification-required","email":"a@b.co"}}"#)

        let pending = try XCTUnwrap(data.pendingEmailVerification(typedIdentifier: "a@b.co"))
        XCTAssertNil(pending.pendingSessionToken)
        XCTAssertEqual(pending.email, "a@b.co")
    }

    // MARK: - La lecture de l'état

    func test_status_postsTheTokenAndReadsPending() async throws {
        let mock = MockAPIClient()
        mock.stub("/auth/verification/status", result: APIResponse(success: true, data: EmailVerificationStatusData(status: "pending"), error: nil))

        let status = try await AuthService(api: mock).emailVerificationStatus(pendingSessionToken: "attente-opaque")

        XCTAssertEqual(status, .pending)
        XCTAssertEqual(mock.lastRequest?.method, "POST")
        XCTAssertEqual(mock.lastRequest?.bodyJSON?["pendingSessionToken"] as? String, "attente-opaque")
    }

    func test_status_readsProven() async throws {
        let mock = MockAPIClient()
        mock.stub("/auth/verification/status", result: APIResponse(success: true, data: EmailVerificationStatusData(status: "proven"), error: nil))

        let status = try await AuthService(api: mock).emailVerificationStatus(pendingSessionToken: "t")

        XCTAssertEqual(status, .proven)
    }

    func test_status_unknownValue_readsAsPending() {
        XCTAssertEqual(EmailVerificationWatchStatus.served("quelque-chose"), .pending)
        XCTAssertEqual(EmailVerificationWatchStatus.served(nil), .pending)
    }

    /// 401 (jeton inconnu) et 410 (expiré) FINISSENT l'attente ; une panne
    /// passagère non — l'écran réessaiera au tour suivant.
    func test_status_invalidOrExpiredToken_endsTheWatch() async throws {
        for error: Error in [
            MeeshyError.auth(.invalidCredentialsWithMessage("Jeton d'attente invalide.")),
            MeeshyError.server(statusCode: 410, message: "Jeton d'attente expiré."),
        ] {
            let mock = MockAPIClient()
            mock.stubError("/auth/verification/status", error: error)

            let status = try await AuthService(api: mock).emailVerificationStatus(pendingSessionToken: "t")

            XCTAssertEqual(status, .ended, "\(error)")
        }
    }

    func test_status_transientFailure_isThrown() async {
        let mock = MockAPIClient()
        mock.stubError("/auth/verification/status", error: MeeshyError.server(statusCode: 503, message: "down"))

        do {
            _ = try await AuthService(api: mock).emailVerificationStatus(pendingSessionToken: "t")
            XCTFail("une panne passagère ne finit pas l'attente")
        } catch {}
    }

    // MARK: - Un 401 n'y est JAMAIS une session expirée

    /// La route ne porte aucune session : un 401 y dit « jeton d'attente
    /// invalide ». Rangée en `.bearer`, il déclencherait `handleUnauthorized`
    /// et un rafraîchissement de la session d'un AUTRE compte.
    func test_statusRoute_401IsNeverASessionExpiry() {
        XCTAssertEqual(AuthEndpoint.verificationStatus.authKind, .credentials)
        XCTAssertEqual(MeeshyEndpointPolicy.authKind(forLegacyPath: "/auth/verification/status"), .credentials)
    }
}

final class EmailCodeDispatchTests: XCTestCase {
    func test_emailOnlyDoor_readsTheTokenAndTheExpiryFromData() async throws {
        let mock = MockAPIClient()
        mock.stub("/auth/magic-link/request", result: APIResponse(
            success: true,
            data: EmailCodeDispatch(expiresInSeconds: 900, pendingSessionToken: "attente-opaque"),
            error: nil
        ))

        let dispatch = try await AuthService(api: mock).requestEmailCode(email: "a@b.co")

        XCTAssertEqual(dispatch, EmailCodeDispatch(expiresInSeconds: 900, pendingSessionToken: "attente-opaque"))
        XCTAssertEqual(mock.lastRequest?.bodyJSON?["email"] as? String, "a@b.co")
    }

    func test_emailOnlyDoor_decodesTheServedEnvelope() throws {
        let json = #"{"success":true,"message":"If an account exists, a login link has been sent.","data":{"expiresInSeconds":900,"pendingSessionToken":"t"}}"#
        let decoded = try JSONDecoder().decode(APIResponse<EmailCodeDispatch>.self, from: Data(json.utf8))

        XCTAssertEqual(decoded.data, EmailCodeDispatch(expiresInSeconds: 900, pendingSessionToken: "t"))
    }
}
