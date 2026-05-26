import XCTest
import GRDB
@testable import Meeshy
import MeeshySDK

/// Phase 4 — Wires `ConversationViewModel` to the app `ConversationAudioCoordinator`:
///  1. `playAudio(attachmentId:)` resolves the attachment, builds the queue
///     of unlistened tails, and routes through the coordinator.
///  2. Realtime: a new audio message in the same conversation appended via
///     `messages` is forwarded to the coordinator's upcoming queue.
///  3. Cross-conversation isolation: a message arriving for a different
///     conversation never leaks into the queue.
@MainActor
final class ConversationViewModelAudioTests: XCTestCase {

    // MARK: - Fixtures

    private var mockAuthManager: MockAuthManager!
    private var mockMessageService: MockMessageService!
    private var mockConversationService: MockConversationService!
    private var mockReactionService: MockReactionService!
    private var mockReportService: MockReportService!
    private var mockMessageSocket: MockMessageSocket!
    private let testConversationId = "000000000000000000000a01"
    private let testUserId = "000000000000000000000b01"
    private let otherUserId = "000000000000000000000b02"

    override func setUp() async throws {
        try await super.setUp()
        await CacheCoordinator.shared.messages.invalidate(for: testConversationId)
        mockAuthManager = MockAuthManager()
        mockMessageService = MockMessageService()
        mockConversationService = MockConversationService()
        mockReactionService = MockReactionService()
        mockReportService = MockReportService()
        mockMessageSocket = MockMessageSocket()
    }

    override func tearDown() {
        mockAuthManager = nil
        mockMessageService = nil
        mockConversationService = nil
        mockReactionService = nil
        mockReportService = nil
        mockMessageSocket = nil
        super.tearDown()
    }

    // MARK: - Factories

    private func makeSUT(
        conversationId: String? = nil
    ) -> (ConversationViewModel, MockAudioPlaybackEngine, ConversationAudioCoordinator) {
        let currentUser = MeeshyUser(id: testUserId, username: "bob", displayName: "Bob")
        mockAuthManager.simulateLoggedIn(user: currentUser)

        let pool = try! Self.makeInMemoryPool()
        let deps = ConversationDependencies(
            dbPool: pool,
            persistence: MessagePersistenceActor(dbWriter: pool)
        )
        let vm = ConversationViewModel(
            conversationId: conversationId ?? testConversationId,
            unreadCount: 0,
            isDirect: false,
            participantUserId: nil,
            anonymousSession: nil,
            authManager: mockAuthManager,
            messageService: mockMessageService,
            conversationService: mockConversationService,
            reactionService: mockReactionService,
            reportService: mockReportService,
            messageSocket: mockMessageSocket,
            dependencies: deps
        )

        let engine = MockAudioPlaybackEngine()
        let coordinator = ConversationAudioCoordinator(engine: engine)
        vm._testSetAudioCoordinator(coordinator)
        return (vm, engine, coordinator)
    }

    private func makeAudioAttachment(
        id: String,
        durationMs: Int = 3_000,
        fileUrl: String? = nil
    ) -> MeeshyMessageAttachment {
        MeeshyMessageAttachment(
            id: id,
            messageId: nil,
            fileName: "\(id).m4a",
            originalName: "\(id).m4a",
            mimeType: "audio/mp4",
            fileSize: 1_234,
            filePath: "",
            fileUrl: fileUrl ?? "https://cdn.example/\(id).m4a",
            duration: durationMs,
            uploadedBy: "sender"
        )
    }

    private func makeAudioMessage(
        id: String,
        senderId: String,
        conversationId: String,
        attachments: [MeeshyMessageAttachment],
        createdAt: Date,
        senderName: String = "Alice"
    ) -> Message {
        Message(
            id: id,
            conversationId: conversationId,
            senderId: senderId,
            content: "",
            messageType: .audio,
            createdAt: createdAt,
            attachments: attachments,
            senderName: senderName
        )
    }

    private func date(_ ts: TimeInterval) -> Date {
        Date(timeIntervalSince1970: ts)
    }

    private static func makeInMemoryPool() throws -> DatabaseQueue {
        let db = try DatabaseQueue()
        try MessageDatabaseMigrations.runAll(on: db)
        return db
    }

    // MARK: - 1. playAudio routes through the coordinator engine

    func test_playAudio_callsCoordinatorPlay_andStartsEngine() async {
        let (vm, engine, coordinator) = makeSUT()

        let m1 = makeAudioMessage(
            id: "m1",
            senderId: otherUserId,
            conversationId: testConversationId,
            attachments: [makeAudioAttachment(id: "a1", fileUrl: "https://cdn/a1.m4a")],
            createdAt: date(1_000)
        )
        vm.messages = [m1]
        await Task.yield()

        vm.playAudio(attachmentId: "a1")
        await Task.yield()

        XCTAssertEqual(engine.playCallCount, 1)
        XCTAssertEqual(engine.lastPlayedUrl, "https://cdn/a1.m4a")
        XCTAssertEqual(coordinator.activeContext?.attachmentId, "a1")
        XCTAssertEqual(coordinator.queueCount, 1)
    }

    // MARK: - 2. playAudio builds a tail of unlistened audios after the head

    func test_playAudio_buildsQueueWithUnlistenedTail_excludesListenedAndSelf() async {
        let (vm, _, coordinator) = makeSUT()

        let head = makeAudioMessage(
            id: "m1",
            senderId: otherUserId,
            conversationId: testConversationId,
            attachments: [makeAudioAttachment(id: "a1")],
            createdAt: date(1_000)
        )
        let after1 = makeAudioMessage(
            id: "m2",
            senderId: otherUserId,
            conversationId: testConversationId,
            attachments: [makeAudioAttachment(id: "a2")],
            createdAt: date(2_000)
        )
        // Already-listened — must NOT enter the tail.
        let after2Listened = makeAudioMessage(
            id: "m3",
            senderId: otherUserId,
            conversationId: testConversationId,
            attachments: [makeAudioAttachment(id: "a3")],
            createdAt: date(3_000)
        )
        // Self-audio — must NOT enter the tail.
        let after3Self = makeAudioMessage(
            id: "m4",
            senderId: testUserId,
            conversationId: testConversationId,
            attachments: [makeAudioAttachment(id: "aSelf")],
            createdAt: date(4_000)
        )

        vm.messages = [head, after1, after2Listened, after3Self]
        vm.listenedAttachmentIds = ["a3"]
        await Task.yield()

        vm.playAudio(attachmentId: "a1")
        await Task.yield()

        // head + a2 → 2 in queue, a3/aSelf filtered out.
        XCTAssertEqual(coordinator.queueCount, 2)
        XCTAssertEqual(coordinator.activeContext?.attachmentId, "a1")
    }

    // MARK: - 3. Realtime: a new audio for the active conv appends to the queue

    func test_newMessage_audioInActiveConv_appendsToQueue() async {
        let (vm, _, coordinator) = makeSUT()

        // Initial state: head only — coordinator must be active for the same
        // conversation BEFORE the realtime delta arrives.
        let m1 = makeAudioMessage(
            id: "m1",
            senderId: otherUserId,
            conversationId: testConversationId,
            attachments: [makeAudioAttachment(id: "a1")],
            createdAt: date(1_000)
        )
        vm.messages = [m1]
        await Task.yield()

        vm.playAudio(attachmentId: "a1")
        await Task.yield()
        XCTAssertEqual(coordinator.queueCount, 1)

        // Realtime: new audio message lands in `messages`.
        let m2 = makeAudioMessage(
            id: "m2",
            senderId: otherUserId,
            conversationId: testConversationId,
            attachments: [makeAudioAttachment(id: "a2", fileUrl: "https://cdn/a2.m4a")],
            createdAt: date(2_000)
        )
        vm.messages = [m1, m2]
        await Task.yield()

        XCTAssertEqual(coordinator.queueCount, 2)
    }

    // MARK: - 4. Realtime: a new audio for a different conv is ignored

    func test_newMessage_audioInOtherConv_doesNothing() async {
        let (vm, _, coordinator) = makeSUT()

        let m1 = makeAudioMessage(
            id: "m1",
            senderId: otherUserId,
            conversationId: testConversationId,
            attachments: [makeAudioAttachment(id: "a1")],
            createdAt: date(1_000)
        )
        vm.messages = [m1]
        await Task.yield()

        vm.playAudio(attachmentId: "a1")
        await Task.yield()
        XCTAssertEqual(coordinator.queueCount, 1)

        // Realtime: new message arrives but the VM is bound to conv A and
        // the audio belongs to conv B. The VM owns conv A's `messages` so a
        // foreign conv message should NEVER appear in this array — the test
        // models the equivalent guard by checking the conversation id mismatch.
        let m2OtherConv = makeAudioMessage(
            id: "m2",
            senderId: otherUserId,
            conversationId: "000000000000000000000a99",
            attachments: [makeAudioAttachment(id: "aOther", fileUrl: "https://cdn/aOther.m4a")],
            createdAt: date(2_000)
        )
        vm.messages = [m1, m2OtherConv]
        await Task.yield()

        XCTAssertEqual(coordinator.queueCount, 1, "foreign conv message must NOT enter the active queue")
    }
}
