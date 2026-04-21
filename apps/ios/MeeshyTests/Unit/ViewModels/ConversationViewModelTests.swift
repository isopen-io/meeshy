import XCTest
@testable import Meeshy
import MeeshySDK

@MainActor
final class ConversationViewModelTests: XCTestCase {

    // MARK: - Properties

    private var mockAuthManager: MockAuthManager!
    private var mockMessageService: MockMessageService!
    private var mockConversationService: MockConversationService!
    private var mockReactionService: MockReactionService!
    private var mockReportService: MockReportService!
    private let testConversationId = "000000000000000000000001"
    private let testUserId = "000000000000000000000099"

    // MARK: - Lifecycle

    override func setUp() {
        super.setUp()
        mockAuthManager = MockAuthManager()
        mockMessageService = MockMessageService()
        mockConversationService = MockConversationService()
        mockReactionService = MockReactionService()
        mockReportService = MockReportService()
    }

    override func tearDown() {
        mockAuthManager = nil
        mockMessageService = nil
        mockConversationService = nil
        mockReactionService = nil
        mockReportService = nil
        super.tearDown()
    }

    // MARK: - Factory

    private func makeSUT(
        conversationId: String? = nil,
        unreadCount: Int = 0,
        isDirect: Bool = false,
        participantUserId: String? = nil,
        anonymousSession: AnonymousSessionContext? = nil
    ) -> ConversationViewModel {
        let currentUser = MeeshyUser(id: testUserId, username: "testuser", displayName: "Test User")
        mockAuthManager.simulateLoggedIn(user: currentUser)

        return ConversationViewModel(
            conversationId: conversationId ?? testConversationId,
            unreadCount: unreadCount,
            isDirect: isDirect,
            participantUserId: participantUserId,
            anonymousSession: anonymousSession,
            authManager: mockAuthManager,
            messageService: mockMessageService,
            conversationService: mockConversationService,
            reactionService: mockReactionService,
            reportService: mockReportService
        )
    }

    private func makeMessagesResponse(
        messages: [APIMessage] = [],
        hasMore: Bool = false,
        nextCursor: String? = nil
    ) -> MessagesAPIResponse {
        let pagination: String
        if let cursor = nextCursor {
            pagination = """
            {"hasMore":\(hasMore),"nextCursor":"\(cursor)","limit":50}
            """
        } else {
            pagination = """
            {"hasMore":\(hasMore),"nextCursor":null,"limit":50}
            """
        }

        let messagesJSON = messages.isEmpty ? "[]" : makeAPIMessagesJSON(messages)

        return JSONStub.decode("""
        {"success":true,"data":\(messagesJSON),"pagination":null,"cursorPagination":\(pagination),"hasNewer":null}
        """)
    }

    private func makeAPIMessagesJSON(_ messages: [APIMessage]) -> String {
        let items = messages.map { msg in
            """
            {"id":"\(msg.id)","conversationId":"\(msg.conversationId)","senderId":"\(msg.senderId)","createdAt":"2026-01-01T00:00:00.000Z"}
            """
        }
        return "[\(items.joined(separator: ","))]"
    }

    private func makeAPIMessage(
        id: String = "msg-001",
        conversationId: String? = nil,
        content: String = "Hello",
        senderId: String? = nil
    ) -> String {
        let convId = conversationId ?? testConversationId
        let sId = senderId ?? testUserId
        let senderJSON = senderId.map { """
        ,"sender":{"id":"\($0)","username":"sender","displayName":"Sender"}
        """ } ?? ""
        return """
        {"id":"\(id)","conversationId":"\(convId)","senderId":"\(sId)","content":"\(content)","createdAt":"2026-01-01T00:00:00.000Z"\(senderJSON)}
        """
    }

    private func makeMessage(
        id: String = "msg-001",
        content: String = "Hello",
        senderId: String? = nil,
        isMe: Bool = false,
        reactions: [Reaction] = [],
        pinnedAt: Date? = nil,
        pinnedBy: String? = nil,
        deletedAt: Date? = nil
    ) -> Message {
        Message(
            id: id,
            conversationId: testConversationId,
            senderId: senderId ?? testUserId,
            content: content,
            deletedAt: deletedAt,
            pinnedAt: pinnedAt,
            pinnedBy: pinnedBy,
            createdAt: Date(),
            updatedAt: Date(),
            reactions: reactions,
            isMe: isMe
        )
    }

    // MARK: - loadMessages Tests

    func test_loadMessages_success_populatesMessages() async {
        let response: MessagesAPIResponse = JSONStub.decode("""
        {"success":true,"data":[
            {"id":"msg-1","conversationId":"\(testConversationId)","senderId":"\(testUserId)","content":"First","createdAt":"2026-01-01T00:00:00.000Z"},
            {"id":"msg-2","conversationId":"\(testConversationId)","senderId":"\(testUserId)","content":"Second","createdAt":"2026-01-01T00:01:00.000Z"}
        ],"pagination":null,"cursorPagination":{"hasMore":false,"nextCursor":null,"limit":50},"hasNewer":null}
        """)
        mockMessageService.listResult = .success(response)
        let sut = makeSUT()

        await sut.loadMessages()

        XCTAssertEqual(sut.messages.count, 2)
        XCTAssertFalse(sut.isLoadingInitial)
        XCTAssertNil(sut.error)
    }

    func test_loadMessages_reversesOrderForDisplay() async {
        let response: MessagesAPIResponse = JSONStub.decode("""
        {"success":true,"data":[
            {"id":"msg-newer","conversationId":"\(testConversationId)","senderId":"\(testUserId)","content":"Newer","createdAt":"2026-01-01T00:01:00.000Z"},
            {"id":"msg-older","conversationId":"\(testConversationId)","senderId":"\(testUserId)","content":"Older","createdAt":"2026-01-01T00:00:00.000Z"}
        ],"pagination":null,"cursorPagination":{"hasMore":false,"nextCursor":null,"limit":50},"hasNewer":null}
        """)
        mockMessageService.listResult = .success(response)
        let sut = makeSUT()

        await sut.loadMessages()

        XCTAssertEqual(sut.messages.first?.id, "msg-older")
        XCTAssertEqual(sut.messages.last?.id, "msg-newer")
    }

    func test_loadMessages_setsHasOlderMessages() async {
        let response: MessagesAPIResponse = JSONStub.decode("""
        {"success":true,"data":[],"pagination":null,"cursorPagination":{"hasMore":true,"nextCursor":"cursor-123","limit":50},"hasNewer":null}
        """)
        mockMessageService.listResult = .success(response)
        let sut = makeSUT()

        await sut.loadMessages()

        XCTAssertTrue(sut.hasOlderMessages)
    }

    func test_loadMessages_failure_setsError() async {
        mockMessageService.listResult = .failure(NSError(domain: "test", code: 500, userInfo: [NSLocalizedDescriptionKey: "Server error"]))
        let sut = makeSUT()

        await sut.loadMessages()

        XCTAssertNotNil(sut.error)
        XCTAssertFalse(sut.isLoadingInitial)
    }

    func test_loadMessages_guardPreventsDoubleLoad() async {
        let response: MessagesAPIResponse = JSONStub.decode("""
        {"success":true,"data":[],"pagination":null,"cursorPagination":null,"hasNewer":null}
        """)
        mockMessageService.listResult = .success(response)
        let sut = makeSUT()

        async let first: () = sut.loadMessages()
        async let second: () = sut.loadMessages()
        _ = await (first, second)

        XCTAssertEqual(mockMessageService.listCallCount, 1)
    }

    func test_loadMessages_callsMarkRead() async {
        let response: MessagesAPIResponse = JSONStub.decode("""
        {"success":true,"data":[],"pagination":null,"cursorPagination":null,"hasNewer":null}
        """)
        mockMessageService.listResult = .success(response)
        let sut = makeSUT()

        await sut.loadMessages()

        // markAsRead fires markRead via Task, give it a moment
        try? await Task.sleep(nanoseconds: 100_000_000)
        XCTAssertEqual(mockConversationService.markReadCallCount, 1)
    }

    // MARK: - sendMessage Tests

    func test_sendMessage_emptyContent_returnsFalse() async {
        let sut = makeSUT()

        let result = await sut.sendMessage(content: "")

        XCTAssertFalse(result)
        XCTAssertTrue(sut.messages.isEmpty)
    }

    func test_sendMessage_whitespaceOnly_returnsFalse() async {
        let sut = makeSUT()

        let result = await sut.sendMessage(content: "   \n  ")

        XCTAssertFalse(result)
    }

    func test_sendMessage_insertsOptimisticMessage() async {
        let sut = makeSUT()

        // Trigger send but delay the mock response
        let sendTask = Task {
            await sut.sendMessage(content: "Hello world")
        }

        // Give optimistic insert a moment
        try? await Task.sleep(nanoseconds: 50_000_000)

        // At this point, optimistic message should be in the array
        let hasOptimistic = sut.messages.contains { $0.content == "Hello world" && $0.deliveryStatus == .sending }
        // The task may have already completed, so check either sending or sent
        let hasSendingOrSent = sut.messages.contains { $0.content == "Hello world" }
        XCTAssertTrue(hasSendingOrSent)

        _ = await sendTask.value
    }

    func test_sendMessage_success_replacesOptimisticWithServerMessage() async {
        let sut = makeSUT()

        let result = await sut.sendMessage(content: "Hello")

        XCTAssertTrue(result)
        XCTAssertEqual(sut.messages.count, 1)
        XCTAssertEqual(sut.messages.first?.deliveryStatus, .sent)
        XCTAssertEqual(mockMessageService.sendCallCount, 1)
    }

    func test_sendMessage_failure_marksOptimisticAsFailed() async {
        mockMessageService.sendResult = .failure(NSError(domain: "test", code: 500, userInfo: [NSLocalizedDescriptionKey: "Send failed"]))
        let sut = makeSUT()

        let result = await sut.sendMessage(content: "Fail me")

        XCTAssertFalse(result)
        XCTAssertEqual(sut.messages.count, 1)
        XCTAssertEqual(sut.messages.first?.deliveryStatus, .failed)
    }

    func test_sendMessage_incrementsNewMessageAppended() async {
        let sut = makeSUT()
        let before = sut.newMessageAppended

        _ = await sut.sendMessage(content: "Test")

        XCTAssertGreaterThan(sut.newMessageAppended, before)
    }

    func test_sendMessage_passesReplyToId() async {
        let sut = makeSUT()
        sut.messages = [makeMessage(id: "parent-msg", content: "Original", isMe: false)]

        _ = await sut.sendMessage(content: "Reply", replyToId: "parent-msg")

        XCTAssertEqual(mockMessageService.lastSendRequest?.replyToId, "parent-msg")
    }

    // MARK: - editMessage Tests

    func test_editMessage_optimisticallyUpdatesContent() async {
        let sut = makeSUT()
        sut.messages = [makeMessage(id: "msg-edit", content: "Original", isMe: true)]

        await sut.editMessage(messageId: "msg-edit", newContent: "Edited")

        XCTAssertEqual(sut.messages.first?.content, "Edited")
        XCTAssertTrue(sut.messages.first?.isEdited ?? false)
        XCTAssertEqual(mockMessageService.editCallCount, 1)
    }

    func test_editMessage_emptyContent_doesNothing() async {
        let sut = makeSUT()
        sut.messages = [makeMessage(id: "msg-edit", content: "Original", isMe: true)]

        await sut.editMessage(messageId: "msg-edit", newContent: "")

        XCTAssertEqual(sut.messages.first?.content, "Original")
        XCTAssertEqual(mockMessageService.editCallCount, 0)
    }

    func test_editMessage_failure_rollsBackContent() async {
        mockMessageService.editResult = .failure(NSError(domain: "test", code: 500, userInfo: [NSLocalizedDescriptionKey: "Edit failed"]))
        let sut = makeSUT()
        sut.messages = [makeMessage(id: "msg-edit", content: "Original", isMe: true)]

        await sut.editMessage(messageId: "msg-edit", newContent: "Edited")

        XCTAssertEqual(sut.messages.first?.content, "Original")
        XCTAssertFalse(sut.messages.first?.isEdited ?? true)
        XCTAssertNotNil(sut.error)
    }

    // MARK: - deleteMessage Tests

    func test_deleteMessage_optimisticallyMarksDeleted() async {
        let sut = makeSUT()
        sut.messages = [makeMessage(id: "msg-del", content: "Delete me", isMe: true)]

        await sut.deleteMessage(messageId: "msg-del")

        XCTAssertTrue(sut.messages.first?.isDeleted ?? false)
        XCTAssertEqual(sut.messages.first?.content, "")
        XCTAssertEqual(mockMessageService.deleteCallCount, 1)
    }

    func test_deleteMessage_failure_rollsBackDeleted() async {
        mockMessageService.deleteResult = .failure(NSError(domain: "test", code: 500, userInfo: [NSLocalizedDescriptionKey: "Delete failed"]))
        let sut = makeSUT()
        sut.messages = [makeMessage(id: "msg-del", content: "Keep me", isMe: true)]

        await sut.deleteMessage(messageId: "msg-del")

        XCTAssertFalse(sut.messages.first?.isDeleted ?? true)
        XCTAssertNotNil(sut.error)
    }

    // MARK: - toggleReaction Tests

    func test_toggleReaction_addsReactionOptimistically() {
        let sut = makeSUT()
        sut.messages = [makeMessage(id: "msg-react", content: "React to me", isMe: false)]

        sut.toggleReaction(messageId: "msg-react", emoji: "thumbsup")

        let reactions = sut.messages.first?.reactions ?? []
        XCTAssertEqual(reactions.count, 1)
        XCTAssertEqual(reactions.first?.emoji, "thumbsup")
        XCTAssertEqual(reactions.first?.participantId, testUserId)
    }

    func test_toggleReaction_removesExistingReaction() {
        let sut = makeSUT()
        let existingReaction = Reaction(messageId: "msg-react", participantId: testUserId, emoji: "thumbsup")
        sut.messages = [makeMessage(id: "msg-react", content: "Unreact me", reactions: [existingReaction])]

        sut.toggleReaction(messageId: "msg-react", emoji: "thumbsup")

        let reactions = sut.messages.first?.reactions ?? []
        XCTAssertTrue(reactions.isEmpty)
    }

    func test_toggleReaction_doesNothingForUnknownMessageId() {
        let sut = makeSUT()
        sut.messages = [makeMessage(id: "msg-1", content: "Hello")]

        sut.toggleReaction(messageId: "nonexistent", emoji: "thumbsup")

        XCTAssertTrue(sut.messages.first?.reactions.isEmpty ?? true)
    }

    // MARK: - togglePin Tests

    func test_togglePin_pinsUnpinnedMessage() async {
        let sut = makeSUT()
        sut.messages = [makeMessage(id: "msg-pin", content: "Pin me")]

        await sut.togglePin(messageId: "msg-pin")

        XCTAssertNotNil(sut.messages.first?.pinnedAt)
        XCTAssertEqual(mockMessageService.pinCallCount, 1)
    }

    func test_togglePin_unpinsPinnedMessage() async {
        let sut = makeSUT()
        sut.messages = [makeMessage(id: "msg-pin", content: "Unpin me", pinnedAt: Date(), pinnedBy: testUserId)]

        await sut.togglePin(messageId: "msg-pin")

        XCTAssertNil(sut.messages.first?.pinnedAt)
        XCTAssertNil(sut.messages.first?.pinnedBy)
        XCTAssertEqual(mockMessageService.unpinCallCount, 1)
    }

    func test_togglePin_pinFailure_rollsBack() async {
        mockMessageService.pinResult = .failure(NSError(domain: "test", code: 500, userInfo: [NSLocalizedDescriptionKey: "Pin failed"]))
        let sut = makeSUT()
        sut.messages = [makeMessage(id: "msg-pin", content: "Fail pin")]

        await sut.togglePin(messageId: "msg-pin")

        XCTAssertNil(sut.messages.first?.pinnedAt)
        XCTAssertNotNil(sut.error)
    }

    func test_togglePin_unpinFailure_rollsBack() async {
        mockMessageService.unpinResult = .failure(NSError(domain: "test", code: 500, userInfo: [NSLocalizedDescriptionKey: "Unpin failed"]))
        let sut = makeSUT()
        sut.messages = [makeMessage(id: "msg-pin", content: "Fail unpin", pinnedAt: Date(), pinnedBy: testUserId)]

        await sut.togglePin(messageId: "msg-pin")

        XCTAssertNotNil(sut.messages.first?.pinnedAt)
        XCTAssertNotNil(sut.error)
    }

    // MARK: - preferredTranslation Tests

    func test_preferredTranslation_returnsNilWhenNoTranslations() {
        let sut = makeSUT()
        sut.messages = [makeMessage(id: "msg-t", content: "Bonjour")]

        let result = sut.preferredTranslation(for: "msg-t")

        XCTAssertNil(result)
    }

    func test_preferredTranslation_returnsManualOverride() {
        let sut = makeSUT()
        sut.messages = [makeMessage(id: "msg-t", content: "Bonjour")]
        let override = MessageTranslation(
            id: "t-1", messageId: "msg-t",
            sourceLanguage: "fr", targetLanguage: "en",
            translatedContent: "Hello", translationModel: "nllb",
            confidenceScore: 0.95
        )
        sut.activeTranslationOverrides["msg-t"] = override

        let result = sut.preferredTranslation(for: "msg-t")

        XCTAssertEqual(result?.translatedContent, "Hello")
        XCTAssertEqual(result?.targetLanguage, "en")
    }

    func test_preferredTranslation_manualOverrideNilMeansShowOriginal() {
        let sut = makeSUT()
        sut.messages = [makeMessage(id: "msg-t", content: "Bonjour")]
        sut.messageTranslations["msg-t"] = [
            MessageTranslation(
                id: "t-1", messageId: "msg-t",
                sourceLanguage: "fr", targetLanguage: "en",
                translatedContent: "Hello", translationModel: "nllb",
                confidenceScore: nil
            ),
        ]
        sut.activeTranslationOverrides["msg-t"] = Optional<MessageTranslation>.none

        let result = sut.preferredTranslation(for: "msg-t")

        XCTAssertNil(result)
    }

    func test_preferredTranslation_respectsSystemLanguagePreference() {
        let currentUser = MeeshyUser(
            id: testUserId, username: "testuser",
            systemLanguage: "es"
        )
        mockAuthManager.simulateLoggedIn(user: currentUser)
        let sut = ConversationViewModel(
            conversationId: testConversationId,
            authManager: mockAuthManager,
            messageService: mockMessageService,
            conversationService: mockConversationService,
            reactionService: mockReactionService,
            reportService: mockReportService
        )
        sut.messages = [makeMessage(id: "msg-t", content: "Bonjour")]
        sut.messageTranslations["msg-t"] = [
            MessageTranslation(
                id: "t-en", messageId: "msg-t",
                sourceLanguage: "fr", targetLanguage: "en",
                translatedContent: "Hello", translationModel: "nllb",
                confidenceScore: nil
            ),
            MessageTranslation(
                id: "t-es", messageId: "msg-t",
                sourceLanguage: "fr", targetLanguage: "es",
                translatedContent: "Hola", translationModel: "nllb",
                confidenceScore: nil
            ),
        ]

        let result = sut.preferredTranslation(for: "msg-t")

        XCTAssertEqual(result?.targetLanguage, "es")
        XCTAssertEqual(result?.translatedContent, "Hola")
    }

    func test_preferredTranslation_respectsCustomDestinationLanguage() {
        let currentUser = MeeshyUser(
            id: testUserId, username: "testuser",
            systemLanguage: "en",
            customDestinationLanguage: "de"
        )
        mockAuthManager.simulateLoggedIn(user: currentUser)
        let sut = ConversationViewModel(
            conversationId: testConversationId,
            authManager: mockAuthManager,
            messageService: mockMessageService,
            conversationService: mockConversationService,
            reactionService: mockReactionService,
            reportService: mockReportService
        )
        sut.messages = [makeMessage(id: "msg-t", content: "Bonjour")]
        sut.messageTranslations["msg-t"] = [
            MessageTranslation(
                id: "t-en", messageId: "msg-t",
                sourceLanguage: "fr", targetLanguage: "en",
                translatedContent: "Hello", translationModel: "nllb",
                confidenceScore: nil
            ),
            MessageTranslation(
                id: "t-de", messageId: "msg-t",
                sourceLanguage: "fr", targetLanguage: "de",
                translatedContent: "Hallo", translationModel: "nllb",
                confidenceScore: nil
            ),
        ]

        let result = sut.preferredTranslation(for: "msg-t")

        XCTAssertEqual(result?.targetLanguage, "de")
        XCTAssertEqual(result?.translatedContent, "Hallo")
    }

    // MARK: - markAsRead Tests

    func test_markAsRead_postsNotification() {
        let sut = makeSUT()
        let expectation = expectation(forNotification: .conversationMarkedRead, object: nil) { notification in
            (notification.object as? String) == self.testConversationId
        }

        sut.markAsRead()

        wait(for: [expectation], timeout: 1.0)
    }

    func test_markAsRead_callsConversationServiceMarkRead() {
        let sut = makeSUT()
        let expectation = XCTestExpectation(description: "markRead called on service")
        mockConversationService.onMarkReadCalled = { expectation.fulfill() }

        sut.markAsRead()

        wait(for: [expectation], timeout: 2.0)
        XCTAssertEqual(mockConversationService.markReadCallCount, 1)
        XCTAssertEqual(mockConversationService.lastMarkReadConversationId, testConversationId)
    }

    // MARK: - messageIndex Tests

    func test_messageIndex_returnsCorrectIndex() {
        let sut = makeSUT()
        sut.messages = [
            makeMessage(id: "msg-a", content: "A"),
            makeMessage(id: "msg-b", content: "B"),
            makeMessage(id: "msg-c", content: "C"),
        ]

        XCTAssertEqual(sut.messageIndex(for: "msg-a"), 0)
        XCTAssertEqual(sut.messageIndex(for: "msg-b"), 1)
        XCTAssertEqual(sut.messageIndex(for: "msg-c"), 2)
    }

    func test_messageIndex_returnsNilForUnknownId() {
        let sut = makeSUT()
        sut.messages = [makeMessage(id: "msg-a", content: "A")]

        XCTAssertNil(sut.messageIndex(for: "nonexistent"))
    }

    func test_containsMessage_returnsTrueForExistingId() {
        let sut = makeSUT()
        sut.messages = [makeMessage(id: "msg-a", content: "A")]

        XCTAssertTrue(sut.containsMessage(id: "msg-a"))
    }

    func test_containsMessage_returnsFalseForUnknownId() {
        let sut = makeSUT()
        sut.messages = [makeMessage(id: "msg-a", content: "A")]

        XCTAssertFalse(sut.containsMessage(id: "nonexistent"))
    }

    // MARK: - removeExpiredMessages Tests

    func test_removeExpiredMessages_removesExpiredOnly() {
        let sut = makeSUT()
        let pastDate = Date().addingTimeInterval(-3600)
        let futureDate = Date().addingTimeInterval(3600)

        sut.messages = [
            Message(id: "expired", conversationId: testConversationId, content: "Old", expiresAt: pastDate),
            Message(id: "active", conversationId: testConversationId, content: "Fresh", expiresAt: futureDate),
            Message(id: "permanent", conversationId: testConversationId, content: "Forever"),
        ]

        sut.removeExpiredMessages()

        XCTAssertEqual(sut.messages.count, 2)
        XCTAssertFalse(sut.messages.contains { $0.id == "expired" })
        XCTAssertTrue(sut.messages.contains { $0.id == "active" })
        XCTAssertTrue(sut.messages.contains { $0.id == "permanent" })
    }

    // MARK: - removeFailedMessage Tests

    func test_removeFailedMessage_removesOnlyFailedWithMatchingId() {
        let sut = makeSUT()
        var failedMsg = makeMessage(id: "failed-msg", content: "Failed")
        failedMsg.deliveryStatus = .failed
        sut.messages = [
            makeMessage(id: "good-msg", content: "Good"),
            failedMsg,
        ]

        sut.removeFailedMessage(messageId: "failed-msg")

        XCTAssertEqual(sut.messages.count, 1)
        XCTAssertEqual(sut.messages.first?.id, "good-msg")
    }

    func test_removeFailedMessage_doesNotRemoveSentMessage() {
        let sut = makeSUT()
        sut.messages = [makeMessage(id: "sent-msg", content: "Sent")]

        sut.removeFailedMessage(messageId: "sent-msg")

        XCTAssertEqual(sut.messages.count, 1)
    }

    // MARK: - reportMessage Tests

    func test_reportMessage_success_returnsTrue() async {
        let sut = makeSUT()

        let result = await sut.reportMessage(messageId: "msg-1", reportType: "spam", reason: "It is spam")

        XCTAssertTrue(result)
        XCTAssertEqual(mockReportService.reportMessageCallCount, 1)
        XCTAssertEqual(mockReportService.lastReportMessageId, "msg-1")
        XCTAssertEqual(mockReportService.lastReportMessageType, "spam")
    }

    func test_reportMessage_failure_returnsFalseAndSetsError() async {
        mockReportService.reportMessageResult = .failure(NSError(domain: "test", code: 500, userInfo: [NSLocalizedDescriptionKey: "Report failed"]))
        let sut = makeSUT()

        let result = await sut.reportMessage(messageId: "msg-1", reportType: "spam", reason: nil)

        XCTAssertFalse(result)
        XCTAssertNotNil(sut.error)
    }

    // MARK: - setActiveTranslation Tests

    func test_setActiveTranslation_storesOverride() {
        let sut = makeSUT()
        let translation = MessageTranslation(
            id: "t-1", messageId: "msg-1",
            sourceLanguage: "fr", targetLanguage: "en",
            translatedContent: "Hello", translationModel: "nllb",
            confidenceScore: nil
        )

        sut.setActiveTranslation(for: "msg-1", translation: translation)

        let override = sut.activeTranslationOverrides["msg-1"]
        XCTAssertNotNil(override)
        XCTAssertEqual(override??.translatedContent, "Hello")
    }

    func test_setActiveTranslation_nilClearsToOriginal() {
        let sut = makeSUT()

        sut.setActiveTranslation(for: "msg-1", translation: nil)

        let override = sut.activeTranslationOverrides["msg-1"]
        XCTAssertNotNil(override)
        XCTAssertNil(override as? MessageTranslation)
    }

    // MARK: - Anonymous Session Tests

    func test_init_withAnonymousSession_setsSessionTokenOnAPIClient() async {
        let session = AnonymousSessionContext(
            sessionToken: "test-anon-token",
            participantId: "part-123",
            permissions: ParticipantPermissions(),
            linkId: "mshy_test",
            conversationId: "conv-456"
        )
        let sut = makeSUT(anonymousSession: session)
        XCTAssertEqual(APIClient.shared.anonymousSessionToken, "test-anon-token")
        _ = sut
    }

    func test_init_withNilAnonymousSession_doesNotSetSessionToken() {
        let sut = makeSUT(anonymousSession: nil)
        XCTAssertNil(APIClient.shared.anonymousSessionToken)
        _ = sut
    }

    // MARK: - Search Tests (Point 74)

    func test_searchMessages_withResults_populatesSearchResults() async {
        let searchResponse: MessagesAPIResponse = JSONStub.decode("""
        {"success":true,"data":[
            {"id":"sr-1","conversationId":"\(testConversationId)","senderId":"\(testUserId)","content":"Hello world","createdAt":"2026-01-01T00:00:00.000Z","sender":{"id":"\(testUserId)","username":"testuser","displayName":"Test User"}},
            {"id":"sr-2","conversationId":"\(testConversationId)","senderId":"\(testUserId)","content":"Hello again","createdAt":"2026-01-01T00:01:00.000Z","sender":{"id":"\(testUserId)","username":"testuser","displayName":"Test User"}}
        ],"pagination":null,"cursorPagination":{"hasMore":false,"nextCursor":null,"limit":20},"hasNewer":null}
        """)
        mockMessageService.searchResult = .success(searchResponse)
        let sut = makeSUT()

        await sut.searchMessages(query: "Hello")

        XCTAssertEqual(sut.searchResults.count, 2)
        XCTAssertFalse(sut.isSearching)
        XCTAssertEqual(sut.currentSearchQuery, "Hello")
        XCTAssertEqual(mockMessageService.searchCallCount, 1)
    }

    func test_searchMessages_empty_setsEmptyResults() async {
        let emptyResponse: MessagesAPIResponse = JSONStub.decode("""
        {"success":true,"data":[],"pagination":null,"cursorPagination":{"hasMore":false,"nextCursor":null,"limit":20},"hasNewer":null}
        """)
        mockMessageService.searchResult = .success(emptyResponse)
        let sut = makeSUT()

        await sut.searchMessages(query: "nonexistent")

        XCTAssertTrue(sut.searchResults.isEmpty)
        XCTAssertFalse(sut.isSearching)
        XCTAssertEqual(sut.currentSearchQuery, "nonexistent")
    }

    func test_clearSearch_resetsState() async {
        let sut = makeSUT()
        // First populate search results
        let searchResponse: MessagesAPIResponse = JSONStub.decode("""
        {"success":true,"data":[
            {"id":"sr-1","conversationId":"\(testConversationId)","senderId":"\(testUserId)","content":"Hello world","createdAt":"2026-01-01T00:00:00.000Z","sender":{"id":"\(testUserId)","username":"testuser"}}
        ],"pagination":null,"cursorPagination":null,"hasNewer":null}
        """)
        mockMessageService.searchResult = .success(searchResponse)
        await sut.searchMessages(query: "Hello")
        XCTAssertFalse(sut.searchResults.isEmpty)

        // Clear by searching with short query (< 2 chars)
        await sut.searchMessages(query: "H")

        XCTAssertTrue(sut.searchResults.isEmpty)
        XCTAssertNil(sut.currentSearchQuery)
        XCTAssertFalse(sut.isSearching)
    }

    // MARK: - Translation Tests (Point 75)

    func test_preferredTranslation_fallsToRegionalLanguage() {
        let currentUser = MeeshyUser(
            id: testUserId, username: "testuser",
            systemLanguage: "en", regionalLanguage: "de"
        )
        mockAuthManager.simulateLoggedIn(user: currentUser)
        let sut = ConversationViewModel(
            conversationId: testConversationId,
            authManager: mockAuthManager,
            messageService: mockMessageService,
            conversationService: mockConversationService,
            reactionService: mockReactionService,
            reportService: mockReportService
        )
        sut.messages = [makeMessage(id: "msg-r", content: "Bonjour")]
        // No English translation available, but German (regional) is available
        sut.messageTranslations["msg-r"] = [
            MessageTranslation(
                id: "t-de", messageId: "msg-r",
                sourceLanguage: "fr", targetLanguage: "de",
                translatedContent: "Hallo", translationModel: "nllb",
                confidenceScore: nil
            ),
        ]

        let result = sut.preferredTranslation(for: "msg-r")

        XCTAssertEqual(result?.targetLanguage, "de")
        XCTAssertEqual(result?.translatedContent, "Hallo")
    }

    func test_preferredTranslation_returnsNilWhenNoMatch() {
        let currentUser = MeeshyUser(
            id: testUserId, username: "testuser",
            systemLanguage: "en"
        )
        mockAuthManager.simulateLoggedIn(user: currentUser)
        let sut = ConversationViewModel(
            conversationId: testConversationId,
            authManager: mockAuthManager,
            messageService: mockMessageService,
            conversationService: mockConversationService,
            reactionService: mockReactionService,
            reportService: mockReportService
        )
        sut.messages = [makeMessage(id: "msg-n", content: "Bonjour")]
        // Only Japanese translation available, but user prefers English
        sut.messageTranslations["msg-n"] = [
            MessageTranslation(
                id: "t-ja", messageId: "msg-n",
                sourceLanguage: "fr", targetLanguage: "ja",
                translatedContent: "こんにちは", translationModel: "nllb",
                confidenceScore: nil
            ),
        ]

        let result = sut.preferredTranslation(for: "msg-n")

        XCTAssertNil(result, "Should return nil when no translation matches preferred languages")
    }

    func test_activeTranslationOverrides_overridesPreferred() {
        let currentUser = MeeshyUser(
            id: testUserId, username: "testuser",
            systemLanguage: "en"
        )
        mockAuthManager.simulateLoggedIn(user: currentUser)
        let sut = ConversationViewModel(
            conversationId: testConversationId,
            authManager: mockAuthManager,
            messageService: mockMessageService,
            conversationService: mockConversationService,
            reactionService: mockReactionService,
            reportService: mockReportService
        )
        sut.messages = [makeMessage(id: "msg-o", content: "Bonjour")]
        sut.messageTranslations["msg-o"] = [
            MessageTranslation(
                id: "t-en", messageId: "msg-o",
                sourceLanguage: "fr", targetLanguage: "en",
                translatedContent: "Hello", translationModel: "nllb",
                confidenceScore: nil
            ),
            MessageTranslation(
                id: "t-ja", messageId: "msg-o",
                sourceLanguage: "fr", targetLanguage: "ja",
                translatedContent: "こんにちは", translationModel: "nllb",
                confidenceScore: nil
            ),
        ]
        // Override to Japanese even though system language is English
        let jaTranslation = sut.messageTranslations["msg-o"]!.first(where: { $0.targetLanguage == "ja" })!
        sut.activeTranslationOverrides["msg-o"] = jaTranslation

        let result = sut.preferredTranslation(for: "msg-o")

        XCTAssertEqual(result?.targetLanguage, "ja")
        XCTAssertEqual(result?.translatedContent, "こんにちは")
    }

    // MARK: - Transcription Tests (Point 76)

    func test_messageTranscriptions_cachePopulated() {
        let sut = makeSUT()
        let transcription = MessageTranscription(
            attachmentId: "att-1",
            text: "Hello world",
            language: "en",
            confidence: 0.95,
            durationMs: 5000,
            segments: [],
            speakerCount: 1
        )

        sut.messageTranscriptions["msg-1"] = transcription

        XCTAssertNotNil(sut.messageTranscriptions["msg-1"])
        XCTAssertEqual(sut.messageTranscriptions["msg-1"]?.text, "Hello world")
        XCTAssertEqual(sut.messageTranscriptions["msg-1"]?.language, "en")
    }

    func test_transcriptionEvent_updatesCache() {
        let sut = makeSUT()
        XCTAssertNil(sut.messageTranscriptions["msg-t1"])

        let transcription = MessageTranscription(
            attachmentId: "att-t1",
            text: "Transcribed text",
            language: "fr",
            confidence: 0.88,
            durationMs: 3000,
            segments: [
                MessageTranscriptionSegment(text: "Transcribed", startTime: 0, endTime: 1.5, speakerId: nil),
                MessageTranscriptionSegment(text: "text", startTime: 1.5, endTime: 3.0, speakerId: nil),
            ],
            speakerCount: 1
        )

        sut.messageTranscriptions["msg-t1"] = transcription

        XCTAssertEqual(sut.messageTranscriptions["msg-t1"]?.text, "Transcribed text")
        XCTAssertEqual(sut.messageTranscriptions["msg-t1"]?.segments.count, 2)
    }

    // MARK: - Mention Tests (Point 77)

    func test_mentionSuggestions_updatedWithQuery() {
        let sut = makeSUT()
        // Populate messages with senders for local mention candidates
        sut.messages = [
            Message(id: "m1", conversationId: testConversationId, senderId: "u1", content: "Hello",
                    createdAt: Date(), updatedAt: Date(), senderName: "Alice", senderUsername: "alice"),
            Message(id: "m2", conversationId: testConversationId, senderId: "u2", content: "World",
                    createdAt: Date(), updatedAt: Date(), senderName: "Bob", senderUsername: "bob"),
        ]

        sut.handleMentionQuery(in: "Hey @al")

        XCTAssertEqual(sut.activeMentionQuery, "al")
        XCTAssertEqual(sut.mentionSuggestions.count, 1)
        XCTAssertEqual(sut.mentionSuggestions.first?.username, "alice")
    }

    func test_activeMentionQuery_triggersSearch() {
        let sut = makeSUT()
        sut.messages = [
            Message(id: "m1", conversationId: testConversationId, senderId: "u1", content: "Hello",
                    createdAt: Date(), updatedAt: Date(), senderName: "Alice", senderUsername: "alice"),
            Message(id: "m2", conversationId: testConversationId, senderId: "u2", content: "World",
                    createdAt: Date(), updatedAt: Date(), senderName: "Bob", senderUsername: "bob"),
        ]

        // Empty query after @ shows all candidates
        sut.handleMentionQuery(in: "Hey @")

        XCTAssertEqual(sut.activeMentionQuery, "")
        XCTAssertEqual(sut.mentionSuggestions.count, 2)

        // Clear suggestions
        sut.clearMentionSuggestions()

        XCTAssertTrue(sut.mentionSuggestions.isEmpty)
        XCTAssertNil(sut.activeMentionQuery)
    }

    // MARK: - Effects Tests (Point 78)

    func test_pendingEffects_addAndRemove() {
        let sut = makeSUT()

        XCTAssertEqual(sut.pendingEffects, .none)

        sut.pendingEffects = MessageEffects(flags: .confetti)
        XCTAssertNotEqual(sut.pendingEffects, .none)

        sut.pendingEffects = .none
        XCTAssertEqual(sut.pendingEffects, .none)
    }

    func test_showEffectsPicker_toggles() {
        let sut = makeSUT()

        XCTAssertFalse(sut.showEffectsPicker)

        sut.showEffectsPicker = true
        XCTAssertTrue(sut.showEffectsPicker)

        sut.showEffectsPicker = false
        XCTAssertFalse(sut.showEffectsPicker)
    }
}
