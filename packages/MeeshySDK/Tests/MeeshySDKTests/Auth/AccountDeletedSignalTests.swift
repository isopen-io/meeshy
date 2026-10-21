import XCTest
import Combine
@testable import MeeshySDK

/// #10482 — la passerelle dit « ce compte est supprimé » (#10264) par
/// `401 { code: "ACCOUNT_DELETED", accountId }` (toute requête, `/auth/refresh`
/// compris), par l'événement socket `error { code, accountId }` et par
/// `auth:session-revoked { deletedAccountId }`. L'appareil retire ce compte —
/// et lui seul : jamais sur `AUTH_FAILED`, `SESSION_REVOKED` ni un 401 sans
/// code, et seulement s'il est le propriétaire du jeton présenté ou de la
/// connexion, jamais le compte actif par défaut.
@MainActor
final class AccountDeletedSignalTests: XCTestCase {

    private final class Received: @unchecked Sendable {
        var accounts: [String] = []
    }

    private var observerToken: NSObjectProtocol?
    private var received = Received()
    private var originalKeychain: (any KeychainStoring)!
    private var originalUser: MeeshyUser?
    private var originalIsAuthenticated = false
    private var originalAuthToken: String?
    private var originalSavedAccounts: [SavedAccount] = []

    /// #10854 — les sockets de cette suite s'arment contre le loopback, dont
    /// le sondage tombe sous le sceau réseau : aucune ne joint un serveur.
    override func invokeTest() {
        SocketConfig.$loopbackOrigin.withValue(URL(string: "http://127.0.0.1:9")) { super.invokeTest() }
    }

    override func setUp() async throws {
        try await super.setUp()
        AccountDeletedStubProtocol.reset()
        await AuthManager.shared.cancelPendingTokenRefreshForTesting()
        originalKeychain = AuthManager.shared.keychain
        originalUser = AuthManager.shared.currentUser
        originalIsAuthenticated = AuthManager.shared.isAuthenticated
        originalAuthToken = APIClient.shared.authToken
        originalSavedAccounts = AuthManager.shared.savedAccounts
        AuthManager.shared.keychain = AccountDeletedKeychainStore()
        AuthManager.shared.isAuthenticated = false
        let received = Received()
        self.received = received
        observerToken = NotificationCenter.default.addObserver(forName: .meeshyAccountDeleted, object: nil, queue: nil) { note in
            if let id = AccountDeletedSignal.accountId(in: note) { received.accounts.append(id) }
        }
    }

    override func tearDown() async throws {
        if let observerToken { NotificationCenter.default.removeObserver(observerToken) }
        MessageSocketManager.shared.disconnect()
        await AuthManager.shared.cancelPendingTokenRefreshForTesting()
        AuthManager.shared.keychain = originalKeychain
        AuthManager.shared.currentUser = originalUser
        AuthManager.shared.isAuthenticated = originalIsAuthenticated
        AuthManager.shared.savedAccounts = originalSavedAccounts
        APIClient.shared.authToken = originalAuthToken
        AuthManager.shared.acknowledgeSessionRevocationNotice()
        AccountDeletedSignal.forgetAwaitingRetirementForTesting()
        AccountDeletedStubProtocol.reset()
        try await super.tearDown()
    }

    // MARK: - Fabriques

    private func jwt(for userId: String) -> String {
        func encode(_ json: String) -> String {
            Data(json.utf8).base64EncodedString()
                .replacingOccurrences(of: "+", with: "-").replacingOccurrences(of: "/", with: "_")
                .replacingOccurrences(of: "=", with: "")
        }
        return encode(#"{"alg":"HS256","typ":"JWT"}"#) + "."
            + encode(#"{"userId":"\#(userId)","sid":"s-\#(userId)","exp":4102444800}"#) + ".signature"
    }

    private func body(_ json: String) -> Data { Data(json.utf8) }

    private func deleted(_ accountId: String) -> Data {
        body(#"{"success":false,"error":"Account deleted","code":"ACCOUNT_DELETED","accountId":"\#(accountId)"}"#)
    }

    private func makeUser(_ id: String) -> MeeshyUser {
        MeeshyUser(
            id: id, username: id, email: "\(id)@test.com",
            role: "USER", systemLanguage: "fr",
            createdAt: "2024-01-01T00:00:00.000Z",
            updatedAt: "2024-01-01T00:00:00.000Z"
        )
    }

    private func makeStubbedClient(token: String?) -> APIClient {
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [AccountDeletedStubProtocol.self]
        let client = APIClient(urlSession: URLSession(configuration: config))
        client.authToken = token
        return client
    }

    // MARK: - La loi : le signal

    func test_namedAccount_401AccountDeleted_namesTheAccount() {
        XCTAssertEqual(AccountDeletedSignal.namedAccount(statusCode: 401, body: deleted("user-a")), "user-a")
    }

    func test_namedAccount_authFailedSessionRevokedOrNoCode_nameNothing() {
        XCTAssertNil(AccountDeletedSignal.namedAccount(statusCode: 401, body: body(#"{"code":"AUTH_FAILED","accountId":"user-a"}"#)))
        XCTAssertNil(AccountDeletedSignal.namedAccount(statusCode: 401, body: body(#"{"code":"SESSION_REVOKED","accountId":"user-a"}"#)))
        XCTAssertNil(AccountDeletedSignal.namedAccount(statusCode: 401, body: body(#"{"error":"Invalid JWT token"}"#)))
        XCTAssertNil(AccountDeletedSignal.namedAccount(statusCode: 401, body: body(#"{"code":"ACCOUNT_DELETED"}"#)))
        XCTAssertNil(AccountDeletedSignal.namedAccount(statusCode: 401, body: nil))
    }

    func test_namedAccount_codeUnderAnotherStatus_namesNothing() {
        XCTAssertNil(AccountDeletedSignal.namedAccount(statusCode: 403, body: deleted("user-a")))
    }

    func test_namedAccount_somethingThatIsNotAnIdentifier_namesNothing() {
        XCTAssertNil(AccountDeletedSignal.namedAccount(statusCode: 401, body: deleted("../user-b")))
        XCTAssertNil(AccountDeletedSignal.namedAccount(statusCode: 401, body: deleted("")))
        XCTAssertNil(AccountDeletedSignal.namedAccount(statusCode: 401, body: deleted("a/b")))
    }

    func test_namedAccount_socketError_readsCodeAndAccount() {
        XCTAssertEqual(AccountDeletedSignal.namedAccount(socketErrorPayload: [["message": "Account disabled", "code": "ACCOUNT_DELETED", "accountId": "user-a"]]), "user-a")
        XCTAssertNil(AccountDeletedSignal.namedAccount(socketErrorPayload: [["message": "Account disabled"]]))
    }

    func test_namedAccount_sessionRevoked_onlyWithDeletedAccountId() {
        XCTAssertEqual(AccountDeletedSignal.namedAccount(sessionRevokedPayload: [["code": "session_revoked", "reason": "logout_all_devices", "deletedAccountId": "user-a"]]), "user-a")
        XCTAssertNil(AccountDeletedSignal.namedAccount(sessionRevokedPayload: [["code": "session_revoked", "reason": "logout_all_devices"]]))
    }

    // MARK: - La loi : le propriétaire

    func test_owner_readsTheUserIdOfTheJWT() {
        XCTAssertEqual(AccountDeletedSignal.owner(ofJWT: jwt(for: "user-a")), "user-a")
        XCTAssertEqual(AccountDeletedSignal.owner(ofJWT: "Bearer " + jwt(for: "user-a")), "user-a")
        XCTAssertNil(AccountDeletedSignal.owner(ofJWT: "tok-a"))
        XCTAssertNil(AccountDeletedSignal.owner(ofJWT: nil))
    }

    func test_owned_onlyTheOwnerOfThePresentedToken() {
        XCTAssertEqual(AccountDeletedSignal.owned("user-a", by: "user-a"), "user-a")
        XCTAssertNil(AccountDeletedSignal.owned("user-b", by: "user-a"), "un refus qui nomme un autre compte ne retire personne")
        XCTAssertNil(AccountDeletedSignal.owned("user-a", by: nil), "une requête sans jeton de compte (invité) ne retire personne")
    }

    func test_presentedOwner_refreshBodyAndHeaderMustAgree() {
        let refreshBody = body(#"{"token":"\#(jwt(for: "user-a"))"}"#)
        XCTAssertEqual(AccountDeletedSignal.presentedOwner(authorization: "Bearer " + jwt(for: "user-a"), body: refreshBody), "user-a")
        XCTAssertEqual(AccountDeletedSignal.presentedOwner(authorization: nil, body: refreshBody), "user-a")
        XCTAssertEqual(AccountDeletedSignal.presentedOwner(authorization: "Bearer " + jwt(for: "user-a"), body: nil), "user-a")
        XCTAssertNil(AccountDeletedSignal.presentedOwner(authorization: "Bearer " + jwt(for: "user-b"), body: refreshBody),
                     "deux propriétaires différents ne désignent personne")
    }

    // MARK: - Le transport HTTP

    func test_request_401AccountDeletedForTheTokenOwner_signalsThatAccount() async {
        AccountDeletedStubProtocol.respond(status: 401, body: deleted("user-a"))
        let client = makeStubbedClient(token: jwt(for: "user-a"))

        let _: SimpleAPIResponse? = try? await client.requestWithHeaders(MeEndpoint.accountDeletion)

        XCTAssertEqual(received.accounts, ["user-a"])
    }

    func test_request_401AccountDeletedNamingAnotherAccount_signalsNothing() async {
        AccountDeletedStubProtocol.respond(status: 401, body: deleted("user-b"))
        let client = makeStubbedClient(token: jwt(for: "user-a"))

        let _: SimpleAPIResponse? = try? await client.requestWithHeaders(MeEndpoint.accountDeletion)

        XCTAssertTrue(received.accounts.isEmpty, "le compte actif n'est jamais retiré à la place du compte nommé, ni l'inverse")
    }

    func test_request_ordinary401_signalsNothing() async {
        for refusal in [#"{"code":"AUTH_FAILED","error":"Invalid JWT token"}"#, #"{"code":"SESSION_REVOKED"}"#, #"{"error":"Unauthorized"}"#] {
            AccountDeletedStubProtocol.respond(status: 401, body: body(refusal))
            let client = makeStubbedClient(token: jwt(for: "user-a"))
            let _: SimpleAPIResponse? = try? await client.requestWithHeaders(MeEndpoint.accountDeletion)
        }

        XCTAssertTrue(received.accounts.isEmpty)
    }

    func test_refresh_401AccountDeleted_signalsTheAccountOfTheRefreshedToken() async throws {
        AccountDeletedStubProtocol.respond(status: 401, body: deleted("user-a"))
        let client = makeStubbedClient(token: jwt(for: "user-a"))
        let refreshBody = try JSONEncoder().encode(RefreshTokenRequest(token: jwt(for: "user-a"), sessionToken: "sess-a"))

        let _: SimpleAPIResponse? = try? await client.requestWithHeaders(AuthEndpoint.refresh, method: "POST", body: refreshBody)

        XCTAssertEqual(received.accounts, ["user-a"])
    }

    func test_pinnedRequest_401AccountDeleted_signalsThePinnedTokenOwner() async {
        AccountDeletedStubProtocol.respond(status: 401, body: deleted("user-b"))
        let client = makeStubbedClient(token: jwt(for: "user-a"))

        let _: SimpleAPIResponse? = try? await client.requestPinned(
            AuthEndpoint.logout, method: "POST", body: nil, headers: [:], bearerToken: jwt(for: "user-b"))

        XCTAssertEqual(received.accounts, ["user-b"], "le jeton épinglé est celui de B, pas celui du compte actif")
    }

    // MARK: - Le socket

    private func connectAs(_ userId: String) {
        MessageSocketManager.shared.disconnect()
        APIClient.shared.authToken = jwt(for: userId)
        MessageSocketManager.shared.connect()
    }

    func test_socket_connectionAccount_isTheOwnerOfTheHandshakeJWT() {
        connectAs("user-a")
        XCTAssertEqual(MessageSocketManager.shared.connectionAccountId, "user-a")

        MessageSocketManager.shared.disconnect()
        MessageSocketManager.shared.connectAnonymous(sessionToken: "anon_live")
        XCTAssertNil(MessageSocketManager.shared.connectionAccountId, "un invité ne parle au nom d'aucun compte")
    }

    func test_socketError_accountDeletedForTheConnection_stopsTheTransportAndSignals() {
        connectAs("user-a")

        MessageSocketManager.shared.handleSocketError(
            [["message": "Account disabled", "code": "ACCOUNT_DELETED", "accountId": "user-a"]])

        XCTAssertEqual(received.accounts, ["user-a"])
        XCTAssertNil(MessageSocketManager.shared.socket, "les reconnexions seraient refusées de la même façon")
    }

    func test_socketError_accountDeletedNamingAnotherAccount_keepsTheTransportAndSignalsNothing() {
        connectAs("user-a")

        MessageSocketManager.shared.handleSocketError(
            [["message": "Account disabled", "code": "ACCOUNT_DELETED", "accountId": "user-b"]])

        XCTAssertTrue(received.accounts.isEmpty)
        XCTAssertNotNil(MessageSocketManager.shared.socket)
    }

    func test_socketError_accountDisabledWithoutCode_signalsNothing() {
        connectAs("user-a")

        MessageSocketManager.shared.handleSocketError([["message": "Account disabled"]])

        XCTAssertTrue(received.accounts.isEmpty)
    }

    func test_socketError_guestConnection_signalsNothing() {
        MessageSocketManager.shared.disconnect()
        MessageSocketManager.shared.connectAnonymous(sessionToken: "anon_live")

        MessageSocketManager.shared.handleSocketError(
            [["message": "Account disabled", "code": "ACCOUNT_DELETED", "accountId": "user-a"]])

        XCTAssertTrue(received.accounts.isEmpty)
    }

    func test_sessionRevoked_withDeletedAccountOfTheConnection_signals() {
        connectAs("user-a")

        MessageSocketManager.shared.signalAccountDeleted(sessionRevokedPayload: [["reason": "logout_all_devices", "deletedAccountId": "user-a"]])
        MessageSocketManager.shared.signalAccountDeleted(sessionRevokedPayload: [["reason": "logout_all_devices"]])
        MessageSocketManager.shared.signalAccountDeleted(sessionRevokedPayload: [["reason": "logout_all_devices", "deletedAccountId": "user-b"]])

        XCTAssertEqual(received.accounts, ["user-a"], "sans le champ, ou pour un autre compte, rien n'est retiré")
    }

    // MARK: - Le retrait

    private func seedAccounts(active: String, others: [String]) throws {
        let auth = AuthManager.shared
        auth.savedAccounts = []
        for id in others + [active] {
            try auth.keychain.save("tok-\(id)", forKey: auth.tokenKey(for: id), account: nil)
            try auth.keychain.save("sess-\(id)", forKey: auth.sessionTokenKey(for: id), account: nil)
            auth.upsertSavedAccount(from: makeUser(id))
        }
        auth.activeUserId = active
        auth.currentUser = makeUser(active)
        APIClient.shared.authToken = "tok-\(active)"
        auth.isAuthenticated = true
    }

    func test_retire_aKeptAccount_leavesTheOpenSessionAlone() async throws {
        let auth = AuthManager.shared
        try seedAccounts(active: "user-b", others: ["user-a"])

        let retired = await auth.retireDeletedAccount(userId: "user-a")

        XCTAssertTrue(retired)
        XCTAssertEqual(auth.savedAccounts.map(\.id), ["user-b"])
        XCTAssertNil(auth.keychain.load(forKey: auth.tokenKey(for: "user-a"), account: nil))
        XCTAssertNil(auth.keychain.load(forKey: auth.sessionTokenKey(for: "user-a"), account: nil))
        XCTAssertEqual(auth.activeAccountId, "user-b")
        XCTAssertTrue(auth.isAuthenticated)
        XCTAssertEqual(APIClient.shared.authToken, "tok-user-b")
        XCTAssertEqual(auth.keychain.load(forKey: auth.tokenKey(for: "user-b"), account: nil), "tok-user-b")
    }

    /// Le démontage complet de la session ouverte (`leaveActiveSession`) touche
    /// `UNUserNotificationCenter`, absent d'un hôte de test SPM : la loi qui le
    /// décide est témoignée ici, le démontage l'est par la déconnexion.
    func test_retirementLaw_leavesTheOpenSessionOnlyForItsOwnAccount() {
        XCTAssertTrue(AuthManager.retirementLeavesTheOpenSession(retiredUserId: "user-a", activeUserId: "user-a"))
        XCTAssertFalse(AuthManager.retirementLeavesTheOpenSession(retiredUserId: "user-a", activeUserId: "user-b"))
        XCTAssertFalse(AuthManager.retirementLeavesTheOpenSession(retiredUserId: "user-a", activeUserId: nil))
    }

    // MARK: - Un compte supprimé ne s'annonce pas « session fermée »

    private final class Count: @unchecked Sendable {
        var value = 0
    }

    func test_requireReauthentication_forADeletedAccount_doesNotInviteToSignBackIn() throws {
        let auth = AuthManager.shared
        try seedAccounts(active: "user-gone", others: [])
        let invalidations = Count()
        let subscription = auth.sessionInvalidated.sink { invalidations.value += 1 }
        defer { subscription.cancel() }
        AccountDeletedSignal.signal(accountId: "user-gone", center: NotificationCenter())

        auth.requireReauthentication(userId: "user-gone", generation: auth.sessionGeneration)

        XCTAssertEqual(invalidations.value, 0, "on n'invite pas à se reconnecter à un compte supprimé")
        XCTAssertTrue(auth.isAuthenticated, "c'est le retrait qui démonte la session")
    }

    func test_requireReauthentication_forAnAccountNotDeleted_stillInvitesToSignBackIn() throws {
        let auth = AuthManager.shared
        try seedAccounts(active: "user-alive", others: [])
        let invalidations = Count()
        let subscription = auth.sessionInvalidated.sink { invalidations.value += 1 }
        defer { subscription.cancel() }
        AccountDeletedSignal.signal(accountId: "user-other-gone", center: NotificationCenter())

        auth.requireReauthentication(userId: "user-alive", generation: auth.sessionGeneration)

        XCTAssertEqual(invalidations.value, 1)
        XCTAssertFalse(auth.isAuthenticated)
    }

    func test_handleSessionRevoked_forADeletedAccount_showsNoClosedSessionNotice() throws {
        let auth = AuthManager.shared
        try seedAccounts(active: "user-purged", others: [])
        AccountDeletedSignal.signal(accountId: "user-purged", center: NotificationCenter())

        auth.handleSessionRevoked(reason: .logoutAllDevices)

        XCTAssertNil(auth.sessionRevocationNotice, "« session fermée » ne dit pas « compte supprimé »")
        XCTAssertTrue(auth.isAuthenticated)
    }

    func test_retire_clearsTheMarkOfTheRetiredAccount() async throws {
        let auth = AuthManager.shared
        try seedAccounts(active: "user-b", others: ["user-retired"])
        AccountDeletedSignal.signal(accountId: "user-retired", center: NotificationCenter())
        XCTAssertTrue(AccountDeletedSignal.isAwaitingRetirement("user-retired"))

        _ = await auth.retireDeletedAccount(userId: "user-retired")

        XCTAssertFalse(AccountDeletedSignal.isAwaitingRetirement("user-retired"))
    }

    func test_retire_somethingThatIsNotAnIdentifier_touchesNothing() async throws {
        let auth = AuthManager.shared
        try seedAccounts(active: "user-a", others: ["user-b"])

        let retired = await auth.retireDeletedAccount(userId: "../user-b")

        XCTAssertFalse(retired)
        XCTAssertEqual(Set(auth.savedAccounts.map(\.id)), ["user-a", "user-b"])
        XCTAssertTrue(auth.isAuthenticated)
    }
}

/// Répond le statut et le corps demandés à TOUTE requête.
private final class AccountDeletedStubProtocol: URLProtocol {
    nonisolated(unsafe) static var status = 401
    nonisolated(unsafe) static var body = Data()

    static func reset() {
        status = 401
        body = Data()
    }

    static func respond(status: Int, body: Data) {
        Self.status = status
        Self.body = body
    }

    override nonisolated class func canInit(with request: URLRequest) -> Bool { true }

    override nonisolated class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override nonisolated func startLoading() {
        let response = HTTPURLResponse(
            url: request.url ?? URL(string: "https://stub.meeshy.test")!,
            statusCode: Self.status, httpVersion: nil, headerFields: ["Content-Type": "application/json"])!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: Self.body)
        client?.urlProtocolDidFinishLoading(self)
    }

    override nonisolated func stopLoading() {}
}

private final class AccountDeletedKeychainStore: KeychainStoring, @unchecked Sendable {
    private var store: [String: String] = [:]

    func save(_ value: String, forKey key: String, account: String?) throws {
        store[key] = value
    }

    func load(forKey key: String, account: String?) -> String? {
        store[key]
    }

    func delete(forKey key: String, account: String?) {
        store.removeValue(forKey: key)
    }

    func saveAsync(_ value: String, forKey key: String, account: String?) async throws {
        try save(value, forKey: key, account: account)
    }

    func loadAsync(forKey key: String, account: String?) async -> String? {
        load(forKey: key, account: account)
    }
}
