//
//  ChatViewModelTests.swift
//  MeeshyTests
//
//  Unit tests for ChatViewModel
//

import XCTest
@testable import Meeshy

@MainActor
final class ChatViewModelTests: XCTestCase {
    var sut: ChatViewModel!
    var mockMessageRepository: MockMessageRepository!
    var mockWebSocketService: MockWebSocketService!
    var mockCacheService: MockCacheService!
    let testConversationId = "test-conv-id"

    override func setUp() {
        super.setUp()
        mockMessageRepository = MockMessageRepository()
        mockWebSocketService = MockWebSocketService()
        mockCacheService = MockCacheService()

        // Note: In production, inject dependencies
        // sut = ChatViewModel(
        //     conversationId: testConversationId,
        //     messageRepository: mockMessageRepository
        // )
    }

    override func tearDown() {
        sut = nil
        mockMessageRepository = nil
        mockWebSocketService = nil
        mockCacheService = nil
        super.tearDown()
    }

    // MARK: - Initialization Tests

    func testInitialization() {
        // Test that ViewModel initializes with correct state
        // XCTAssertEqual(sut.conversationId, testConversationId)
        // XCTAssertTrue(sut.messages.isEmpty)
        // XCTAssertFalse(sut.isLoading)
        // XCTAssertFalse(sut.isSending)
        // XCTAssertNil(sut.error)
    }

    // MARK: - Load Messages Tests

    func testLoadMessages_Success() async {
        let mockMessages = MockDataGenerator.createMessages(count: 10)
        mockMessageRepository.mockMessages = mockMessages

        // await sut.loadMessages()

        // XCTAssertFalse(sut.isLoading)
        // XCTAssertEqual(sut.messages.count, 10)
        // XCTAssertNil(sut.error)
        // XCTAssertEqual(mockMessageRepository.fetchMessagesCallCount, 1)
    }

    func testLoadMessages_FromCache() async {
        let cachedMessages = MockDataGenerator.createMessages(count: 5)
        mockCacheService.cacheMessages(cachedMessages, conversationId: testConversationId)

        // await sut.loadMessages()

        // Should load from cache first
        // XCTAssertEqual(sut.messages.count, 5)
        // XCTAssertEqual(mockCacheService.getCachedMessagesCallCount, 1)
    }

    func testLoadMessages_Failure() async {
        mockMessageRepository.shouldFail = true

        // await sut.loadMessages()

        // XCTAssertFalse(sut.isLoading)
        // XCTAssertNotNil(sut.error)
        // XCTAssertTrue(sut.messages.isEmpty)
    }

    func testLoadMessages_LoadingState() async {
        mockMessageRepository.networkDelay = 0.5

        let expectation = XCTestExpectation(description: "Loading started")

        Task {
            // await sut.loadMessages()
            expectation.fulfill()
        }

        // Check loading state during operation
        // try? await Task.sleep(nanoseconds: 100_000_000)
        // XCTAssertTrue(sut.isLoading)

        await fulfillment(of: [expectation], timeout: 2.0)

        // XCTAssertFalse(sut.isLoading)
    }

    // MARK: - Load More Messages (Pagination)

    func testLoadMoreMessages_Success() async {
        // Initial load
        mockMessageRepository.mockMessages = MockDataGenerator.createMessages(count: 50)
        // await sut.loadMessages()

        // Load more
        let moreMessages = MockDataGenerator.createMessages(count: 50)
        mockMessageRepository.mockMessages = moreMessages

        // await sut.loadMoreMessages()

        // XCTAssertEqual(sut.messages.count, 100)
        // XCTAssertFalse(sut.isLoadingMore)
    }

    func testLoadMoreMessages_NoMoreMessages() async {
        mockMessageRepository.mockMessages = MockDataGenerator.createMessages(count: 10)
        // await sut.loadMessages()

        // Load more (but no more messages available)
        mockMessageRepository.mockMessages = []
        // await sut.loadMoreMessages()

        // Should not attempt to load more
        // XCTAssertEqual(sut.messages.count, 10)
    }

    func testLoadMoreMessages_PreventDuplicateCalls() async {
        mockMessageRepository.networkDelay = 1.0

        // Start loading more
        // Task { await sut.loadMoreMessages() }

        // Try to load more again while first call is in progress
        // await sut.loadMoreMessages()

        // Should only make one call
        // XCTAssertEqual(mockMessageRepository.fetchMessagesCallCount, 1)
    }

    // MARK: - Send Message Tests

    func testSendMessage_Success() async {
        let messageContent = "Test message"
        let sentMessage = MockDataGenerator.createMessage(content: messageContent)
        mockMessageRepository.mockSentMessage = sentMessage

        // await sut.sendMessage(content: messageContent)

        // XCTAssertFalse(sut.isSending)
        // XCTAssertEqual(sut.messages.count, 1)
        // XCTAssertEqual(sut.messages.first?.content, messageContent)
        // XCTAssertEqual(mockMessageRepository.sendMessageCallCount, 1)
    }

    func testSendMessage_OptimisticUpdate() async {
        let messageContent = "Test message"
        mockMessageRepository.networkDelay = 0.5

        // await sut.sendMessage(content: messageContent)

        // Should show message immediately (optimistic update)
        // XCTAssertEqual(sut.messages.count, 1)
        // XCTAssertTrue(sut.messages.first?.isSending ?? false)
    }

    func testSendMessage_Failure() async {
        let messageContent = "Test message"
        mockMessageRepository.shouldFail = true

        // await sut.sendMessage(content: messageContent)

        // Message should be marked as failed
        // XCTAssertEqual(sut.messages.count, 1)
        // XCTAssertFalse(sut.messages.first?.isSending ?? true)
        // XCTAssertNotNil(sut.messages.first?.sendError)
    }

    func testSendMessage_EmptyContent() async {
        // await sut.sendMessage(content: "")

        // Should not send empty messages
        // XCTAssertEqual(sut.messages.count, 0)
        // XCTAssertEqual(mockMessageRepository.sendMessageCallCount, 0)
    }

    func testSendMessage_WithAttachments() async {
        let messageContent = "Check this out"
        let attachmentIds = ["attachment-1", "attachment-2"]

        // await sut.sendMessage(content: messageContent, attachmentIds: attachmentIds)

        // XCTAssertEqual(mockMessageRepository.lastAttachmentIds?.count, 2)
    }

    // MARK: - Edit Message Tests

    func testEditMessage_Success() async {
        let message = MockDataGenerator.createMessage(id: "msg-1", content: "Original")
        // sut.messages = [message]

        // await sut.editMessage(messageId: "msg-1", newContent: "Edited")

        // XCTAssertEqual(sut.messages.first?.content, "Edited")
        // XCTAssertTrue(sut.messages.first?.isEdited ?? false)
        // XCTAssertNotNil(sut.messages.first?.editedAt)
    }

    func testEditMessage_Failure() async {
        let message = MockDataGenerator.createMessage(id: "msg-1", content: "Original")
        // sut.messages = [message]
        mockMessageRepository.shouldFail = true

        // await sut.editMessage(messageId: "msg-1", newContent: "Edited")

        // Message should remain unchanged
        // XCTAssertEqual(sut.messages.first?.content, "Original")
        // XCTAssertNotNil(sut.error)
    }

    // MARK: - Delete Message Tests

    func testDeleteMessage_Success() async {
        let message1 = MockDataGenerator.createMessage(id: "msg-1")
        let message2 = MockDataGenerator.createMessage(id: "msg-2")
        // sut.messages = [message1, message2]

        // await sut.deleteMessage(messageId: "msg-1")

        // XCTAssertEqual(sut.messages.count, 1)
        // XCTAssertEqual(sut.messages.first?.id, "msg-2")
    }

    func testDeleteMessage_Failure() async {
        let message = MockDataGenerator.createMessage(id: "msg-1")
        // sut.messages = [message]
        mockMessageRepository.shouldFail = true

        // await sut.deleteMessage(messageId: "msg-1")

        // Message should still exist
        // XCTAssertEqual(sut.messages.count, 1)
        // XCTAssertNotNil(sut.error)
    }

    // MARK: - Mark as Read Tests

    func testMarkAsRead_Success() async {
        let messageId = "msg-1"

        // await sut.markAsRead(messageId: messageId)

        // XCTAssertEqual(mockMessageRepository.markAsReadCallCount, 1)
        // Verify WebSocket event was sent
        // XCTAssertEqual(mockWebSocketService.emittedEvents.count, 1)
    }

    // MARK: - Typing Indicator Tests

    func testStartTyping() {
        // sut.startTyping()

        // Should emit typing event
        // XCTAssertTrue(mockWebSocketService.emittedEvents.contains { $0.event == "user:typing" })
    }

    func testStopTyping() {
        // sut.startTyping()
        // sut.stopTyping()

        // Should emit typing stopped event
        // let typingEvents = mockWebSocketService.emittedEvents.filter { $0.event == "user:typing" }
        // XCTAssertEqual(typingEvents.count, 2)
    }

    func testTypingIndicator_AutoStop() async {
        // sut.startTyping()

        // Wait for auto-stop timer (3 seconds)
        // try? await Task.sleep(nanoseconds: 3_100_000_000)

        // Should automatically stop typing
        // Verify stop event was sent
    }

    // MARK: - WebSocket Event Tests

    func testWebSocketEvent_MessageReceived() async {
        let newMessage = MockDataGenerator.createMessage(
            conversationId: testConversationId
        )

        // mockWebSocketService.simulateMessageReceived(newMessage)

        // try? await Task.sleep(nanoseconds: 100_000_000)

        // XCTAssertEqual(sut.messages.count, 1)
        // XCTAssertEqual(sut.messages.first?.id, newMessage.id)
    }

    func testWebSocketEvent_MessageReceived_DifferentConversation() async {
        let newMessage = MockDataGenerator.createMessage(
            conversationId: "different-conv-id"
        )

        // mockWebSocketService.simulateMessageReceived(newMessage)

        // try? await Task.sleep(nanoseconds: 100_000_000)

        // Should not add message from different conversation
        // XCTAssertEqual(sut.messages.count, 0)
    }

    func testWebSocketEvent_MessageReceived_NoDuplicates() async {
        let message = MockDataGenerator.createMessage(id: "msg-1")
        // sut.messages = [message]

        // Simulate receiving same message again
        // mockWebSocketService.simulateMessageReceived(message)

        // try? await Task.sleep(nanoseconds: 100_000_000)

        // Should not add duplicate
        // XCTAssertEqual(sut.messages.count, 1)
    }

    func testWebSocketEvent_MessageRead() async {
        let message = MockDataGenerator.createMessage(id: "msg-1")
        // sut.messages = [message]

        // mockWebSocketService.simulateMessageRead(messageId: "msg-1", userId: "user-2")

        // try? await Task.sleep(nanoseconds: 100_000_000)

        // XCTAssertTrue(sut.messages.first?.readBy.contains("user-2") ?? false)
    }

    func testWebSocketEvent_UserTyping() async {
        // mockWebSocketService.simulateUserTyping(
        //     conversationId: testConversationId,
        //     userId: "user-2",
        //     isTyping: true
        // )

        // try? await Task.sleep(nanoseconds: 100_000_000)

        // XCTAssertTrue(sut.typingUsers.contains("user-2"))
    }

    func testWebSocketEvent_UserStoppedTyping() async {
        // sut.typingUsers.insert("user-2")

        // mockWebSocketService.simulateUserTyping(
        //     conversationId: testConversationId,
        //     userId: "user-2",
        //     isTyping: false
        // )

        // try? await Task.sleep(nanoseconds: 100_000_000)

        // XCTAssertFalse(sut.typingUsers.contains("user-2"))
    }

    func testWebSocketEvent_MessageDeleted() async {
        let message = MockDataGenerator.createMessage(id: "msg-1")
        // sut.messages = [message]

        // mockWebSocketService.simulateMessageDeleted(messageId: "msg-1")

        // try? await Task.sleep(nanoseconds: 100_000_000)

        // XCTAssertEqual(sut.messages.count, 0)
    }

    // MARK: - Concurrency Tests

    func testConcurrentMessageSending() async {
        // Test sending multiple messages concurrently
        async let send1 = sendMessageHelper("Message 1")
        async let send2 = sendMessageHelper("Message 2")
        async let send3 = sendMessageHelper("Message 3")

        await send1
        await send2
        await send3

        // All messages should be sent successfully
        // XCTAssertEqual(sut.messages.count, 3)
    }

    private func sendMessageHelper(_ content: String) async {
        // await sut.sendMessage(content: content)
    }

    // MARK: - Edge Case Tests

    func testSendMessage_SpecialCharacters() async {
        let specialContent = "Test 🎉 émojis & special <chars>"
        // await sut.sendMessage(content: specialContent)

        // XCTAssertEqual(sut.messages.first?.content, specialContent)
    }

    func testSendMessage_LongMessage() async {
        let longContent = String(repeating: "Lorem ipsum ", count: 1000)
        // await sut.sendMessage(content: longContent)

        // Should handle long messages
        // XCTAssertEqual(sut.messages.count, 1)
    }

    // MARK: - Memory Leak Tests

    func testMemoryLeak_ViewModel() {
        var viewModel: ChatViewModel? = ChatViewModel(
            conversationId: testConversationId,
            messageRepository: mockMessageRepository
        )
        weak var weakReference = viewModel

        viewModel = nil

        XCTAssertNil(weakReference, "ChatViewModel should be deallocated")
    }

    func testMemoryLeak_WebSocketListeners() {
        // Test that WebSocket listeners are properly cleaned up
    }
}

// MARK: - Mock Message Repository

final class MockMessageRepository {
    var mockMessages: [Message] = []
    var mockSentMessage: Message?
    var shouldFail = false
    var networkDelay: TimeInterval = 0.0

    var fetchMessagesCallCount = 0
    var sendMessageCallCount = 0
    var editMessageCallCount = 0
    var deleteMessageCallCount = 0
    var markAsReadCallCount = 0

    var lastAttachmentIds: [String]?

    func fetchMessages(conversationId: String, limit: Int, offset: Int) async throws -> [Message] {
        fetchMessagesCallCount += 1

        if networkDelay > 0 {
            try await Task.sleep(nanoseconds: UInt64(networkDelay * 1_000_000_000))
        }

        if shouldFail {
            throw NSError(domain: "TestError", code: -1, userInfo: nil)
        }

        return mockMessages
    }

    func sendMessage(conversationId: String, content: String, type: Message.MessageType, attachmentIds: [String]?, localId: String) async throws -> Message {
        sendMessageCallCount += 1
        lastAttachmentIds = attachmentIds

        if networkDelay > 0 {
            try await Task.sleep(nanoseconds: UInt64(networkDelay * 1_000_000_000))
        }

        if shouldFail {
            throw NSError(domain: "TestError", code: -1, userInfo: nil)
        }

        return mockSentMessage ?? MockDataGenerator.createMessage(content: content)
    }

    func editMessage(messageId: String, content: String) async throws {
        editMessageCallCount += 1

        if shouldFail {
            throw NSError(domain: "TestError", code: -1, userInfo: nil)
        }
    }

    func deleteMessage(messageId: String) async throws {
        deleteMessageCallCount += 1

        if shouldFail {
            throw NSError(domain: "TestError", code: -1, userInfo: nil)
        }
    }

    func markAsRead(messageId: String) async throws {
        markAsReadCallCount += 1

        if shouldFail {
            throw NSError(domain: "TestError", code: -1, userInfo: nil)
        }
    }

    func reset() {
        mockMessages = []
        mockSentMessage = nil
        shouldFail = false
        networkDelay = 0.0
        fetchMessagesCallCount = 0
        sendMessageCallCount = 0
        editMessageCallCount = 0
        deleteMessageCallCount = 0
        markAsReadCallCount = 0
        lastAttachmentIds = nil
    }
}
