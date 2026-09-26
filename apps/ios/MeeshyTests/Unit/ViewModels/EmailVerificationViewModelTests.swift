import XCTest
@testable import Meeshy
import MeeshySDK

@MainActor
private final class MockEmailVerificationConfirmer: EmailVerificationConfirming {
    nonisolated deinit {}
    static let proven = EmailProvenSession(
        token: "jwt-proven",
        sessionToken: "session-proven",
        user: MeeshyUser(id: "proven-user", username: "proven", displayName: "Proven")
    )
    var result: Result<EmailProvenSession?, Error> = .success(MockEmailVerificationConfirmer.proven)
    private(set) var requests: [EmailVerificationRequest] = []
    private(set) var openedSessions: [String] = []

    func verifyEmail(_ request: EmailVerificationRequest) async throws -> EmailProvenSession? {
        requests.append(request)
        return try result.get()
    }

    func openSession(_ proven: EmailProvenSession) {
        openedSessions.append(proven.token)
    }
}

/// Un état scripté par lecture ; au-delà du script, la dernière valeur se répète.
private final class MockEmailVerificationWatcher: EmailVerificationWatching, @unchecked Sendable {
    private let lock = NSLock()
    private var script: [Result<EmailVerificationWatchStatus, Error>]
    private var _tokens: [String] = []

    init(_ script: [Result<EmailVerificationWatchStatus, Error>]) {
        self.script = script
    }

    var tokens: [String] { lock.withLock { _tokens } }
    var callCount: Int { tokens.count }

    func emailVerificationStatus(pendingSessionToken: String) async throws -> EmailVerificationWatchStatus {
        let next: Result<EmailVerificationWatchStatus, Error> = lock.withLock {
            _tokens.append(pendingSessionToken)
            return script.count > 1 ? script.removeFirst() : (script.first ?? .success(.pending))
        }
        return try next.get()
    }
}

@MainActor
final class EmailVerificationViewModelTests: XCTestCase {

    // MARK: - Factory

    private func makeSUT(
        email: String = "test@example.com",
        password: String? = nil,
        accountCreated: Bool = false,
        pendingSessionToken: String? = nil,
        watcher: EmailVerificationWatching = MockEmailVerificationWatcher([]),
        watchLimit: Duration = .seconds(5)
    ) -> (sut: EmailVerificationViewModel, authService: MockAuthServiceSDK, confirmer: MockEmailVerificationConfirmer) {
        let authService = MockAuthServiceSDK()
        let confirmer = MockEmailVerificationConfirmer()
        let sut = EmailVerificationViewModel(
            email: email,
            password: password,
            accountCreated: accountCreated,
            pendingSessionToken: pendingSessionToken,
            authService: authService,
            confirmer: confirmer,
            watcher: watcher,
            watchInterval: .zero,
            watchLimit: watchLimit
        )
        return (sut, authService, confirmer)
    }

    // MARK: - verifyCode

    func test_verifyCode_sessionServed_succeedsWithoutOpeningTheSessionYet() async {
        let (sut, _, confirmer) = makeSUT()
        confirmer.result = .success(MockEmailVerificationConfirmer.proven)

        await sut.verifyCode("123456")

        XCTAssertTrue(sut.verificationSuccess)
        XCTAssertFalse(sut.sessionOpened)
        XCTAssertEqual(confirmer.openedSessions, [])
        XCTAssertNil(sut.error)
        XCTAssertFalse(sut.isVerifying)
        XCTAssertEqual(confirmer.requests, [.code("123456", email: "test@example.com")])
    }

    func test_verifyCode_sendsThePasswordTypedAtLogin() async {
        let (sut, _, confirmer) = makeSUT(email: "new@example.com", password: "typed-at-login")

        await sut.verifyCode("111222")

        XCTAssertEqual(confirmer.requests, [.code("111222", email: "new@example.com", password: "typed-at-login")])
    }

    func test_verifyCode_verifiedWithoutSession_succeedsWithoutOpeningSession() async {
        let (sut, _, confirmer) = makeSUT()
        confirmer.result = .success(nil)

        await sut.verifyCode("123456")

        XCTAssertTrue(sut.verificationSuccess)
        XCTAssertFalse(sut.sessionOpened)
    }

    // MARK: - #8059 — la session s'ouvre une fois l'écran refermé

    /// Ouvrir la session pendant que la feuille est présentée démonte l'écran de
    /// connexion qui la présente : la feuille reste figée sur « Email vérifié ! ».
    /// L'hôte referme d'abord, puis demande l'ouverture — une seule fois.
    func test_openProvenSession_afterVerification_opensItOnce() async {
        let (sut, _, confirmer) = makeSUT()
        await sut.verifyCode("123456")

        sut.openProvenSession()
        sut.openProvenSession()

        XCTAssertEqual(confirmer.openedSessions, ["jwt-proven"])
        XCTAssertTrue(sut.sessionOpened)
    }

    func test_openProvenSession_withoutVerification_opensNothing() {
        let (sut, _, confirmer) = makeSUT()

        sut.openProvenSession()

        XCTAssertEqual(confirmer.openedSessions, [])
        XCTAssertFalse(sut.sessionOpened)
    }

    func test_openProvenSession_verifiedWithoutSession_opensNothing() async {
        let (sut, _, confirmer) = makeSUT()
        confirmer.result = .success(nil)
        await sut.verifyCode("123456")

        sut.openProvenSession()

        XCTAssertEqual(confirmer.openedSessions, [])
    }

    func test_verifyCode_error_setsError() async {
        let (sut, _, confirmer) = makeSUT()
        confirmer.result = .failure(MeeshyError.server(statusCode: 400, message: "Invalid code"))

        await sut.verifyCode("000000")

        XCTAssertFalse(sut.verificationSuccess)
        XCTAssertFalse(sut.sessionOpened)
        XCTAssertNotNil(sut.error)
        XCTAssertFalse(sut.isVerifying)
    }

    func test_verifyCode_clearsOldError() async {
        let (sut, _, confirmer) = makeSUT()
        confirmer.result = .failure(NSError(domain: "test", code: 500))
        await sut.verifyCode("bad")
        XCTAssertNotNil(sut.error)

        confirmer.result = .success(MockEmailVerificationConfirmer.proven)
        await sut.verifyCode("good")
        XCTAssertNil(sut.error)
        XCTAssertTrue(sut.verificationSuccess)
    }

    // MARK: - resendCode

    func test_resendCode_success_callsResendVerification() async {
        let (sut, mock, _) = makeSUT(email: "user@test.com")
        mock.resendVerificationEmailResult = .success(())

        await sut.resendCode()

        XCTAssertEqual(mock.resendVerificationEmailCallCount, 1)
        XCTAssertEqual(mock.lastResendEmail, "user@test.com")
        XCTAssertFalse(sut.isResending)
        XCTAssertNil(sut.error)
    }

    func test_resendCode_error_setsError() async {
        let (sut, mock, _) = makeSUT()
        mock.resendVerificationEmailResult = .failure(NSError(domain: "test", code: 429))

        await sut.resendCode()

        XCTAssertNotNil(sut.error)
        XCTAssertFalse(sut.isResending)
    }

    // MARK: - #8083 — l'adresse prouvée AILLEURS se dit, sans jamais connecter

    func test_watchProof_provenElsewhere_saysSoAndStops() async {
        let watcher = MockEmailVerificationWatcher([.success(.pending), .success(.pending), .success(.proven)])
        let (sut, _, confirmer) = makeSUT(pendingSessionToken: "attente", watcher: watcher)

        await sut.watchProof()

        XCTAssertTrue(sut.addressProvenElsewhere)
        XCTAssertEqual(watcher.tokens, ["attente", "attente", "attente"])
        XCTAssertEqual(confirmer.openedSessions, [], "prouvée ailleurs ne connecte JAMAIS cet appareil")
        XCTAssertEqual(confirmer.requests, [])
        XCTAssertFalse(sut.verificationSuccess)
    }

    func test_watchProof_withoutToken_asksNothing() async {
        let watcher = MockEmailVerificationWatcher([.success(.proven)])
        let (sut, _, _) = makeSUT(pendingSessionToken: nil, watcher: watcher)

        await sut.watchProof()

        XCTAssertEqual(watcher.callCount, 0)
        XCTAssertFalse(sut.addressProvenElsewhere)
    }

    func test_watchProof_endedToken_stopsWithoutClaimingProof() async {
        let watcher = MockEmailVerificationWatcher([.success(.pending), .success(.ended)])
        let (sut, _, _) = makeSUT(pendingSessionToken: "attente", watcher: watcher)

        await sut.watchProof()

        XCTAssertEqual(watcher.callCount, 2)
        XCTAssertFalse(sut.addressProvenElsewhere)
    }

    func test_watchProof_transientFailure_keepsWatching() async {
        let watcher = MockEmailVerificationWatcher([
            .failure(MeeshyError.server(statusCode: 503, message: "down")),
            .success(.proven),
        ])
        let (sut, _, _) = makeSUT(pendingSessionToken: "attente", watcher: watcher)

        await sut.watchProof()

        XCTAssertTrue(sut.addressProvenElsewhere)
        XCTAssertEqual(watcher.callCount, 2)
    }

    func test_watchProof_stopsAtItsLimit() async {
        let watcher = MockEmailVerificationWatcher([.success(.pending)])
        let (sut, _, _) = makeSUT(pendingSessionToken: "attente", watcher: watcher, watchLimit: .zero)

        await sut.watchProof()

        XCTAssertLessThanOrEqual(watcher.callCount, 1)
        XCTAssertFalse(sut.addressProvenElsewhere)
    }

    /// Aucune lecture ne survit à l'écran : la tâche que SwiftUI annule au
    /// démontage (ou au passage en arrière-plan) rend la main.
    func test_watchProof_cancelled_returns() async {
        let watcher = MockEmailVerificationWatcher([.success(.pending)])
        let (sut, _, _) = makeSUT(pendingSessionToken: "attente", watcher: watcher, watchLimit: .seconds(3600))

        let task = Task { await sut.watchProof() }
        task.cancel()
        await task.value

        let apres = watcher.callCount
        try? await Task.sleep(for: .milliseconds(50))
        XCTAssertEqual(watcher.callCount, apres, "plus aucune lecture après l'annulation")
    }

    func test_watchProof_afterCodeVerified_asksNothing() async {
        let watcher = MockEmailVerificationWatcher([.success(.proven)])
        let (sut, _, _) = makeSUT(pendingSessionToken: "attente", watcher: watcher)
        await sut.verifyCode("123456")

        await sut.watchProof()

        XCTAssertEqual(watcher.callCount, 0)
    }

    func test_watchProof_followsARenewedToken() async {
        let watcher = MockEmailVerificationWatcher([.success(.proven)])
        let (sut, _, _) = makeSUT(pendingSessionToken: "ancien", watcher: watcher)
        sut.pendingSessionToken = "neuf"

        await sut.watchProof()

        XCTAssertEqual(watcher.tokens, ["neuf"])
    }

    // MARK: - properties

    func test_properties_matchInitialization() {
        let (sut, _, _) = makeSUT(email: "hello@world.com", accountCreated: true)
        XCTAssertEqual(sut.email, "hello@world.com")
        XCTAssertTrue(sut.accountCreated)
    }

    func test_initialState_allFlagsAreFalse() {
        let (sut, _, _) = makeSUT()
        XCTAssertFalse(sut.isVerifying)
        XCTAssertFalse(sut.isResending)
        XCTAssertFalse(sut.resendSuccess)
        XCTAssertFalse(sut.verificationSuccess)
        XCTAssertFalse(sut.sessionOpened)
        XCTAssertNil(sut.error)
    }
}
