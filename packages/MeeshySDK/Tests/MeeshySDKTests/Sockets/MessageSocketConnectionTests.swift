import XCTest
import Combine
@testable import MeeshySDK

/// Point 48: MockMessageSocket connect/disconnect and connection state tests
/// Point 49: TypingEvent edge cases and MockMessageSocket typing publishers
final class MessageSocketConnectionTests: XCTestCase {

    // MARK: - Point 48: Connect / Disconnect

    func test_connect_incrementsCallCount() {
        let mock = MockMessageSocket()
        XCTAssertEqual(mock.connectCallCount, 0)

        mock.connect()
        XCTAssertEqual(mock.connectCallCount, 1)

        mock.connect()
        XCTAssertEqual(mock.connectCallCount, 2)
    }

    func test_connectAnonymous_incrementsCallCount() {
        let mock = MockMessageSocket()
        XCTAssertEqual(mock.connectCallCount, 0)

        mock.connectAnonymous(sessionToken: "test-session-token")
        XCTAssertEqual(mock.connectCallCount, 1)
    }

    func test_disconnect_incrementsCallCount() {
        let mock = MockMessageSocket()
        XCTAssertEqual(mock.disconnectCallCount, 0)

        mock.disconnect()
        XCTAssertEqual(mock.disconnectCallCount, 1)
    }

    func test_initialConnectionState_isDisconnected() {
        let mock = MockMessageSocket()
        XCTAssertFalse(mock.isConnected)
        XCTAssertEqual(mock.connectionState, .disconnected)
    }

    func test_isConnected_canBeSetManually() {
        let mock = MockMessageSocket()
        mock.isConnected = true
        XCTAssertTrue(mock.isConnected)

        mock.isConnected = false
        XCTAssertFalse(mock.isConnected)
    }

    func test_connectionState_canBeSetToAllCases() {
        let mock = MockMessageSocket()

        mock.connectionState = .connecting
        XCTAssertEqual(mock.connectionState, .connecting)

        mock.connectionState = .connected
        XCTAssertEqual(mock.connectionState, .connected)

        mock.connectionState = .reconnecting(attempt: 5)
        XCTAssertEqual(mock.connectionState, .reconnecting(attempt: 5))

        mock.connectionState = .disconnected
        XCTAssertEqual(mock.connectionState, .disconnected)
    }

    func test_joinConversation_tracksIds() {
        let mock = MockMessageSocket()
        mock.joinConversation("conv1")
        mock.joinConversation("conv2")

        XCTAssertEqual(mock.joinedConversations, ["conv1", "conv2"])
    }

    func test_leaveConversation_tracksIds() {
        let mock = MockMessageSocket()
        mock.leaveConversation("conv1")

        XCTAssertEqual(mock.leftConversations, ["conv1"])
    }

    func test_activeConversationId_canBeSetAndRead() {
        let mock = MockMessageSocket()
        XCTAssertNil(mock.activeConversationId)

        mock.activeConversationId = "conv42"
        XCTAssertEqual(mock.activeConversationId, "conv42")

        mock.activeConversationId = nil
        XCTAssertNil(mock.activeConversationId)
    }

    // MARK: - Point 48: Publisher emitting on connect state change

    func test_didReconnect_publisherEmits() {
        let mock = MockMessageSocket()
        let expectation = expectation(description: "didReconnect emits")
        var cancellables = Set<AnyCancellable>()

        mock.didReconnect
            .sink { expectation.fulfill() }
            .store(in: &cancellables)

        mock.didReconnect.send()
        wait(for: [expectation], timeout: 1.0)
    }

    // MARK: - Point 49: TypingEvent edge cases

    func test_typingStarted_publisherReceivesEvent() {
        let mock = MockMessageSocket()
        let expectation = expectation(description: "typingStarted emits")
        var cancellables = Set<AnyCancellable>()
        var received: TypingEvent?

        mock.typingStarted
            .sink { event in
                received = event
                expectation.fulfill()
            }
            .store(in: &cancellables)

        let event = TypingEvent(userId: "u1", username: "alice", conversationId: "c1")
        mock.typingStarted.send(event)

        wait(for: [expectation], timeout: 1.0)
        XCTAssertEqual(received?.userId, "u1")
        XCTAssertEqual(received?.username, "alice")
        XCTAssertEqual(received?.conversationId, "c1")
    }

    func test_typingStopped_publisherReceivesEvent() {
        let mock = MockMessageSocket()
        let expectation = expectation(description: "typingStopped emits")
        var cancellables = Set<AnyCancellable>()
        var received: TypingEvent?

        mock.typingStopped
            .sink { event in
                received = event
                expectation.fulfill()
            }
            .store(in: &cancellables)

        let event = TypingEvent(userId: "u2", username: "bob", conversationId: "c2")
        mock.typingStopped.send(event)

        wait(for: [expectation], timeout: 1.0)
        XCTAssertEqual(received?.userId, "u2")
        XCTAssertEqual(received?.username, "bob")
    }

    func test_typingEventDecoding_withSpecialCharactersInUsername() throws {
        let decoder = JSONDecoder()
        let json = """
        {"userId": "u1", "username": "alice_123-test", "conversationId": "c1"}
        """.data(using: .utf8)!

        let event = try decoder.decode(TypingEvent.self, from: json)
        XCTAssertEqual(event.username, "alice_123-test")
    }

    func test_typingEventDecoding_withEmptyUsername() throws {
        let decoder = JSONDecoder()
        let json = """
        {"userId": "u1", "username": "", "conversationId": "c1"}
        """.data(using: .utf8)!

        let event = try decoder.decode(TypingEvent.self, from: json)
        XCTAssertEqual(event.username, "")
    }

    func test_typingEvent_initSetsAllProperties() {
        let event = TypingEvent(userId: "uid", username: "name", conversationId: "cid")
        XCTAssertEqual(event.userId, "uid")
        XCTAssertEqual(event.username, "name")
        XCTAssertEqual(event.conversationId, "cid")
    }
}
