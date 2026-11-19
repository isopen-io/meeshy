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

        await AuthServerLogout.run(token: "T-A", using: service, unregisteringPushDevice: PushDeviceRelease(deviceId: "install-1"), delays: Self.noDelay)

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

        await AuthServerLogout.run(token: "T-A", using: service, unregisteringPushDevice: PushDeviceRelease(deviceId: "install-1"), delays: Self.noDelay)

        XCTAssertEqual(service.events,
                       ["unregister:install-1:T-A", "unregister:install-1:T-A", "logout:T-A"])
    }

    func test_run_whenTheUnregistrationNeverSucceeds_stillClosesTheSession() async {
        let service = RecordingLogoutService(
            unregisterFailures: [.network(.timeout), .network(.timeout), .network(.timeout)])

        await AuthServerLogout.run(token: "T-A", using: service, unregisteringPushDevice: PushDeviceRelease(deviceId: "install-1"), delays: Self.noDelay)

        XCTAssertEqual(service.events.filter { $0.hasPrefix("unregister") }.count, 3,
                       "trois tentatives, pas davantage")
        XCTAssertEqual(service.events.last, "logout:T-A", "la session se ferme même sans l'accusé des jetons")
    }

    func test_run_whenTheTokenIsRefused_stopsWithoutRetryingNorClosing() async {
        let service = RecordingLogoutService(unregisterFailures: [.auth(.sessionExpired)])

        await AuthServerLogout.run(token: "T-A", using: service, unregisteringPushDevice: PushDeviceRelease(deviceId: "install-1"), delays: Self.noDelay)

        XCTAssertEqual(service.events, ["unregister:install-1:T-A"],
                       "un 401 dit que la session est déjà close : rien à réessayer, rien à fermer")
    }

    // MARK: - Une session rouverte du même compte (#18911, audit)

    /// Le retrait vise `{ userId, deviceId }` : parti sous T-A1 après que A s'est
    /// reconnecté (T-A2), il effaçait les jetons que la nouvelle session venait
    /// d'enregistrer, et le compte connecté ne recevait plus rien.
    func test_run_whenTheSameAccountReopensBeforeARetry_abandonsTheUnregistrationAndRestoresItsTokens() async {
        let service = RecordingLogoutService(unregisterFailures: [.network(.timeout)])
        let restored = Counter()
        let device = PushDeviceRelease(
            deviceId: "install-1",
            sessionReopened: { service.events.contains { $0.hasPrefix("unregister:") } },
            restoreRegistrations: { restored.increment() }
        )

        await AuthServerLogout.run(token: "T-A1", using: service, unregisteringPushDevice: device, delays: Self.noDelay)

        XCTAssertEqual(service.events, ["unregister:install-1:T-A1", "logout:T-A1"],
                       "aucune nouvelle tentative ne part sous T-A1 une fois la session rouverte")
        XCTAssertEqual(restored.value, 1,
                       "la tentative échouée a pu être traitée par la passerelle : la session ouverte reposte ses jetons")
    }

    func test_run_whenTheUnregistrationLandsAfterTheSameAccountReopened_restoresItsTokens() async {
        let reopened = Flag()
        let service = RecordingLogoutService(onUnregister: { reopened.raise() })
        let restored = Counter()
        let device = PushDeviceRelease(
            deviceId: "install-1",
            sessionReopened: { reopened.value },
            restoreRegistrations: { restored.increment() }
        )

        await AuthServerLogout.run(token: "T-A1", using: service, unregisteringPushDevice: device, delays: Self.noDelay)

        XCTAssertEqual(restored.value, 1, "un retrait abouti sous une session rouverte a effacé ses jetons")
    }

    func test_run_withNoReopenedSession_restoresNothing() async {
        let service = RecordingLogoutService()
        let restored = Counter()
        let device = PushDeviceRelease(deviceId: "install-1", restoreRegistrations: { restored.increment() })

        await AuthServerLogout.run(token: "T-A", using: service, unregisteringPushDevice: device, delays: Self.noDelay)

        XCTAssertEqual(restored.value, 0)
    }

    func test_run_whenTheSessionReopensBeforeAnyAttempt_sendsNoUnregistrationAndRestoresNothing() async {
        let service = RecordingLogoutService()
        let restored = Counter()
        let device = PushDeviceRelease(
            deviceId: "install-1",
            sessionReopened: { true },
            restoreRegistrations: { restored.increment() }
        )

        await AuthServerLogout.run(token: "T-A1", using: service, unregisteringPushDevice: device, delays: Self.noDelay)

        XCTAssertEqual(service.events, ["logout:T-A1"], "la session rouverte enregistre elle-même ses jetons")
        XCTAssertEqual(restored.value, 0, "rien n'est parti : rien n'a pu être effacé")
    }

    func test_isSessionReopened_onlyForANewSessionOfTheLeavingAccount() {
        XCTAssertTrue(AuthServerLogout.isSessionReopened(
            activeUserId: "alice", authToken: "T-A2", leavingUserId: "alice", leavingToken: "T-A1"))
        XCTAssertFalse(AuthServerLogout.isSessionReopened(
            activeUserId: "alice", authToken: "T-A1", leavingUserId: "alice", leavingToken: "T-A1"),
                       "la session qui part n'est pas encore démontée")
        XCTAssertFalse(AuthServerLogout.isSessionReopened(
            activeUserId: nil, authToken: nil, leavingUserId: "alice", leavingToken: "T-A1"))
        XCTAssertFalse(AuthServerLogout.isSessionReopened(
            activeUserId: "bob", authToken: "T-B", leavingUserId: "alice", leavingToken: "T-A1"),
                       "le retrait sous T-A1 ne touche que les lignes de A : un autre compte ne l'arrête pas")
    }

    // MARK: - Les enregistrements encore en vol (#18911, audit)

    /// Une passerelle antérieure à #18910 valide un POST traité APRÈS le DELETE et
    /// recrée la ligne active du compte quitté : on attend la fin des POST en vol.
    func test_run_waitsForInFlightRegistrationsBeforeUnregistering() async {
        let service = RecordingLogoutService()
        let device = PushDeviceRelease(deviceId: "install-1", settleRegistrations: { service.note("settled") })

        await AuthServerLogout.run(token: "T-A", using: service, unregisteringPushDevice: device, delays: Self.noDelay)

        XCTAssertEqual(service.events, ["settled", "unregister:install-1:T-A", "logout:T-A"])
    }

    // MARK: - La tâche d'arrière-plan (#18911, audit)

    /// Sur une route lente, l'app mise en arrière-plan était suspendue avant le
    /// `POST /auth/logout` : la session serveur restait ouverte jusqu'à la reprise.
    func test_endSession_holdsABackgroundTaskUntilTheSessionIsClosed() async {
        let service = RecordingLogoutService()
        let tasks = RecordingBackgroundTasks(observing: service)

        await AuthServerLogout.endSession(
            token: "T-A",
            using: service,
            keychain: LogoutIdentityKeychain(),
            sessionReopened: { false },
            backgroundTasks: tasks,
            delays: Self.noDelay
        )

        XCTAssertEqual(tasks.eventsAtBegin, [], "la tâche est prise avant le premier octet")
        XCTAssertEqual(tasks.eventsAtEnd.last, "logout:T-A", "et rendue après la fermeture de la session")
        XCTAssertEqual(tasks.endCount, 1)
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
    private let onUnregister: @Sendable () -> Void

    init(unregisterFailures: [MeeshyError] = [], onUnregister: @escaping @Sendable () -> Void = {}) {
        self.pendingUnregisterFailures = unregisterFailures
        self.onUnregister = onUnregister
    }

    var events: [String] { lock.withLock { _events } }

    func note(_ event: String) {
        lock.withLock { _events.append(event) }
    }

    func unregisterPushDevice(deviceId: String, token: String) async throws {
        let failure: MeeshyError? = lock.withLock {
            _events.append("unregister:\(deviceId):\(token)")
            return pendingUnregisterFailures.isEmpty ? nil : pendingUnregisterFailures.removeFirst()
        }
        onUnregister()
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

private final class Counter: @unchecked Sendable {
    private let lock = NSLock()
    private var _value = 0
    var value: Int { lock.withLock { _value } }
    func increment() { lock.withLock { _value += 1 } }
}

private final class Flag: @unchecked Sendable {
    private let lock = NSLock()
    private var _value = false
    var value: Bool { lock.withLock { _value } }
    func raise() { lock.withLock { _value = true } }
}

/// Relève ce que le service a vu au début et à la fin de la tâche d'arrière-plan.
private final class RecordingBackgroundTasks: BackgroundTaskProviding, @unchecked Sendable {
    private let service: RecordingLogoutService
    private(set) var eventsAtBegin: [String]?
    private(set) var eventsAtEnd: [String] = []
    private(set) var endCount = 0

    init(observing service: RecordingLogoutService) {
        self.service = service
    }

    func beginBackgroundTask(
        withName name: String,
        expirationHandler: @escaping @MainActor @Sendable () -> Void
    ) -> BackgroundTaskToken {
        eventsAtBegin = service.events
        return BackgroundTaskToken(rawValue: 42)
    }

    func endBackgroundTask(_ token: BackgroundTaskToken) {
        eventsAtEnd = service.events
        endCount += 1
    }
}

private final class LogoutIdentityKeychain: KeychainStoring, @unchecked Sendable {
    private let lock = NSLock()
    private var store: [String: String] = [:]

    func save(_ value: String, forKey key: String, account: String?) throws { lock.withLock { store[key] = value } }
    func load(forKey key: String, account: String?) -> String? { lock.withLock { store[key] } }
    func delete(forKey key: String, account: String?) { lock.withLock { _ = store.removeValue(forKey: key) } }
    func saveAsync(_ value: String, forKey key: String, account: String?) async throws { try save(value, forKey: key, account: account) }
    func loadAsync(forKey key: String, account: String?) async -> String? { load(forKey: key, account: account) }
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
