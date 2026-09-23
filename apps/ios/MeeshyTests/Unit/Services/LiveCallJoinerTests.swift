import XCTest
import MeeshySDK
@testable import Meeshy

/// #7548 — « Rejoindre » depuis la LISTE suit la même revalidation que la
/// bulle vivante du fil : un seul site, `LiveCallJoiner`.
@MainActor
final class LiveCallJoinerTests: XCTestCase {

    private final class ActiveCallStub: ActiveCallServiceProviding, @unchecked Sendable {
        var result: Result<ActiveCallSession?, Error> = .success(nil)
        private(set) var askedConversationIds: [String] = []

        func activeCall(conversationId: String) async throws -> ActiveCallSession? {
            askedConversationIds.append(conversationId)
            return try result.get()
        }
    }

    @MainActor
    private final class CallSpy {
        var currentCallId: String?
        var isIdle = true
        var pendingCallId: String?
        private(set) var broughtForward = 0
        private(set) var rejoins: [(callId: String, conversationId: String, remoteUserId: String, name: String, isVideo: Bool)] = []

        var context: LiveCallJoinContext {
            LiveCallJoinContext(
                currentCallId: { [weak self] in self?.currentCallId },
                isIdle: { [weak self] in self?.isIdle ?? true },
                hasPendingIncomingCall: { [weak self] in self?.pendingCallId == $0 },
                bringCallUIForward: { [weak self] in self?.broughtForward += 1 },
                rejoinActiveCall: { [weak self] callId, conversationId, remoteUserId, name, isVideo in
                    self?.rejoins.append((callId, conversationId, remoteUserId, name, isVideo))
                    return true
                }
            )
        }
    }

    private func conversation(call: ConversationActiveCall?) -> Conversation {
        var row = Conversation(id: "conv-1", identifier: "conv-1", type: .direct, lastMessageAt: Date())
        row.title = "Alice"
        row.participantUserId = "u-alice"
        row.activeCall = call
        return row
    }

    private func call(id: String = "call-1", kind: String = "video") -> ConversationActiveCall {
        ConversationActiveCall(id: id, kind: kind, participantCount: 2, startedAt: Date())
    }

    // MARK: - La demande tirée d'une ligne de liste

    func test_request_fromARowWithoutCall_isNil() {
        XCTAssertNil(LiveCallJoinRequest(conversation: conversation(call: nil), currentUserId: "u-me"))
    }

    func test_request_fromARowWithACall_carriesItsIdKindAndPeer() throws {
        let request = try XCTUnwrap(LiveCallJoinRequest(conversation: conversation(call: call()), currentUserId: "u-me"))

        XCTAssertEqual(request.callId, "call-1")
        XCTAssertEqual(request.conversationId, "conv-1")
        XCTAssertTrue(request.isVideo)
        XCTAssertEqual(request.fallbackRemoteUserId, "u-alice")
        XCTAssertEqual(request.fallbackDisplayName, "Alice")
    }

    func test_request_audioCall_isNotVideo() throws {
        let request = try XCTUnwrap(LiveCallJoinRequest(conversation: conversation(call: call(kind: "audio")), currentUserId: "u-me"))

        XCTAssertFalse(request.isVideo)
    }

    // MARK: - Les quatre branches, depuis la liste

    func test_join_alreadyOnThisCall_bringsTheCallForward_withoutAskingTheServer() async throws {
        let spy = CallSpy()
        spy.currentCallId = "call-1"
        spy.isIdle = false
        let service = ActiveCallStub()
        let request = try XCTUnwrap(LiveCallJoinRequest(conversation: conversation(call: call()), currentUserId: "u-me"))

        await LiveCallJoiner(context: spy.context, activeCallService: service).join(request)

        XCTAssertEqual(spy.broughtForward, 1)
        XCTAssertTrue(service.askedConversationIds.isEmpty)
    }

    func test_join_ringingOnThisCall_neverDoubleJoins() async throws {
        let spy = CallSpy()
        spy.pendingCallId = "call-1"
        let service = ActiveCallStub()
        let request = try XCTUnwrap(LiveCallJoinRequest(conversation: conversation(call: call()), currentUserId: "u-me"))

        await LiveCallJoiner(context: spy.context, activeCallService: service).join(request)

        XCTAssertTrue(spy.rejoins.isEmpty)
        XCTAssertTrue(service.askedConversationIds.isEmpty)
    }

    func test_join_serverStillActive_rejoinsTheRowsConversation() async throws {
        let spy = CallSpy()
        let service = ActiveCallStub()
        service.result = .success(ActiveCallSession(
            id: "call-1", conversationId: "conv-1", mode: "p2p", status: "active",
            participants: [
                ActiveCallParticipant(userId: "u-me", user: nil),
                ActiveCallParticipant(userId: "u-alice", user: ActiveCallParticipantUser(id: "u-alice", username: "alice", displayName: "Alice M.")),
            ]
        ))
        let request = try XCTUnwrap(LiveCallJoinRequest(conversation: conversation(call: call()), currentUserId: "u-me"))

        await LiveCallJoiner(context: spy.context, activeCallService: service).join(request)

        XCTAssertEqual(service.askedConversationIds, ["conv-1"])
        XCTAssertEqual(spy.rejoins.count, 1)
        XCTAssertEqual(spy.rejoins.first?.remoteUserId, "u-alice")
        XCTAssertEqual(spy.rejoins.first?.name, "Alice M.")
        XCTAssertEqual(spy.rejoins.first?.isVideo, true)
    }

    func test_join_callEndedMeanwhile_saysSoAndNeverRejoins() async throws {
        let spy = CallSpy()
        let service = ActiveCallStub()
        let request = try XCTUnwrap(LiveCallJoinRequest(conversation: conversation(call: call()), currentUserId: "u-me"))
        FeedbackToastManager.shared.dismiss()

        await LiveCallJoiner(context: spy.context, activeCallService: service).join(request)

        XCTAssertTrue(spy.rejoins.isEmpty)
        XCTAssertEqual(
            FeedbackToastManager.shared.currentToast?.message,
            String(localized: "bubble.call.join.ended", defaultValue: "L'appel est terminé", bundle: .main)
        )
    }
}
