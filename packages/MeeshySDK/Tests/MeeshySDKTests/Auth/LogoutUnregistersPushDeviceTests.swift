import XCTest
@testable import MeeshySDK

/// ios-systeme-1 (revue des notifications du 2026-11-17, #18911) — fermer une
/// session retire d'abord les jetons push de l'appareil, SOUS le jeton encore
/// valide.
///
/// Avant ce lot, « Déconnexion » effaçait le jeton APNs et le jeton VoIP en
/// local et ne disait rien à la passerelle : les amis de A continuaient d'écrire
/// à un iPhone qui montrait l'écran de connexion, et un appel pour A faisait
/// sonner CallKit au lancement suivant.
///
/// Le correctif envoie `DELETE /users/register-device-token` avec le SEUL corps
/// `{ deviceId }` : un corps qui porte aussi `token` ne retirerait que la ligne
/// APNs (le `if (body.token)` de la passerelle est prioritaire) et laisserait la
/// ligne VoIP. Il part AVANT `POST /auth/logout` : une fois la session close, le
/// JWT `sid` serait refusé.
///
/// Ces témoins vivent dans l'hôte SPM : la sortie de session complète atteint
/// `UNUserNotificationCenter`, absent de cet hôte — le chemin de bout en bout
/// (`AuthManager.logout()`) est témoigné dans `MeeshyTests`
/// (`LogoutUnregistersPushDeviceAppTests`).
final class LogoutUnregistersPushDeviceTests: XCTestCase {

    private static let noDelay: [TimeInterval] = [0, 0, 0]

    // MARK: - L'ordre : jetons push d'abord, session ensuite

    func test_run_withADevice_unregistersItsPushTokensBeforeClosingTheSession() async {
        let service = RecordingLogoutService()

        await AuthServerLogout.run(token: "T-A", using: service, unregisteringPushDevice: "install-1", delays: Self.noDelay)

        XCTAssertEqual(service.events, ["unregister:install-1:T-A", "logout:T-A"],
                       "les jetons push partent sous le jeton encore valide, puis la session se ferme")
    }

    func test_run_withoutADevice_onlyClosesTheSession() async {
        let service = RecordingLogoutService()

        await AuthServerLogout.run(token: "T-B", using: service, delays: Self.noDelay)

        XCTAssertEqual(service.events, ["logout:T-B"],
                       "refermer une session refusée ne parle jamais des jetons push de l'appareil")
    }

    // MARK: - Les reprises

    func test_run_whenTheUnregistrationFailsOnce_retriesItBeforeClosingTheSession() async {
        let service = RecordingLogoutService(unregisterFailures: [.network(.timeout)])

        await AuthServerLogout.run(token: "T-A", using: service, unregisteringPushDevice: "install-1", delays: Self.noDelay)

        XCTAssertEqual(service.events,
                       ["unregister:install-1:T-A", "unregister:install-1:T-A", "logout:T-A"])
    }

    func test_run_whenTheUnregistrationNeverSucceeds_stillClosesTheSession() async {
        let service = RecordingLogoutService(
            unregisterFailures: [.network(.timeout), .network(.timeout), .network(.timeout)])

        await AuthServerLogout.run(token: "T-A", using: service, unregisteringPushDevice: "install-1", delays: Self.noDelay)

        XCTAssertEqual(service.events.filter { $0.hasPrefix("unregister") }.count, 3,
                       "trois tentatives, pas davantage")
        XCTAssertEqual(service.events.last, "logout:T-A", "la session se ferme même sans l'accusé des jetons")
    }

    func test_run_whenTheTokenIsRefused_stopsWithoutRetryingNorClosing() async {
        let service = RecordingLogoutService(unregisterFailures: [.auth(.sessionExpired)])

        await AuthServerLogout.run(token: "T-A", using: service, unregisteringPushDevice: "install-1", delays: Self.noDelay)

        XCTAssertEqual(service.events, ["unregister:install-1:T-A"],
                       "un 401 dit que la session est déjà close : rien à réessayer, rien à fermer")
    }

    // MARK: - Le fil

    func test_unregisterPushDevice_sendsOnlyTheDeviceId_underTheGivenToken() async throws {
        WirePushStubProtocol.reset()
        let client = makeStubbedClient()
        let service = AuthService(api: client, pinned: client)

        try await service.unregisterPushDevice(deviceId: "install-1", token: "T-A")

        XCTAssertEqual(WirePushStubProtocol.requests.count, 1)
        let sent = try XCTUnwrap(WirePushStubProtocol.requests.first)
        XCTAssertEqual(sent.method, "DELETE")
        XCTAssertEqual(sent.path, UsersEndpoint.registerDeviceToken.path)
        XCTAssertEqual(sent.authorization, "Bearer T-A")
        let body = try XCTUnwrap(JSONSerialization.jsonObject(with: sent.body) as? [String: String])
        XCTAssertEqual(body, ["deviceId": "install-1"],
                       "un corps avec `token` ne retirerait que la ligne APNs et laisserait la ligne VoIP")
    }

    func test_unregisterPushDevice_withAnEmptyDeviceId_sendsNothing() async {
        WirePushStubProtocol.reset()
        let client = makeStubbedClient()
        let service = AuthService(api: client, pinned: client)

        do {
            try await service.unregisterPushDevice(deviceId: "", token: "T-A")
            XCTFail("un DELETE sans deviceId effacerait les jetons de TOUS les appareils du compte")
        } catch {
            XCTAssertTrue(WirePushStubProtocol.requests.isEmpty)
        }
    }

    private func makeStubbedClient() -> APIClient {
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [WirePushStubProtocol.self]
        return APIClient(urlSession: URLSession(configuration: config))
    }
}

// MARK: - Doubles

private final class RecordingLogoutService: AuthServiceProviding, @unchecked Sendable {
    private let lock = NSLock()
    private var _events: [String] = []
    private var pendingUnregisterFailures: [MeeshyError]

    init(unregisterFailures: [MeeshyError] = []) {
        self.pendingUnregisterFailures = unregisterFailures
    }

    var events: [String] { lock.withLock { _events } }

    func unregisterPushDevice(deviceId: String, token: String) async throws {
        let failure: MeeshyError? = lock.withLock {
            _events.append("unregister:\(deviceId):\(token)")
            return pendingUnregisterFailures.isEmpty ? nil : pendingUnregisterFailures.removeFirst()
        }
        if let failure { throw failure }
    }

    func logoutThrowing(token: String) async throws {
        lock.withLock { _events.append("logout:\(token)") }
    }

    func login(username: String, password: String, rememberDevice: Bool) async throws -> LoginResponseData {
        throw MeeshyError.network(.noConnection)
    }
    func completeLoginWith2FA(twoFactorToken: String, code: String) async throws -> LoginResponseData {
        throw MeeshyError.network(.noConnection)
    }
    func register(request: RegisterRequest) async throws -> LoginResponseData {
        throw MeeshyError.network(.noConnection)
    }
    func requestMagicLink(email: String, deviceFingerprint: String?) async throws -> Int { 0 }
    func validateMagicLink(token: String) async throws -> LoginResponseData {
        throw MeeshyError.network(.noConnection)
    }
    func requestPasswordReset(email: String) async throws {}
    func resetPassword(token: String, newPassword: String) async throws {}
    func sendPhoneCode(phoneNumber: String) async throws {}
    func verifyPhone(phoneNumber: String, code: String) async throws -> VerifyPhoneResponse {
        throw MeeshyError.network(.noConnection)
    }
    func verifyEmail(code: String) async throws {}
    func verifyEmailWithCode(code: String, email: String) async throws {}
    func resendVerificationEmail(email: String) async throws {}
    func checkAvailability(username: String?, email: String?, phone: String?) async throws -> AvailabilityResponse {
        throw MeeshyError.network(.noConnection)
    }
    func refreshToken(_ currentToken: String, sessionToken: String?) async throws -> LoginResponseData {
        throw MeeshyError.network(.noConnection)
    }
    func me() async throws -> MeeshyUser { throw MeeshyError.network(.noConnection) }
    func logout() async {}
}

/// Note ce qui part sur le fil, et répond 200.
private final class WirePushStubProtocol: URLProtocol {
    struct Sent {
        let method: String
        let path: String
        let authorization: String
        let body: Data
    }

    nonisolated(unsafe) static var requests: [Sent] = []

    static func reset() { requests = [] }

    override nonisolated class func canInit(with request: URLRequest) -> Bool { true }
    override nonisolated class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override nonisolated func startLoading() {
        Self.requests.append(Sent(
            method: request.httpMethod ?? "",
            path: request.url?.path ?? "",
            authorization: request.value(forHTTPHeaderField: "Authorization") ?? "",
            body: Self.readBody(of: request)
        ))
        let response = HTTPURLResponse(
            url: request.url ?? URL(string: "https://stub.meeshy.test")!,
            statusCode: 200, httpVersion: nil, headerFields: ["Content-Type": "application/json"])!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: Data(#"{"success":true,"data":{"deletedCount":2}}"#.utf8))
        client?.urlProtocolDidFinishLoading(self)
    }

    override nonisolated func stopLoading() {}

    private nonisolated static func readBody(of request: URLRequest) -> Data {
        if let body = request.httpBody { return body }
        guard let stream = request.httpBodyStream else { return Data() }
        stream.open()
        defer { stream.close() }
        var data = Data()
        var buffer = [UInt8](repeating: 0, count: 1024)
        while stream.hasBytesAvailable {
            let count = stream.read(&buffer, maxLength: buffer.count)
            if count <= 0 { break }
            data.append(buffer, count: count)
        }
        return data
    }
}
