import XCTest
import Combine
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

    /// Creates a CacheCoordinator paired with a ConversationSyncEngine whose
    /// `startSocketRelay()` is already running. This mirrors the production
    /// wiring (post offline-first refactor): cache invalidation/mutation in
    /// response to socket events lives in the SyncEngine, not the Coordinator.
    private func makeSUTWithRelay(db: DatabaseQueue? = nil) async throws -> (
        coordinator: CacheCoordinator,
        engine: ConversationSyncEngine,
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
        let engine = ConversationSyncEngine(
            cache: coordinator,
            conversationService: BareConversationService(),
            messageService: BareMessageService(),
            messageSocket: msgSocket,
            socialSocket: socialSocket,
            api: MockAPIClient()
        )
        await engine.startSocketRelay()
        return (coordinator, engine, msgSocket, socialSocket)
    }

    // MARK: - Store Access

    func test_stores_haveCorrectPolicies() async throws {
        let (sut, _, _) = try makeSUT()

        let convPolicy = await sut.conversations.policy
        XCTAssertEqual(convPolicy.storageLocation, .grdb)
        XCTAssertEqual(convPolicy.ttl, .hours(24))

        let msgPolicy = await sut.messages.policy
        XCTAssertEqual(msgPolicy.storageLocation, .grdb)
        XCTAssertEqual(msgPolicy.maxItemCount, 600)

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
        try await sut.messages.save(
            [TestFactories.makeMessage(id: "m-reset", conversationId: "c-reset", content: "ok")],
            for: "c-reset"
        )
        let reloaded = await sut.messages.load(for: "c-reset")
        XCTAssertEqual(reloaded.value?.count, 1)
    }

    // MARK: - Socket -> Cache: message:new

    func test_messageReceived_appendsToCache() async throws {
        let (sut, engine, msgSocket, _) = try await makeSUTWithRelay()
        withExtendedLifetime(engine) {}

        let existingMsg = TestFactories.makeMessage(id: "m1", conversationId: "conv-1", content: "First")
        try await sut.messages.save([existingMsg], for: "conv-1")

        let apiMsg = TestFactories.makeAPIMessage(id: "m2", conversationId: "conv-1", content: "Second")
        msgSocket.messageReceived.send(apiMsg)

        try await Task.sleep(nanoseconds: 200_000_000)

        let result = await sut.messages.load(for: "conv-1")
        guard let items = result.value else {
            XCTFail("Expected cached messages"); return
        }
        XCTAssertEqual(items.count, 2)
        XCTAssertEqual(items.last?.content, "Second")
    }

    // MARK: - Socket -> Cache: message:deleted

    func test_messageDeleted_softDeletesInCache() async throws {
        let (sut, engine, msgSocket, _) = try await makeSUTWithRelay()
        withExtendedLifetime(engine) {}

        let m1 = TestFactories.makeMessage(id: "m1", conversationId: "conv-1", content: "Keep")
        let m2 = TestFactories.makeMessage(id: "m2", conversationId: "conv-1", content: "Delete")
        try await sut.messages.save([m1, m2], for: "conv-1")

        msgSocket.messageDeleted.send(MessageDeletedEvent(messageId: "m2", conversationId: "conv-1"))

        try await Task.sleep(nanoseconds: 200_000_000)

        let result = await sut.messages.load(for: "conv-1")
        guard let items = result.value else {
            XCTFail("Expected cached messages"); return
        }
        // Post offline-first refactor: delete is a soft-delete (deletedAt set,
        // content cleared). The message stays in the cache so the UI can show
        // "Message deleted" placeholder without a refetch.
        XCTAssertEqual(items.count, 2)
        let deleted = items.first(where: { $0.id == "m2" })
        XCTAssertNotNil(deleted?.deletedAt)
        XCTAssertEqual(deleted?.content, "")
        XCTAssertEqual(items.first(where: { $0.id == "m1" })?.content, "Keep")
    }

    // MARK: - Socket -> Cache: unread update

    func test_unreadUpdated_mutatesConversationCache() async throws {
        let (sut, engine, msgSocket, _) = try await makeSUTWithRelay()
        withExtendedLifetime(engine) {}

        let conv = TestFactories.makeConversation(id: "conv-1", unreadCount: 0)
        try await sut.conversations.save([conv], for: "list")

        msgSocket.unreadUpdated.send(UnreadUpdateEvent(conversationId: "conv-1", unreadCount: 5))

        try await Task.sleep(nanoseconds: 200_000_000)

        let result = await sut.conversations.load(for: "list")
        guard let items = result.value else {
            XCTFail("Expected cached conversations"); return
        }
        XCTAssertEqual(items.first?.userState.unreadCount, 5)
    }

    // MARK: - Socket -> Cache: participant role update

    func test_participantRoleUpdated_invalidatesCache() async throws {
        let (sut, engine, msgSocket, _) = try await makeSUTWithRelay()
        withExtendedLifetime(engine) {}

        let participant = TestFactories.makeParticipant(id: "p1", conversationRole: "MEMBER")
        try await sut.participants.save([participant], for: "conv-1")

        let participantInfo = ParticipantRoleUpdatedParticipantInfo(
            id: "p1", role: "USER", conversationRole: "admin", displayName: "Test", userId: nil
        )
        let event = ParticipantRoleUpdatedEvent(
            conversationId: "conv-1", userId: "u1",
            newRole: "ADMIN", updatedBy: "u2",
            participant: participantInfo
        )
        msgSocket.participantRoleUpdated.send(event)

        try await Task.sleep(nanoseconds: 200_000_000)

        // Post offline-first refactor: role updates invalidate the participants
        // cache (force a refresh from the server) rather than mutating in
        // place — keeps the cache as a single source of truth driven by the
        // gateway, avoiding drift between socket payload and DB state.
        let result = await sut.participants.load(for: "conv-1")
        switch result {
        case .empty: break
        default: XCTFail("Expected empty after invalidation, got \(result)")
        }
    }

    // MARK: - Socket -> Cache: reconnect

    func test_didReconnect_triggersDeltaSync() async throws {
        let (sut, engine, msgSocket, _) = try await makeSUTWithRelay()
        withExtendedLifetime(engine) {}

        let conv = TestFactories.makeConversation(id: "conv-1")
        try await sut.conversations.save([conv], for: "list")

        msgSocket.didReconnect.send(())

        try await Task.sleep(nanoseconds: 200_000_000)

        // Reconnect now drives an incremental delta sync via the SyncEngine
        // rather than a blunt invalidation. The cache stays warm so the UI
        // doesn't flash empty during the catch-up — `syncSinceLastCheckpoint`
        // patches in only the diff. Verify the existing entry survives.
        let result = await sut.conversations.load(for: "list")
        guard let items = result.value else {
            XCTFail("Expected cached conversations to remain after reconnect")
            return
        }
        XCTAssertEqual(items.first?.id, "conv-1")
    }

    // MARK: - Flush + Invalidate

    func test_invalidateAll_clearsAllStores() async throws {
        let (sut, _, _) = try makeSUT()

        let conv = TestFactories.makeConversation(id: "conv-1")
        try await sut.conversations.save([conv], for: "list")

        let msg = TestFactories.makeMessage(id: "m1", conversationId: "conv-1")
        try await sut.messages.save([msg], for: "conv-1")

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
        let (sut, engine, msgSocket, _) = try await makeSUTWithRelay()
        withExtendedLifetime(engine) {}

        let participant = TestFactories.makeParticipant(id: "p1")
        try await sut.participants.save([participant], for: "conv-1")

        msgSocket.conversationJoined.send(ConversationParticipationEvent(conversationId: "conv-1", userId: "u-new"))

        try await Task.sleep(nanoseconds: 200_000_000)

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

    // MARK: - cache-06 — le trio traduction reste chaud sous memory warning

    func test_evictUnderMemoryPressure_keepsTextTranslationsWarm() async throws {
        let db = try makeDB()
        let (sut, _, _) = try makeSUT(db: db)
        let translation = TranslationData(
            id: "tr-warm", messageId: "msg-warm", sourceLanguage: "en",
            targetLanguage: "fr", translatedContent: "Bonjour",
            translationModel: "nllb-200", confidenceScore: 0.95
        )
        await sut.cacheTranslation(TranslationEvent(messageId: "msg-warm", translations: [translation]))

        await sut.evictUnderMemoryPressure()

        let cached = await sut.cachedTranslations(for: "msg-warm")
        XCTAssertNotNil(cached,
                        "le trio texte (cap 500 entrées, quelques centaines de Ko) ne doit pas être sacrifié sous pression — chaque bulle retomberait sur l'original (Prisme) et re-solliciterait NLLB")
        XCTAssertEqual(cached?.first?.translatedContent, "Bonjour")
    }

    // MARK: - cache-02 — la persistance des traductions survit au memory warning

    func test_flushAll_afterMemoryPressureEviction_keepsPersistedTranslationRows() async throws {
        let db = try makeDB()
        let (sut, _, _) = try makeSUT(db: db)
        let translation = TranslationData(
            id: "tr-1", messageId: "msg-1", sourceLanguage: "en",
            targetLanguage: "fr", translatedContent: "Bonjour",
            translationModel: "nllb-200", confidenceScore: 0.95
        )
        await sut.cacheTranslation(TranslationEvent(messageId: "msg-1", translations: [translation]))
        let countBefore = try await db.read { db in try TranslationCacheRecord.fetchCount(db) }
        XCTAssertEqual(countBefore, 1, "precondition: la traduction est persistée incrémentalement")

        await sut.evictUnderMemoryPressure()
        await sut.flushAll()

        let countAfter = try await db.read { db in try TranslationCacheRecord.fetchCount(db) }
        XCTAssertEqual(countAfter, 1,
                       "memory warning puis background ne doit PAS détruire la table des traductions persistées")
    }

    func test_loadTranslationCaches_rowsOlderThanCutoff_deletedFromTable() async throws {
        let db = try makeDB()
        let staleCachedAt = Date().addingTimeInterval(-25 * 3600)
        try await db.write { db in
            try TranslationCacheRecord(
                messageId: "msg-stale", targetLanguage: "fr",
                encodedData: Data("{}".utf8), cachedAt: staleCachedAt
            ).save(db)
        }
        let (sut, _, _) = try makeSUT(db: db)
        await sut.start()
        // La réhydratation (et son GC) court hors du chemin critique du boot
        // depuis 2026-08-22 — on l'attend explicitement : le contrat reste
        // « le GC a lieu au boot », pas « le GC bloque start() ».
        await sut.awaitTranslationCacheHydration()

        let count = try await db.read { db in try TranslationCacheRecord.fetchCount(db) }
        XCTAssertEqual(count, 0,
                       "le GC du boot doit remplacer celui que le full-rewrite assurait accessoirement")
    }

    func test_cacheTranslation_persistsIncrementallyWithoutFullRewrite() async throws {
        let db = try makeDB()
        let (sut, _, _) = try makeSUT(db: db)
        let t1 = TranslationData(id: "tr-1", messageId: "msg-1", sourceLanguage: "en", targetLanguage: "fr", translatedContent: "Bonjour", translationModel: "nllb-200", confidenceScore: 0.95)
        await sut.cacheTranslation(TranslationEvent(messageId: "msg-1", translations: [t1]))
        let t2 = TranslationData(id: "tr-2", messageId: "msg-2", sourceLanguage: "en", targetLanguage: "fr", translatedContent: "Salut", translationModel: "nllb-200", confidenceScore: 0.9)
        await sut.cacheTranslation(TranslationEvent(messageId: "msg-2", translations: [t2]))

        let rows = try await db.read { db in try TranslationCacheRecord.fetchAll(db) }
        XCTAssertEqual(Set(rows.map(\.messageId)), ["msg-1", "msg-2"])
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

// MARK: - Bare service stubs (only methods exercised by socket-relay paths)

private final class BareConversationService: ConversationServiceProviding, @unchecked Sendable {
    func list(offset: Int, limit: Int) async throws -> OffsetPaginatedAPIResponse<[APIConversation]> {
        OffsetPaginatedAPIResponse(success: true, data: [], pagination: nil, error: nil)
    }
    func listPage(before cursor: String?, limit: Int, currentUserId: String) async throws -> ConversationPage {
        ConversationPage(items: [], nextCursor: nil, hasMore: false)
    }
    func search(query: String) async throws -> [APIConversation] { [] }
    func getById(_ conversationId: String) async throws -> APIConversation { throw MeeshyError.network(.timeout) }
    func create(type: String, title: String?, participantIds: [String]) async throws -> CreateConversationResponse { throw MeeshyError.network(.timeout) }
    func delete(conversationId: String) async throws {}
    func markRead(conversationId: String) async throws {}
    func markAsReceived(conversationId: String) async throws {}
    func markUnread(conversationId: String) async throws {}
    func getParticipants(conversationId: String, limit: Int, cursor: String?) async throws -> PaginatedAPIResponse<[APIParticipant]> { throw MeeshyError.network(.timeout) }
    func deleteForMe(conversationId: String) async throws {}
    func listSharedWith(userId: String, limit: Int) async throws -> [APIConversation] { [] }
    func findDirectWith(userId: String) async throws -> APIConversation? { nil }
    func removeParticipant(conversationId: String, key: String) async throws {}
    func updateParticipantRole(conversationId: String, userId: String, role: String) async throws {}
    func update(conversationId: String, title: String?, description: String?, avatar: String?, banner: String?, defaultWriteRole: String?, isAnnouncementChannel: Bool?, slowModeSeconds: Int?, autoTranslateEnabled: Bool?) async throws -> APIConversation { throw MeeshyError.network(.timeout) }
    func leave(conversationId: String) async throws {}
    func banParticipant(conversationId: String, key: String) async throws {}
    func unbanParticipant(conversationId: String, key: String) async throws {}
}

private final class BareMessageService: MessageServiceProviding, @unchecked Sendable {
    func list(conversationId: String, offset: Int, limit: Int, includeReplies: Bool, includeTranslations: Bool, languages: [String]?) async throws -> MessagesAPIResponse {
        MessagesAPIResponse(success: true, data: [], pagination: nil, cursorPagination: nil, hasNewer: nil, meta: nil)
    }
    func listBefore(conversationId: String, before: String, limit: Int, includeReplies: Bool, includeTranslations: Bool, languages: [String]?) async throws -> MessagesAPIResponse {
        MessagesAPIResponse(success: true, data: [], pagination: nil, cursorPagination: nil, hasNewer: nil, meta: nil)
    }
    func listAfter(conversationId: String, after: Date, limit: Int, includeReplies: Bool, includeTranslations: Bool, languages: [String]?) async throws -> MessagesAPIResponse {
        MessagesAPIResponse(success: true, data: [], pagination: nil, cursorPagination: nil, hasNewer: nil, meta: nil)
    }
    func listAround(conversationId: String, around: String, limit: Int, includeReplies: Bool, includeTranslations: Bool, languages: [String]?) async throws -> MessagesAPIResponse { throw MeeshyError.network(.timeout) }
    func send(conversationId: String, request: SendMessageRequest) async throws -> SendMessageResponseData { throw MeeshyError.network(.timeout) }
    func edit(messageId: String, content: String) async throws -> APIMessage { throw MeeshyError.network(.timeout) }
    func delete(conversationId: String, messageId: String) async throws {}
    func pin(conversationId: String, messageId: String) async throws {}
    func unpin(conversationId: String, messageId: String) async throws {}
    func consumeViewOnce(conversationId: String, messageId: String) async throws -> ConsumeViewOnceResponse { throw MeeshyError.network(.timeout) }
    func search(conversationId: String, query: String, limit: Int) async throws -> MessagesAPIResponse { throw MeeshyError.network(.timeout) }
    func searchWithCursor(conversationId: String, query: String, cursor: String) async throws -> MessagesAPIResponse { throw MeeshyError.network(.timeout) }
}
