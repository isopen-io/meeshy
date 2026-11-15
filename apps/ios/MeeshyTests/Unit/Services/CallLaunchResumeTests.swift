import Combine
import XCTest
import MeeshySDK
@testable import Meeshy

/// #9111 — l'app relancée pendant un appel que le serveur tient encore le
/// REPREND, à la première connexion, sans geste.
@MainActor
final class CallLaunchResumeTests: XCTestCase {

    private final class OwnCallStub: OwnActiveCallProviding, @unchecked Sendable {
        var session: ActiveCallSession?
        private(set) var askCount = 0
        func ownActiveCall() async throws -> ActiveCallSession? {
            askCount += 1
            return session
        }
    }

    private func session(rows: [(String, Bool)]) -> ActiveCallSession {
        ActiveCallSession(
            id: "call-1", conversationId: "conv-1", mode: "p2p", status: "active",
            participants: rows.map { ActiveCallParticipant(userId: $0.0, leftAt: $0.1 ? "2026-10-02T10:00:00.000Z" : nil) }
        )
    }

    private func makeSUT(idle: Bool = true) -> (sut: CallLaunchResume, connected: PassthroughSubject<Bool, Never>, calls: OwnCallStub, resumed: () -> [String]) {
        let connected = PassthroughSubject<Bool, Never>()
        let calls = OwnCallStub()
        var resumed: [String] = []
        let sut = CallLaunchResume(
            isConnected: connected.eraseToAnyPublisher(),
            calls: calls,
            currentUserId: { "me" },
            isIdle: { idle },
            resume: { session, _ in resumed.append(session.id) }
        )
        return (sut, connected, calls, { resumed })
    }

    private func settle() async {
        for _ in 0..<20 { await Task.yield() }
    }

    func test_firstConnection_myLineStillHeld_resumesTheCall() async {
        let (sut, connected, calls, resumed) = makeSUT()
        calls.session = session(rows: [("me", false), ("bob", false)])

        sut.arm()
        connected.send(true)
        await settle()

        XCTAssertEqual(resumed(), ["call-1"])
    }

    func test_onlyTheFirstConnection_readsTheServer() async {
        let (sut, connected, calls, _) = makeSUT()
        sut.arm()
        sut.arm()
        connected.send(false)
        connected.send(true)
        connected.send(true)
        await settle()

        XCTAssertEqual(calls.askCount, 1)
    }

    func test_myLineAlreadyLeft_orNobodyWaiting_resumesNothing() async {
        let (sut, _, calls, resumed) = makeSUT()
        calls.session = session(rows: [("me", true), ("bob", false)])
        await sut.check()
        calls.session = session(rows: [("me", false), ("bob", true)])
        await sut.check()

        XCTAssertTrue(resumed().isEmpty)
    }

    func test_aCallAlreadyRunningLocally_isNeverDisturbed() async {
        let (sut, _, calls, resumed) = makeSUT(idle: false)
        calls.session = session(rows: [("me", false), ("bob", false)])

        await sut.check()

        XCTAssertTrue(resumed().isEmpty)
        XCTAssertEqual(calls.askCount, 0)
    }
}
