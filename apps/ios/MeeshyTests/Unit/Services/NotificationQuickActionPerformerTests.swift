import XCTest
import MeeshySDK
@testable import Meeshy

/// Les gestes de la rangée « X a rejoint Meeshy » (#8105) passent par les
/// flux existants : la demande d'ami, la conversation directe.
@MainActor
final class NotificationQuickActionPerformerTests: XCTestCase {

    final class Opened {
        var conversations: [Conversation] = []
    }

    private func makeSUT() -> (sut: NotificationQuickActionPerformer, friends: MockFriendService,
                               conversations: MockConversationCreator, opened: Opened) {
        let friends = MockFriendService()
        let conversations = MockConversationCreator()
        let opened = Opened()
        let sut = NotificationQuickActionPerformer(
            friends: friends,
            conversations: conversations,
            currentUserId: { "me" },
            openConversation: { opened.conversations.append($0) }
        )
        return (sut, friends, conversations, opened)
    }

    func test_perform_connect_sendsTheFriendRequestToTheArrivingUser() async {
        let (sut, friends, _, _) = makeSUT()
        friends.sendRequestResult = .success(FriendRequest(id: "fr1", senderId: "me", receiverId: "u9", status: "pending", createdAt: Date()))

        let done = await sut.perform(.connect(userId: "u9"))

        XCTAssertTrue(done)
        XCTAssertEqual(friends.sendRequestCallCount, 1)
        XCTAssertEqual(friends.lastSendRequestReceiverId, "u9")
    }

    func test_perform_connect_failure_reportsItSoTheRowCanUndo() async {
        let (sut, friends, _, _) = makeSUT()
        friends.sendRequestResult = .failure(URLError(.timedOut))

        let done = await sut.perform(.connect(userId: "u9"))

        XCTAssertFalse(done)
    }

    func test_perform_write_opensTheDirectConversation() async {
        let (sut, _, conversations, opened) = makeSUT()

        let done = await sut.perform(.write(userId: "u9"))

        XCTAssertTrue(done)
        XCTAssertEqual(conversations.lastUserId, "u9")
        XCTAssertEqual(conversations.lastCurrentUserId, "me")
        XCTAssertEqual(opened.conversations.map(\.id), ["conv-1"])
    }

    func test_perform_write_failure_opensNothing() async {
        let (sut, _, conversations, opened) = makeSUT()
        conversations.result = .failure(URLError(.notConnectedToInternet))

        let done = await sut.perform(.write(userId: "u9"))

        XCTAssertFalse(done)
        XCTAssertTrue(opened.conversations.isEmpty)
    }
}
