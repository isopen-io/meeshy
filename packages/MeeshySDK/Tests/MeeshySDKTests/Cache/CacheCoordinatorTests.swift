import XCTest
import GRDB
@testable import MeeshySDK

final class CacheCoordinatorTests: XCTestCase {

    private func makeDB() throws -> DatabaseQueue {
        let dbQueue = try DatabaseQueue(configuration: Configuration())
        try AppDatabase.runMigrations(on: dbQueue)
        return dbQueue
    }

    private func makeSUT(db: DatabaseQueue? = nil) throws -> (
        coordinator: CacheCoordinator,
        messageSocket: MockMessageSocket,
        socialSocket: MockSocialSocket
    ) {
        let database = try db ?? makeDB()
        let msgSocket = MockMessageSocket()
        let socialSocket = MockSocialSocket()
        let coordinator = CacheCoordinator(
            messageSocket: msgSocket,
            socialSocket: socialSocket,
            db: database
        )
        return (coordinator, msgSocket, socialSocket)
    }

    // MARK: - Store Access

    func test_stores_haveCorrectPolicies() async throws {
        let (sut, _, _) = try makeSUT()

        let convPolicy = await sut.conversations.policy
        XCTAssertEqual(convPolicy.storageLocation, .grdb)
        XCTAssertEqual(convPolicy.ttl, .hours(24))

        let msgPolicy = await sut.messages.policy
        XCTAssertEqual(msgPolicy.storageLocation, .grdb)
        XCTAssertEqual(msgPolicy.maxItemCount, 50)

        let partPolicy = await sut.participants.policy
        XCTAssertEqual(partPolicy.storageLocation, .grdb)

        let profilePolicy = await sut.profiles.policy
        XCTAssertEqual(profilePolicy.storageLocation, .grdb)
        XCTAssertEqual(profilePolicy.maxItemCount, 100)
    }

    // MARK: - Reset (logout lifecycle)

    func test_reset_allowsStartToRunAgain() async throws {
        let (sut, _, _) = try makeSUT()

        await sut.start()
        await sut.reset()
        await sut.start()
        // If the idempotency guard in `start()` had not been reset, the
        // second call would have been a silent no-op. We can't introspect
        // `isStarted` directly, but we can verify that `reset()` doesn't
        // crash and that subsequent cache operations still work.
        await sut.messages.save(
            [TestFactories.makeMessage(id: "m-reset", conversationId: "c-reset", content: "ok")],
            for: "c-reset"
        )
        let reloaded = await sut.messages.load(for: "c-reset")
        XCTAssertEqual(reloaded.value?.count, 1)
    }

    // MARK: - Socket -> Cache: message:new

    func test_messageReceived_appendsToCache() async throws {
        let (sut, msgSocket, _) = try makeSUT()

        let existingMsg = TestFactories.makeMessage(id: "m1", conversationId: "conv-1", content: "First")
        await sut.messages.save([existingMsg], for: "conv-1")

        await sut.start()

        let apiMsg = TestFactories.makeAPIMessage(id: "m2", conversationId: "conv-1", content: "Second")
        msgSocket.messageReceived.send(apiMsg)

        try await Task.sleep(nanoseconds: 100_000_000)

        let result = await sut.messages.load(for: "conv-1")
        guard let items = result.value else {
            XCTFail("Expected cached messages"); return
        }
        XCTAssertEqual(items.count, 2)
        XCTAssertEqual(items.last?.content, "Second")
    }

    // MARK: - Socket -> Cache: message:deleted

    func test_messageDeleted_removesFromCache() async throws {
        let (sut, msgSocket, _) = try makeSUT()

        let m1 = TestFactories.makeMessage(id: "m1", conversationId: "conv-1", content: "Keep")
        let m2 = TestFactories.makeMessage(id: "m2", conversationId: "conv-1", content: "Delete")
        await sut.messages.save([m1, m2], for: "conv-1")

        await sut.start()

        msgSocket.messageDeleted.send(MessageDeletedEvent(messageId: "m2", conversationId: "conv-1"))

        try await Task.sleep(nanoseconds: 100_000_000)

        let result = await sut.messages.load(for: "conv-1")
        guard let items = result.value else {
            XCTFail("Expected cached messages"); return
        }
        XCTAssertEqual(items.count, 1)
        XCTAssertEqual(items.first?.id, "m1")
    }

    // MARK: - Socket -> Cache: unread update

    func test_unreadUpdated_mutatesConversationCache() async throws {
        let (sut, msgSocket, _) = try makeSUT()

        let conv = TestFactories.makeConversation(id: "conv-1", unreadCount: 0)
        await sut.conversations.save([conv], for: "list")

        await sut.start()

        msgSocket.unreadUpdated.send(UnreadUpdateEvent(conversationId: "conv-1", unreadCount: 5))

        try await Task.sleep(nanoseconds: 100_000_000)

        let result = await sut.conversations.load(for: "list")
        guard let items = result.value else {
            XCTFail("Expected cached conversations"); return
        }
        XCTAssertEqual(items.first?.unreadCount, 5)
    }

    // MARK: - Socket -> Cache: participant role update

    func test_participantRoleUpdated_mutatesCache() async throws {
        let (sut, msgSocket, _) = try makeSUT()

        let participant = TestFactories.makeParticipant(id: "p1", conversationRole: "MEMBER")
        await sut.participants.save([participant], for: "conv-1")

        await sut.start()

        let participantInfo = ParticipantRoleUpdatedParticipantInfo(
            id: "p1", role: "ADMIN", displayName: "Test", userId: nil
        )
        let event = ParticipantRoleUpdatedEvent(
            conversationId: "conv-1", userId: "u1",
            newRole: "ADMIN", updatedBy: "u2",
            participant: participantInfo
        )
        msgSocket.participantRoleUpdated.send(event)

        try await Task.sleep(nanoseconds: 100_000_000)

        let result = await sut.participants.load(for: "conv-1")
        guard let items = result.value else {
            XCTFail("Expected cached participants"); return
        }
        XCTAssertEqual(items.first?.conversationRole, "ADMIN")
    }

    // MARK: - Socket -> Cache: reconnect

    func test_didReconnect_invalidatesConversations() async throws {
        let (sut, msgSocket, _) = try makeSUT()

        let conv = TestFactories.makeConversation(id: "conv-1")
        await sut.conversations.save([conv], for: "list")

        await sut.start()

        msgSocket.didReconnect.send(())

        try await Task.sleep(nanoseconds: 100_000_000)

        let result = await sut.conversations.load(for: "list")
        switch result {
        case .empty:
            break
        default:
            XCTFail("Expected empty after invalidation, got \(result)")
        }
    }

    // MARK: - Flush + Invalidate

    func test_invalidateAll_clearsAllStores() async throws {
        let (sut, _, _) = try makeSUT()

        let conv = TestFactories.makeConversation(id: "conv-1")
        await sut.conversations.save([conv], for: "list")

        let msg = TestFactories.makeMessage(id: "m1", conversationId: "conv-1")
        await sut.messages.save([msg], for: "conv-1")

        await sut.invalidateAll()

        let convResult = await sut.conversations.load(for: "list")
        let msgResult = await sut.messages.load(for: "conv-1")

        switch convResult {
        case .empty: break
        default: XCTFail("Expected empty conversations")
        }

        switch msgResult {
        case .empty: break
        default: XCTFail("Expected empty messages")
        }
    }

    // MARK: - Conversation joined/left invalidate participants

    func test_conversationJoined_invalidatesParticipants() async throws {
        let (sut, msgSocket, _) = try makeSUT()

        let participant = TestFactories.makeParticipant(id: "p1")
        await sut.participants.save([participant], for: "conv-1")

        await sut.start()

        msgSocket.conversationJoined.send(ConversationParticipationEvent(conversationId: "conv-1", userId: "u-new"))

        try await Task.sleep(nanoseconds: 100_000_000)

        let result = await sut.participants.load(for: "conv-1")
        switch result {
        case .empty: break
        default: XCTFail("Expected empty after invalidation, got \(result)")
        }
    }

    // MARK: - Translation caching (point 41)

    func test_cacheTranslation_roundtrip() async throws {
        let (sut, _, _) = try makeSUT()

        let translation = TranslationData(
            id: "tr-1", messageId: "msg-1", sourceLanguage: "en",
            targetLanguage: "fr", translatedContent: "Bonjour",
            translationModel: "nllb-200", confidenceScore: 0.95
        )
        let event = TranslationEvent(messageId: "msg-1", translations: [translation])

        await sut.cacheTranslation(event)

        let cached = await sut.cachedTranslations(for: "msg-1")
        XCTAssertNotNil(cached)
        XCTAssertEqual(cached?.count, 1)
        XCTAssertEqual(cached?.first?.targetLanguage, "fr")
        XCTAssertEqual(cached?.first?.translatedContent, "Bonjour")
    }

    func test_cacheTranslation_mergesMultipleLanguages() async throws {
        let (sut, _, _) = try makeSUT()

        let frTranslation = TranslationData(
            id: "tr-1", messageId: "msg-1", sourceLanguage: "en",
            targetLanguage: "fr", translatedContent: "Bonjour",
            translationModel: "nllb-200", confidenceScore: 0.95
        )
        await sut.cacheTranslation(TranslationEvent(messageId: "msg-1", translations: [frTranslation]))

        let esTranslation = TranslationData(
            id: "tr-2", messageId: "msg-1", sourceLanguage: "en",
            targetLanguage: "es", translatedContent: "Hola",
            translationModel: "nllb-200", confidenceScore: 0.90
        )
        await sut.cacheTranslation(TranslationEvent(messageId: "msg-1", translations: [esTranslation]))

        let cached = await sut.cachedTranslations(for: "msg-1")
        XCTAssertEqual(cached?.count, 2)
        let languages = cached?.map(\.targetLanguage).sorted()
        XCTAssertEqual(languages, ["es", "fr"])
    }

    func test_cacheTranslation_updatesExistingLanguage() async throws {
        let (sut, _, _) = try makeSUT()

        let original = TranslationData(
            id: "tr-1", messageId: "msg-1", sourceLanguage: "en",
            targetLanguage: "fr", translatedContent: "Bonjour (v1)",
            translationModel: "nllb-200", confidenceScore: 0.80
        )
        await sut.cacheTranslation(TranslationEvent(messageId: "msg-1", translations: [original]))

        let updated = TranslationData(
            id: "tr-1", messageId: "msg-1", sourceLanguage: "en",
            targetLanguage: "fr", translatedContent: "Bonjour (v2)",
            translationModel: "nllb-200", confidenceScore: 0.95
        )
        await sut.cacheTranslation(TranslationEvent(messageId: "msg-1", translations: [updated]))

        let cached = await sut.cachedTranslations(for: "msg-1")
        XCTAssertEqual(cached?.count, 1)
        XCTAssertEqual(cached?.first?.translatedContent, "Bonjour (v2)")
    }

    func test_cacheTranslation_nonExistentMessage_returnsNil() async throws {
        let (sut, _, _) = try makeSUT()
        let cached = await sut.cachedTranslations(for: "nonexistent")
        XCTAssertNil(cached)
    }

    // MARK: - Transcription caching (point 42)

    func test_cacheTranscription_roundtrip() async throws {
        let (sut, _, _) = try makeSUT()

        let transcription = TranscriptionData(
            id: "t-1", text: "Hello world", language: "en",
            confidence: 0.98, durationMs: 5000, segments: nil, speakerCount: 1
        )
        let event = TranscriptionReadyEvent(
            messageId: "msg-1", attachmentId: "att-1",
            conversationId: "conv-1", transcription: transcription,
            processingTimeMs: 200
        )

        await sut.cacheTranscription(event)

        let cached = await sut.cachedTranscription(for: "msg-1")
        XCTAssertNotNil(cached)
        XCTAssertEqual(cached?.messageId, "msg-1")
        XCTAssertEqual(cached?.transcription.text, "Hello world")
        XCTAssertEqual(cached?.transcription.language, "en")
    }

    func test_cacheTranscription_overwritesPrevious() async throws {
        let (sut, _, _) = try makeSUT()

        let first = TranscriptionReadyEvent(
            messageId: "msg-1", attachmentId: "att-1",
            conversationId: "conv-1",
            transcription: TranscriptionData(id: "t-1", text: "First", language: "en", confidence: 0.8, durationMs: 3000, segments: nil, speakerCount: 1),
            processingTimeMs: 100
        )
        await sut.cacheTranscription(first)

        let second = TranscriptionReadyEvent(
            messageId: "msg-1", attachmentId: "att-1",
            conversationId: "conv-1",
            transcription: TranscriptionData(id: "t-2", text: "Updated", language: "en", confidence: 0.95, durationMs: 3000, segments: nil, speakerCount: 1),
            processingTimeMs: 150
        )
        await sut.cacheTranscription(second)

        let cached = await sut.cachedTranscription(for: "msg-1")
        XCTAssertEqual(cached?.transcription.text, "Updated")
    }

    func test_cacheTranscription_nonExistentMessage_returnsNil() async throws {
        let (sut, _, _) = try makeSUT()
        let cached = await sut.cachedTranscription(for: "nonexistent")
        XCTAssertNil(cached)
    }

    // MARK: - Audio translation caching (point 43)

    func test_cacheAudioTranslation_roundtrip() async throws {
        let (sut, _, _) = try makeSUT()

        let audioInfo = TranslatedAudioInfo(
            id: "audio-1", targetLanguage: "fr",
            url: "https://cdn.meeshy.me/audio/1.mp3",
            transcription: "Bonjour le monde",
            durationMs: 3000, format: "mp3",
            cloned: false, quality: 0.9,
            voiceModelId: nil, ttsModel: "chatterbox",
            segments: nil
        )
        let event = AudioTranslationEvent(
            messageId: "msg-1", attachmentId: "att-1",
            conversationId: "conv-1", language: "fr",
            translatedAudio: audioInfo, processingTimeMs: 500
        )

        await sut.cacheAudioTranslation(event)

        let cached = await sut.cachedAudioTranslations(for: "msg-1")
        XCTAssertNotNil(cached)
        XCTAssertEqual(cached?.count, 1)
        XCTAssertEqual(cached?.first?.translatedAudio.targetLanguage, "fr")
        XCTAssertEqual(cached?.first?.translatedAudio.url, "https://cdn.meeshy.me/audio/1.mp3")
    }

    func test_cacheAudioTranslation_mergesMultipleLanguages() async throws {
        let (sut, _, _) = try makeSUT()

        let frAudio = AudioTranslationEvent(
            messageId: "msg-1", attachmentId: "att-1",
            conversationId: "conv-1", language: "fr",
            translatedAudio: TranslatedAudioInfo(
                id: "a-1", targetLanguage: "fr", url: "https://cdn.meeshy.me/fr.mp3",
                transcription: "Bonjour", durationMs: 2000, format: "mp3",
                cloned: false, quality: 0.9, voiceModelId: nil, ttsModel: "chatterbox", segments: nil
            ),
            processingTimeMs: 300
        )
        await sut.cacheAudioTranslation(frAudio)

        let esAudio = AudioTranslationEvent(
            messageId: "msg-1", attachmentId: "att-1",
            conversationId: "conv-1", language: "es",
            translatedAudio: TranslatedAudioInfo(
                id: "a-2", targetLanguage: "es", url: "https://cdn.meeshy.me/es.mp3",
                transcription: "Hola", durationMs: 1500, format: "mp3",
                cloned: false, quality: 0.85, voiceModelId: nil, ttsModel: "chatterbox", segments: nil
            ),
            processingTimeMs: 250
        )
        await sut.cacheAudioTranslation(esAudio)

        let cached = await sut.cachedAudioTranslations(for: "msg-1")
        XCTAssertEqual(cached?.count, 2)
        let languages = cached?.map(\.translatedAudio.targetLanguage).sorted()
        XCTAssertEqual(languages, ["es", "fr"])
    }

    func test_cacheAudioTranslation_updatesExistingLanguage() async throws {
        let (sut, _, _) = try makeSUT()

        let original = AudioTranslationEvent(
            messageId: "msg-1", attachmentId: "att-1",
            conversationId: "conv-1", language: "fr",
            translatedAudio: TranslatedAudioInfo(
                id: "a-1", targetLanguage: "fr", url: "https://cdn.meeshy.me/old.mp3",
                transcription: "Bonjour v1", durationMs: 2000, format: "mp3",
                cloned: false, quality: 0.8, voiceModelId: nil, ttsModel: "chatterbox", segments: nil
            ),
            processingTimeMs: 300
        )
        await sut.cacheAudioTranslation(original)

        let updated = AudioTranslationEvent(
            messageId: "msg-1", attachmentId: "att-1",
            conversationId: "conv-1", language: "fr",
            translatedAudio: TranslatedAudioInfo(
                id: "a-1", targetLanguage: "fr", url: "https://cdn.meeshy.me/new.mp3",
                transcription: "Bonjour v2", durationMs: 2100, format: "mp3",
                cloned: true, quality: 0.95, voiceModelId: "voice-1", ttsModel: "chatterbox", segments: nil
            ),
            processingTimeMs: 400
        )
        await sut.cacheAudioTranslation(updated)

        let cached = await sut.cachedAudioTranslations(for: "msg-1")
        XCTAssertEqual(cached?.count, 1)
        XCTAssertEqual(cached?.first?.translatedAudio.url, "https://cdn.meeshy.me/new.mp3")
        XCTAssertEqual(cached?.first?.translatedAudio.transcription, "Bonjour v2")
    }

    func test_cacheAudioTranslation_nonExistentMessage_returnsNil() async throws {
        let (sut, _, _) = try makeSUT()
        let cached = await sut.cachedAudioTranslations(for: "nonexistent")
        XCTAssertNil(cached)
    }
}
