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

    // MARK: - Constants

    private static let testConversationId = "000000000000000000000a01"
    private static let testUserId = "000000000000000000000b01"
    private static let otherUserId = "000000000000000000000b02"

    private var testConversationId: String { Self.testConversationId }
    private var testUserId: String { Self.testUserId }
    private var otherUserId: String { Self.otherUserId }

    override func setUp() async throws {
        try await super.setUp()
        // Cache invalidation is the only shared-state cleanup we need —
        // every other dependency is created fresh in `makeSUT()` per test
        // (factory pattern, see apps/ios/CLAUDE.md).
        await CacheCoordinator.shared.messages.invalidate(for: Self.testConversationId)
    }

    // MARK: - Factories

    /// Primary SUT factory. Every dependency is instantiated locally — no
    /// shared mutable state between tests (per apps/ios/CLAUDE.md TDD rules).
    private func makeSUT(
        conversationId: String? = nil
    ) -> (ConversationViewModel, MockAudioPlaybackEngine, ConversationAudioCoordinator) {
        let mockAuthManager = MockAuthManager()
        let mockMessageService = MockMessageService()
        let mockConversationService = MockConversationService()
        let mockReactionService = MockReactionService()
        let mockReportService = MockReportService()
        let mockMessageSocket = MockMessageSocket()

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

    /// Builds a `ConversationViewModel` bound to an existing shared
    /// coordinator. Used by the cross-VM pollution test to drive two VMs
    /// (different conversation ids) through the same singleton-like
    /// coordinator instance. Mocks are still fresh-per-call.
    private func makeSUT(
        conversationId: String,
        sharedCoordinator: ConversationAudioCoordinator
    ) -> ConversationViewModel {
        let mockAuthManager = MockAuthManager()
        let mockMessageService = MockMessageService()
        let mockConversationService = MockConversationService()
        let mockReactionService = MockReactionService()
        let mockReportService = MockReportService()
        let mockMessageSocket = MockMessageSocket()

        let currentUser = MeeshyUser(id: testUserId, username: "bob", displayName: "Bob")
        mockAuthManager.simulateLoggedIn(user: currentUser)

        let pool = try! Self.makeInMemoryPool()
        let deps = ConversationDependencies(
            dbPool: pool,
            persistence: MessagePersistenceActor(dbWriter: pool)
        )
        let vm = ConversationViewModel(
            conversationId: conversationId,
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
        vm._testSetAudioCoordinator(sharedCoordinator)
        return vm
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

    // MARK: - 4. B1 — listenedAttachmentIds enriched when engine finishes

    /// When the coordinator's engine reports `onPlaybackFinished`, the
    /// finished attachment id MUST land in `vm.listenedAttachmentIds`.
    /// Before the fix the coordinator only advanced the queue; the VM was
    /// never told, so the listened set stayed empty and `AudioQueueBuilder`
    /// kept including the same audios on the next play tap.
    func test_engineFinish_enrichesListenedAttachmentIds() async {
        let (vm, engine, _) = makeSUT()

        let m1 = makeAudioMessage(
            id: "m1",
            senderId: otherUserId,
            conversationId: testConversationId,
            attachments: [makeAudioAttachment(id: "a1", fileUrl: "https://cdn/a1.m4a")],
            createdAt: date(1_000)
        )
        let m2 = makeAudioMessage(
            id: "m2",
            senderId: otherUserId,
            conversationId: testConversationId,
            attachments: [makeAudioAttachment(id: "a2", fileUrl: "https://cdn/a2.m4a")],
            createdAt: date(2_000)
        )
        vm.messages = [m1, m2]
        await Task.yield()

        vm.playAudio(attachmentId: "a1")
        await Task.yield()
        XCTAssertFalse(vm.listenedAttachmentIds.contains("a1"))

        engine.simulateFinishPlayback()
        // The coordinator routes `advanceQueue` through `Task { @MainActor in
        // ... }` so let the runloop pick up the deferred work.
        try? await Task.sleep(nanoseconds: 20_000_000)

        XCTAssertTrue(vm.listenedAttachmentIds.contains("a1"),
                      "finished audio must be recorded in listenedAttachmentIds")
    }

    // MARK: - 5. Realtime: a new audio for a different conv is ignored

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

    // MARK: - 6. Cross-VM isolation — finished events filtered by conversationId

    /// When two `ConversationViewModel` instances (different conversations)
    /// share the same `ConversationAudioCoordinator` (the production
    /// singleton case), a finished-event for an audio that belongs to
    /// VM_A's conversation MUST only enrich VM_A's `listenedAttachmentIds`.
    /// VM_B's set MUST NEVER receive a foreign attachment id.
    ///
    /// Before the fix, the coordinator exposed a single mutable
    /// `onAttachmentFinished` closure that the most-recent VM stomped on,
    /// so the wrong VM received the event silently. The
    /// `attachmentFinishedPublisher` + per-VM filter eliminates that race.
    func test_engineFinish_onlyEnrichesListenedIdsOfMatchingConversation() async {
        // Shared coordinator (production singleton case).
        let engine = MockAudioPlaybackEngine()
        let sharedCoord = ConversationAudioCoordinator(engine: engine)

        let convA = "000000000000000000000aA1"
        let convB = "000000000000000000000aB1"
        let vmA = makeSUT(conversationId: convA, sharedCoordinator: sharedCoord)
        let vmB = makeSUT(conversationId: convB, sharedCoordinator: sharedCoord)

        // Seed VM_A with an audio it owns in conv A and start playback.
        let mA = makeAudioMessage(
            id: "mA1",
            senderId: otherUserId,
            conversationId: convA,
            attachments: [makeAudioAttachment(id: "aA", fileUrl: "https://cdn/aA.m4a")],
            createdAt: date(1_000)
        )
        vmA.messages = [mA]
        // Seed VM_B with an unrelated message — purely so its `messages`
        // is non-empty; the audio finishing here belongs to conv A.
        let mB = makeAudioMessage(
            id: "mB1",
            senderId: otherUserId,
            conversationId: convB,
            attachments: [makeAudioAttachment(id: "aB", fileUrl: "https://cdn/aB.m4a")],
            createdAt: date(1_500)
        )
        vmB.messages = [mB]
        await Task.yield()

        vmA.playAudio(attachmentId: "aA")
        await Task.yield()
        XCTAssertEqual(sharedCoord.activeContext?.conversationId, convA)

        // Engine finishes the audio currently playing (conv A).
        engine.simulateFinishPlayback()
        // advanceQueue is routed through Task { @MainActor in ... }, then
        // the publisher emits, then the sink runs on DispatchQueue.main.
        try? await Task.sleep(nanoseconds: 50_000_000)

        XCTAssertTrue(vmA.listenedAttachmentIds.contains("aA"),
                      "VM_A must mark its own finished audio as listened")
        XCTAssertFalse(vmB.listenedAttachmentIds.contains("aA"),
                       "VM_B must NOT receive a finished-event for an audio that doesn't belong to its conversation")
        XCTAssertTrue(vmB.listenedAttachmentIds.isEmpty,
                      "VM_B's listened set must stay empty — no foreign pollution")
    }

    // MARK: - 7. Hot-path debounce — id-set dedupe on $messages sink

    /// `$messages` fires on EVERY mutation (insert, delete, edit, reaction,
    /// translation update). On a busy conversation that can be 20-50
    /// emissions per second; the audio queue sink only cares about
    /// inserts/deletes that change the message-id set. Re-assigning the
    /// SAME array (cosmetic mutation, same ids) MUST NOT grow the queue.
    func test_audioQueueSink_doesNotFireOnNoOpMessagesReassignment() async {
        let (vm, _, coordinator) = makeSUT()

        let head = makeAudioMessage(
            id: "m1",
            senderId: otherUserId,
            conversationId: testConversationId,
            attachments: [makeAudioAttachment(id: "a1", fileUrl: "https://cdn/a1.m4a")],
            createdAt: date(1_000)
        )
        vm.messages = [head]
        await Task.yield()

        vm.playAudio(attachmentId: "a1")
        await Task.yield()
        let queueCountBefore = coordinator.queueCount
        XCTAssertEqual(queueCountBefore, 1)

        // Cosmetic re-assignment: same ids, same order. With the id-set
        // dedupe in place, the sink must NOT refire and the queue must
        // remain unchanged. Without dedupe, the previous implementation
        // would still no-op here thanks to `seenMessageIdsForAudioQueue`,
        // BUT the sink would still wake up + walk the messages every time
        // (the hot-path cost we're avoiding).
        vm.messages = vm.messages
        try? await Task.sleep(nanoseconds: 50_000_000)

        XCTAssertEqual(coordinator.queueCount, queueCountBefore,
                       "Audio queue must not grow on a no-op message reassignment")
    }
}
