import XCTest
import Combine
import GRDB
@testable import Meeshy
import MeeshySDK

/// Exercises `ConversationViewModel.requestTextTranslation` /
/// `requestAudioTranslation` — the ViewModel-owned replacement for the
/// on-demand translation request that USED to live as `@State` inside
/// `MessageLanguageDetailView`. That state was destroyed every time the
/// language sheet was dismissed and re-presented, so a translation started
/// just before closing the sheet lost its "in progress" signal on reopen
/// (and for audio, lost the result itself). Moving ownership to the VM
/// — which survives the sheet's lifecycle — fixes both: the in-flight sets
/// below are `@Published` on the VM, not `@State` on the view.
@MainActor
final class ConversationViewModelTranslationTests: XCTestCase {

    private var mockAuthManager: MockAuthManager!
    private var mockMessageService: MockMessageService!
    private var mockConversationService: MockConversationService!
    private var mockReactionService: MockReactionService!
    private var mockReportService: MockReportService!
    private var mockMessageSocket: MockMessageSocket!
    private var mockTranslationService: MockTranslationService!
    private var mockAttachmentTranslationService: MockAttachmentTranslationService!
    private var cancellables: Set<AnyCancellable>!
    private let testConversationId = "000000000000000000000055"
    private let testUserId = "000000000000000000000066"
    private let testMessageId = "msg-under-test"

    override func setUp() async throws {
        try await super.setUp()
        mockAuthManager = MockAuthManager()
        mockMessageService = MockMessageService()
        mockConversationService = MockConversationService()
        mockReactionService = MockReactionService()
        mockReportService = MockReportService()
        mockMessageSocket = MockMessageSocket()
        mockTranslationService = MockTranslationService()
        mockAttachmentTranslationService = MockAttachmentTranslationService()
        cancellables = []
        MessageSocketManager.shared.isConnected = true
    }

    override func tearDown() async throws {
        MessageSocketManager.shared.isConnected = false
        mockAuthManager = nil
        mockMessageService = nil
        mockConversationService = nil
        mockReactionService = nil
        mockReportService = nil
        mockMessageSocket = nil
        mockTranslationService = nil
        mockAttachmentTranslationService = nil
        cancellables = nil
        try await super.tearDown()
    }

    private func makeSUT(
        systemLanguage: String = "fr",
        translationSource: (any ConversationTranslationSourcing)? = nil
    ) -> ConversationViewModel {
        let user = MeeshyUser(id: testUserId, username: "test", displayName: "Test", systemLanguage: systemLanguage)
        mockAuthManager.simulateLoggedIn(user: user)
        let pool = try! makeInMemoryDBPool()
        let deps = ConversationDependencies(
            dbPool: pool,
            persistence: MessagePersistenceActor(dbWriter: pool)
        )
        let sut = ConversationViewModel(
            conversationId: testConversationId,
            authManager: mockAuthManager,
            messageService: mockMessageService,
            conversationService: mockConversationService,
            reactionService: mockReactionService,
            reportService: mockReportService,
            messageSocket: mockMessageSocket,
            dependencies: deps,
            translationService: mockTranslationService,
            attachmentTranslationService: mockAttachmentTranslationService,
            translationSource: translationSource
        )
        sut.start()
        return sut
    }

    private func makeInMemoryDBPool() throws -> DatabaseQueue {
        let db = try DatabaseQueue()
        try MessageDatabaseMigrations.runAll(on: db)
        return db
    }

    // MARK: - requestTextTranslation

    func test_requestTextTranslation_success_populatesMessageTranslationsAndClearsInFlight() async {
        let sut = makeSUT()
        mockTranslationService.translateResult = .success(
            JSONStub.decode("""
            {"translated_text":"Bonjour","source_language":"en"}
            """)
        )

        await sut.requestTextTranslation(
            messageId: testMessageId, content: "Hello", sourceLanguage: "en", targetLanguage: "fr"
        )

        XCTAssertEqual(sut.messageTranslations[testMessageId]?.first?.translatedContent, "Bonjour")
        XCTAssertEqual(sut.messageTranslations[testMessageId]?.first?.targetLanguage, "fr")
        XCTAssertFalse(sut.translatingTextLanguages[testMessageId]?.contains("fr") ?? false)
        XCTAssertEqual(mockTranslationService.translateCallCount, 1)
    }

    func test_requestTextTranslation_whileAlreadyInFlight_isNoOp() async {
        let sut = makeSUT()
        mockTranslationService.translateDelayNanoseconds = 200_000_000

        let first = Task { @MainActor in
            await sut.requestTextTranslation(
                messageId: testMessageId, content: "Hello", sourceLanguage: "en", targetLanguage: "fr"
            )
        }
        try? await Task.sleep(nanoseconds: 50_000_000)
        await sut.requestTextTranslation(
            messageId: testMessageId, content: "Hello", sourceLanguage: "en", targetLanguage: "fr"
        )
        _ = await first.value

        XCTAssertEqual(mockTranslationService.translateCallCount, 1, "A second tap while already in flight must not fire a second network call")
    }

    func test_requestTextTranslation_marksInFlightBeforeCompletion() async {
        let sut = makeSUT()
        mockTranslationService.translateDelayNanoseconds = 200_000_000

        let request = Task { @MainActor in
            await sut.requestTextTranslation(
                messageId: testMessageId, content: "Hello", sourceLanguage: "en", targetLanguage: "fr"
            )
        }
        try? await Task.sleep(nanoseconds: 50_000_000)

        XCTAssertTrue(
            sut.translatingTextLanguages[testMessageId]?.contains("fr") ?? false,
            "The in-flight flag must be readable independently of any view — this is what survives a sheet dismiss/reopen"
        )

        _ = await request.value
        XCTAssertFalse(sut.translatingTextLanguages[testMessageId]?.contains("fr") ?? false)
    }

    func test_requestTextTranslation_failure_publishesTranslationRequestFailedAndClearsInFlight() async {
        let sut = makeSUT()
        mockTranslationService.translateResult = .failure(URLError(.notConnectedToInternet))
        var received: [ConversationViewModel.TranslationRequestFailure] = []
        sut.translationRequestFailed
            .sink { received.append($0) }
            .store(in: &cancellables)

        await sut.requestTextTranslation(
            messageId: testMessageId, content: "Hello", sourceLanguage: "en", targetLanguage: "fr"
        )

        XCTAssertEqual(received.count, 1)
        XCTAssertEqual(received.first?.messageId, testMessageId)
        XCTAssertEqual(received.first?.language, "fr")
        XCTAssertEqual(received.first?.kind, .text)
        XCTAssertFalse(sut.translatingTextLanguages[testMessageId]?.contains("fr") ?? false)
        XCTAssertNil(sut.messageTranslations[testMessageId])
    }

    // MARK: - requestAudioTranslation

    func test_requestAudioTranslation_success_populatesMessageTranslatedAudiosAndClearsInFlight() async {
        let sut = makeSUT()
        mockAttachmentTranslationService.translateResult = .success(
            AttachmentTranslateResponse(
                status: "completed",
                jobId: nil,
                translations: [
                    AttachmentTranslationResult(
                        id: "t1", targetLanguage: "fr", translatedText: "Bonjour",
                        audioUrl: "https://cdn/fr.mp3", durationMs: 1200, voiceCloned: false
                    )
                ]
            )
        )

        await sut.requestAudioTranslation(
            messageId: testMessageId, attachmentId: "att-1", sourceLanguage: "en", targetLanguage: "fr"
        )

        XCTAssertEqual(sut.messageTranslatedAudios[testMessageId]?.first?.targetLanguage, "fr")
        XCTAssertEqual(sut.messageTranslatedAudios[testMessageId]?.first?.transcription, "Bonjour")
        XCTAssertFalse(sut.translatingAudioLanguages[testMessageId]?.contains("fr") ?? false)
        XCTAssertEqual(mockAttachmentTranslationService.translateCallCount, 1)
    }

    func test_requestAudioTranslation_whileAlreadyInFlight_isNoOp() async {
        let sut = makeSUT()
        mockAttachmentTranslationService.translateDelayNanoseconds = 200_000_000

        let first = Task { @MainActor in
            await sut.requestAudioTranslation(
                messageId: testMessageId, attachmentId: "att-1", sourceLanguage: "en", targetLanguage: "fr"
            )
        }
        try? await Task.sleep(nanoseconds: 50_000_000)
        await sut.requestAudioTranslation(
            messageId: testMessageId, attachmentId: "att-1", sourceLanguage: "en", targetLanguage: "fr"
        )
        _ = await first.value

        XCTAssertEqual(mockAttachmentTranslationService.translateCallCount, 1)
    }

    func test_requestAudioTranslation_marksInFlightBeforeCompletion() async {
        let sut = makeSUT()
        mockAttachmentTranslationService.translateDelayNanoseconds = 200_000_000

        let request = Task { @MainActor in
            await sut.requestAudioTranslation(
                messageId: testMessageId, attachmentId: "att-1", sourceLanguage: "en", targetLanguage: "fr"
            )
        }
        try? await Task.sleep(nanoseconds: 50_000_000)

        XCTAssertTrue(sut.translatingAudioLanguages[testMessageId]?.contains("fr") ?? false)

        _ = await request.value
        XCTAssertFalse(sut.translatingAudioLanguages[testMessageId]?.contains("fr") ?? false)
    }

    func test_requestAudioTranslation_failure_publishesTranslationRequestFailedAndClearsInFlight() async {
        let sut = makeSUT()
        mockAttachmentTranslationService.translateResult = .failure(
            AttachmentConsentError(code: "consent_required", message: "Consentement requis", requiredConsents: ["voice_clone"])
        )
        var received: [ConversationViewModel.TranslationRequestFailure] = []
        sut.translationRequestFailed
            .sink { received.append($0) }
            .store(in: &cancellables)

        await sut.requestAudioTranslation(
            messageId: testMessageId, attachmentId: "att-1", sourceLanguage: "en", targetLanguage: "fr"
        )

        XCTAssertEqual(received.count, 1)
        XCTAssertEqual(received.first?.messageId, testMessageId)
        XCTAssertEqual(received.first?.language, "fr")
        XCTAssertEqual(received.first?.kind, .audio)
        XCTAssertEqual(received.first?.message, "Consentement requis")
        XCTAssertFalse(sut.translatingAudioLanguages[testMessageId]?.contains("fr") ?? false)
        XCTAssertNil(sut.messageTranslatedAudios[testMessageId])
    }

    // MARK: - hydrateTranslationsFromCache

    func test_cacheHydration_uncoveredIds_fallBackToPersistedTranslations() async {
        let source = MockConversationTranslationSource()
        source.cachedResult = ["covered": [TranslationData(
            id: "c1", messageId: "covered", sourceLanguage: "en", targetLanguage: "fr",
            translatedContent: "Depuis le cache", translationModel: "nllb"
        )]]
        source.persistedResult = ["uncovered": [TranslationRecord(
            id: "p1", messageLocalId: "uncovered", messageServerId: nil,
            targetLanguage: "fr", translatedContent: "Depuis GRDB",
            translationModel: "nllb", confidenceScore: nil, sourceLanguage: nil, receivedAt: Date()
        )]]
        let sut = makeSUT(systemLanguage: "fr", translationSource: source)

        await sut.hydrateTranslationsFromCache(messageIds: ["covered", "uncovered"])

        XCTAssertEqual(sut.messageTranslations["covered"]?.first?.translatedContent, "Depuis le cache")
        XCTAssertEqual(sut.messageTranslations["uncovered"]?.first?.translatedContent, "Depuis GRDB")
        XCTAssertEqual(source.persistedRequests, [["uncovered"]])
    }

    func test_cacheHydration_everyIdCovered_neverReadsPersisted() async {
        let source = MockConversationTranslationSource()
        source.cachedResult = ["m1": [TranslationData(
            id: "c1", messageId: "m1", sourceLanguage: "en", targetLanguage: "fr",
            translatedContent: "Cache", translationModel: "nllb"
        )]]
        let sut = makeSUT(systemLanguage: "fr", translationSource: source)

        await sut.hydrateTranslationsFromCache(messageIds: ["m1"])

        XCTAssertTrue(source.persistedRequests.isEmpty)
    }

    func test_invalidateTranslations_purgesBothIdSpaces() async {
        let source = MockConversationTranslationSource()
        let sut = makeSUT(systemLanguage: "fr", translationSource: source)
        sut.pendingServerIds["temp_1"] = "srv_1"

        sut.invalidateTranslations(for: "temp_1")
        for _ in 0..<100 where source.purged.isEmpty { await Task.yield() }

        XCTAssertEqual(source.purged, [["temp_1", "srv_1"]])
    }
}
