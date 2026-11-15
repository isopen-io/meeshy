import XCTest
import MeeshySDK
@testable import Meeshy

/// #9111 — « Appeler » une conversation dont l'appel est en cours le REJOINT :
/// plus de `call:force-leave` qui quittait la ligne que le revenant venait
/// retrouver (et terminait le duo pour l'autre).
@MainActor
final class CallDialRouterTests: XCTestCase {

    private final class ActiveCallStub: ActiveCallServiceProviding, @unchecked Sendable {
        var session: ActiveCallSession?
        func activeCall(conversationId: String) async throws -> ActiveCallSession? { session }
    }

    private func session(conversationId: String = "conv-1", rows: [(String, Bool)], type: String? = "video") -> ActiveCallSession {
        ActiveCallSession(
            id: "call-live", conversationId: conversationId, mode: "p2p", status: "active",
            metadata: type.map { ActiveCallMetadata(type: $0) },
            participants: rows.map { ActiveCallParticipant(userId: $0.0, leftAt: $0.1 ? "2026-10-02T10:00:00.000Z" : nil) }
        )
    }

    private func makeRouter(_ stub: ActiveCallStub, group: Bool = false) -> CallDialRouter {
        CallDialRouter(activeCalls: stub, currentUserId: { "me" }, isGroupConversation: { _ in group }, join: { _ in })
    }

    func test_liveCall_aCallWithThePeerStillIn_isJoined() async {
        let stub = ActiveCallStub()
        stub.session = session(rows: [("me", false), ("bob", false)])

        let request = await makeRouter(stub).liveCall(conversationId: "conv-1", peerUserId: "bob", displayName: "Bob")

        XCTAssertEqual(request?.callId, "call-live")
        XCTAssertEqual(request?.fallbackRemoteUserId, "bob")
        XCTAssertEqual(request?.isVideo, true)
        XCTAssertEqual(request?.isGroup, false)
    }

    func test_liveCall_group_joinsThroughTheConversation() async {
        let stub = ActiveCallStub()
        stub.session = session(rows: [("bob", false), ("cleo", false)])

        let request = await makeRouter(stub, group: true).liveCall(conversationId: "conv-1", peerUserId: "conv-1", displayName: "Équipe")

        XCTAssertEqual(request?.isGroup, true)
        XCTAssertNil(request?.fallbackRemoteUserId)
        XCTAssertEqual(request?.fallbackDisplayName, "Équipe")
    }

    func test_liveCall_noCallOrNobodyElseLeft_startsANewCall() async {
        let stub = ActiveCallStub()
        let router = makeRouter(stub)

        let none = await router.liveCall(conversationId: "conv-1", peerUserId: "bob", displayName: "Bob")
        stub.session = session(rows: [("me", false), ("bob", true)])
        let alone = await router.liveCall(conversationId: "conv-1", peerUserId: "bob", displayName: "Bob")

        XCTAssertNil(none)
        XCTAssertNil(alone)
    }
}
