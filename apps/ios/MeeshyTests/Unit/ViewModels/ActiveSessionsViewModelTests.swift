import XCTest
@testable import Meeshy
import MeeshySDK

/// A1 — pins `ActiveSessionsViewModel` behavior after extraction from
/// `ActiveSessionsView.swift` into its own file under `ViewModels/`.
///
/// The VM previously lived inline at the bottom of the View; extracting it
/// makes the contract testable and prevents future regressions where the
/// View accidentally instantiates an undefined symbol (the original audit
/// finding).
@MainActor
final class ActiveSessionsViewModelTests: XCTestCase {

    // MARK: - Factory

    private func makeSUT(
        service: MockSessionService? = nil
    ) -> (sut: ActiveSessionsViewModel, service: MockSessionService) {
        let svc = service ?? MockSessionService()
        let sut = ActiveSessionsViewModel(sessionService: svc)
        return (sut, svc)
    }

    private static func makeSession(
        id: String,
        deviceName: String = "iPhone",
        isCurrent: Bool = false
    ) -> UserSession {
        JSONStub.decode("""
        {
          "id": "\(id)",
          "deviceName": "\(deviceName)",
          "ipAddress": "10.0.0.1",
          "lastActive": null,
          "createdAt": "2026-01-01T00:00:00.000Z",
          "isCurrent": \(isCurrent)
        }
        """)
    }

    // MARK: - loadSessions

    func test_loadSessions_success_populatesSessions_andClearsLoading() async {
        let (sut, mock) = makeSUT()
        mock.listSessionsResult = .success([
            Self.makeSession(id: "s1", isCurrent: true),
            Self.makeSession(id: "s2")
        ])

        await sut.loadSessions()

        XCTAssertEqual(sut.sessions.count, 2)
        XCTAssertEqual(sut.sessions.first?.id, "s1")
        XCTAssertFalse(sut.isLoading)
        XCTAssertFalse(sut.showError)
        XCTAssertEqual(mock.listSessionsCallCount, 1)
    }

    func test_loadSessions_failure_setsErrorState_andLeavesSessionsUntouched() async {
        let (sut, mock) = makeSUT()
        mock.listSessionsResult = .failure(URLError(.notConnectedToInternet))

        await sut.loadSessions()

        XCTAssertTrue(sut.showError)
        XCTAssertFalse(sut.errorMessage.isEmpty)
        XCTAssertFalse(sut.isLoading)
        XCTAssertTrue(sut.sessions.isEmpty)
    }

    // MARK: - revokeSession

    func test_revokeSession_success_removesSessionFromList() async {
        let (sut, mock) = makeSUT()
        mock.listSessionsResult = .success([
            Self.makeSession(id: "s1", isCurrent: true),
            Self.makeSession(id: "s2"),
            Self.makeSession(id: "s3")
        ])
        await sut.loadSessions()

        await sut.revokeSession(sessionId: "s2")

        XCTAssertEqual(sut.sessions.map(\.id), ["s1", "s3"])
        XCTAssertEqual(mock.revokeSessionCallCount, 1)
        XCTAssertEqual(mock.lastRevokedSessionId, "s2")
        XCTAssertFalse(sut.isRevoking)
    }

    func test_revokeSession_failure_setsErrorState_andKeepsSessionInList() async {
        let (sut, mock) = makeSUT()
        mock.listSessionsResult = .success([Self.makeSession(id: "s1")])
        await sut.loadSessions()
        mock.revokeSessionResult = .failure(URLError(.timedOut))

        await sut.revokeSession(sessionId: "s1")

        XCTAssertEqual(sut.sessions.count, 1)
        XCTAssertTrue(sut.showError)
        XCTAssertFalse(sut.isRevoking)
    }

    // MARK: - revokeAllOtherSessions

    func test_revokeAllOtherSessions_success_keepsOnlyCurrentSession() async {
        let (sut, mock) = makeSUT()
        mock.listSessionsResult = .success([
            Self.makeSession(id: "s1", isCurrent: true),
            Self.makeSession(id: "s2"),
            Self.makeSession(id: "s3")
        ])
        await sut.loadSessions()

        await sut.revokeAllOtherSessions()

        XCTAssertEqual(sut.sessions.map(\.id), ["s1"])
        XCTAssertEqual(mock.revokeAllOtherSessionsCallCount, 1)
        XCTAssertFalse(sut.isRevoking)
    }

    func test_revokeAllOtherSessions_failure_setsErrorState_andKeepsAll() async {
        let (sut, mock) = makeSUT()
        mock.listSessionsResult = .success([
            Self.makeSession(id: "s1", isCurrent: true),
            Self.makeSession(id: "s2")
        ])
        await sut.loadSessions()
        mock.revokeAllOtherSessionsResult = .failure(URLError(.timedOut))

        await sut.revokeAllOtherSessions()

        XCTAssertEqual(sut.sessions.count, 2)
        XCTAssertTrue(sut.showError)
        XCTAssertFalse(sut.isRevoking)
    }

    // MARK: - dependency injection contract

    func test_init_acceptsServiceInjection_doesNotForceSingleton() {
        // Compile-time check: the VM must accept any SessionServiceProviding.
        let mock = MockSessionService()
        let vm = ActiveSessionsViewModel(sessionService: mock)
        XCTAssertNotNil(vm)
    }
}
