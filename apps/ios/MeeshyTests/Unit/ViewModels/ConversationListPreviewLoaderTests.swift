import Combine
import XCTest
import MeeshySDK
@testable import Meeshy

/// L'aperçu d'appui long d'une conversation : ce qu'il PUBLIE (chargement,
/// messages, vide), d'où il le lit (cache GRDB d'abord, réseau ensuite) et
/// dans quelle langue il le sert (`ReaderPrism`, jamais le repli « fr »).
@MainActor
final class ConversationListPreviewLoaderTests: XCTestCase {

    private let conversationId = "000000000000000000000c01"
    private let messageId = "000000000000000000000a01"

    // MARK: - Fabriques

    private func makeSUT(
        cache: CacheResult<[Message]> = .empty,
        cachedTranslations: [String: [MessageTranslation]] = [:],
        prism: [String] = ["fr"]
    ) -> (sut: ConversationListPreviewLoader, service: MockMessageService, cache: MockConversationPreviewCache) {
        let service = MockMessageService()
        let cacheMock = MockConversationPreviewCache(messages: cache, translations: cachedTranslations)
        let sut = ConversationListPreviewLoader(messageService: service, cache: cacheMock, readerPrism: { prism })
        return (sut, service, cacheMock)
    }

    private func makeMessage(
        id: String? = nil,
        content: String = "Salut",
        originalLanguage: String = "fr",
        isEncrypted: Bool = false,
        updatedAt: Date = Date(timeIntervalSince1970: 1_000)
    ) -> Message {
        Message(
            id: id ?? messageId,
            conversationId: conversationId,
            senderId: "u-other",
            content: content,
            originalLanguage: originalLanguage,
            isEncrypted: isEncrypted,
            createdAt: Date(timeIntervalSince1970: 1_000),
            updatedAt: updatedAt
        )
    }

    private func makeTranslation(target: String, text: String, messageId: String? = nil) -> MessageTranslation {
        MessageTranslation(
            id: "t-\(target)",
            messageId: messageId ?? self.messageId,
            sourceLanguage: "en",
            targetLanguage: target,
            translatedContent: text,
            translationModel: "nllb",
            confidenceScore: nil
        )
    }

    private func page(
        content: String,
        originalLanguage: String = "fr",
        isEncrypted: Bool = false,
        translations: String = "[]"
    ) -> MessagesAPIResponse {
        JSONStub.decode("""
        {"success":true,"data":[{"id":"\(messageId)","conversationId":"\(conversationId)","senderId":"u-other","content":"\(content)","originalLanguage":"\(originalLanguage)","isEncrypted":\(isEncrypted),"createdAt":"2026-10-18T08:00:00.000Z","updatedAt":"2026-10-18T08:00:00.000Z","translations":\(translations)}],"pagination":null,"cursorPagination":null,"hasNewer":null}
        """)
    }

    private final class PhaseRecorder {
        var phases: [ConversationPreviewPhase?] = []
        var texts: [[String]] = []
    }

    private func record(_ sut: ConversationListPreviewLoader) -> (PhaseRecorder, AnyCancellable) {
        let recorder = PhaseRecorder()
        let id = conversationId
        let token = sut.$states.sink { states in
            recorder.phases.append(states[id]?.phase)
            recorder.texts.append(states[id]?.messages.map(\.content) ?? [])
        }
        return (recorder, token)
    }

    // MARK: - Chargement

    func test_load_coldRow_publishesLoadingThenLoaded() async {
        let (sut, service, _) = makeSUT(cache: .empty)
        service.listResult = .success(page(content: "Salut"))
        let (recorder, token) = record(sut)

        await sut.load(for: conversationId, intent: .open)

        XCTAssertEqual(recorder.phases, [nil, .loading, .loaded], "une ligne froide dit qu'elle charge, jamais « Aucun message »")
        XCTAssertEqual(sut.state(for: conversationId).messages.map(\.content), ["Salut"])
        token.cancel()
    }

    func test_state_unknownConversation_readsAsLoading() {
        let (sut, _, _) = makeSUT()

        XCTAssertEqual(sut.state(for: conversationId).phase, .loading)
    }

    func test_load_networkReturnsNothing_publishesEmpty() async {
        let (sut, _, _) = makeSUT(cache: .empty)

        await sut.load(for: conversationId, intent: .open)

        XCTAssertEqual(sut.state(for: conversationId).phase, .empty)
    }

    func test_load_staleCache_servesStaleThenRefreshes() async {
        let (sut, service, _) = makeSUT(cache: .stale([makeMessage(content: "ancien")], age: 4_000))
        service.listResult = .success(page(content: "nouveau"))
        let (recorder, token) = record(sut)

        await sut.load(for: conversationId, intent: .ensure)

        XCTAssertFalse(recorder.phases.contains(.loading), "un cache non vide ne montre jamais de chargement")
        XCTAssertEqual(recorder.texts.filter { !$0.isEmpty }, [["ancien"], ["nouveau"]])
        XCTAssertEqual(service.listCallCount, 1)
        token.cancel()
    }

    func test_load_freshCache_ensure_staysOffNetwork() async {
        let (sut, service, _) = makeSUT(cache: .fresh([makeMessage(content: "frais")], age: 10))

        await sut.load(for: conversationId, intent: .ensure)

        XCTAssertEqual(service.listCallCount, 0)
        XCTAssertEqual(sut.state(for: conversationId).messages.map(\.content), ["frais"])
    }

    func test_load_withoutRefreshFlag_revalidatesSilently() async {
        let (sut, service, _) = makeSUT(cache: .empty)
        service.listResult = .success(page(content: "avant"))
        await sut.load(for: conversationId, intent: .ensure)
        service.listResult = .success(page(content: "corrigé"))
        let (recorder, token) = record(sut)

        await sut.load(for: conversationId, intent: .open)

        XCTAssertFalse(recorder.phases.contains(.loading), "la revalidation de l'ouverture est silencieuse")
        XCTAssertEqual(sut.state(for: conversationId).messages.map(\.content), ["corrigé"], "un message modifié apparaît à la réouverture")
        XCTAssertEqual(service.listCallCount, 2)
        token.cancel()
    }

    func test_load_ensureTwice_fetchesOnce() async {
        let (sut, service, _) = makeSUT(cache: .empty)
        service.listResult = .success(page(content: "avant"))

        await sut.load(for: conversationId, intent: .ensure)
        await sut.load(for: conversationId, intent: .ensure)

        XCTAssertEqual(service.listCallCount, 1)
    }

    func test_load_networkFailure_keepsWhatWasServed() async {
        let (sut, service, _) = makeSUT(cache: .stale([makeMessage(content: "gardé")], age: 4_000))
        service.listResult = .failure(URLError(.notConnectedToInternet))

        await sut.load(for: conversationId, intent: .open)

        XCTAssertEqual(sut.state(for: conversationId).messages.map(\.content), ["gardé"])
    }

    // MARK: - Préchargement

    func test_prefetch_visibleRows_readsCacheOnly_noNetwork() async {
        let (sut, service, cache) = makeSUT(cache: .stale([makeMessage(content: "en cache")], age: 4_000))

        await sut.load(for: conversationId, intent: .prefetch)

        XCTAssertEqual(service.listCallCount, 0, "le préchargement des rangées visibles ne touche jamais le réseau")
        XCTAssertEqual(cache.messagesCallCount, 1)
        XCTAssertEqual(sut.state(for: conversationId).phase, .loaded, "l'aperçu natif est déjà prêt à sa présentation")
    }

    func test_prefetch_emptyCache_neverClaimsTheConversationIsEmpty() async {
        let (sut, service, _) = makeSUT(cache: .empty)

        await sut.load(for: conversationId, intent: .prefetch)

        XCTAssertEqual(service.listCallCount, 0)
        XCTAssertEqual(sut.state(for: conversationId).phase, .loading)
    }

    // MARK: - Prisme

    func test_prism_rank2_servesTranslation() async {
        let (sut, service, _) = makeSUT(cache: .empty, prism: ["fr", "en"])
        service.listResult = .success(page(
            content: "Hello", originalLanguage: "en",
            translations: #"[{"id":"t-fr","messageId":"\#(messageId)","targetLanguage":"fr","translatedContent":"Bonjour","sourceLanguage":"en"}]"#
        ))

        await sut.load(for: conversationId, intent: .open)

        let snapshot = sut.state(for: conversationId).snapshot
        XCTAssertEqual(snapshot.flatMap { s in s.messages.first.map { s.servedText(for: $0) } }, "Bonjour")
        XCTAssertEqual(snapshot?.servedLanguage(for: messageId), "fr")
    }

    func test_prism_noMatch_servesOriginal() async {
        let (sut, service, _) = makeSUT(cache: .empty, prism: ["de"])
        service.listResult = .success(page(
            content: "Hello", originalLanguage: "en",
            translations: #"[{"id":"t-fr","messageId":"\#(messageId)","targetLanguage":"fr","translatedContent":"Bonjour","sourceLanguage":"en"}]"#
        ))

        await sut.load(for: conversationId, intent: .open)

        let snapshot = sut.state(for: conversationId).snapshot
        XCTAssertEqual(snapshot.flatMap { s in s.messages.first.map { s.servedText(for: $0) } }, "Hello", "jamais translations.first")
        XCTAssertNil(snapshot?.servedTranslation(for: messageId))
    }

    func test_prism_emptyPrism_servesOriginal_withoutFrenchFallback() async {
        let (sut, _, _) = makeSUT(
            cache: .fresh([makeMessage(content: "Hello", originalLanguage: "en")], age: 10),
            cachedTranslations: [messageId: [makeTranslation(target: "fr", text: "Bonjour")]],
            prism: []
        )

        await sut.load(for: conversationId, intent: .prefetch)

        XCTAssertNil(sut.state(for: conversationId).snapshot?.servedTranslation(for: messageId), "aucune préférence ⇒ l'original, pas le repli « fr »")
    }

    func test_prism_cachedTranslations_areServedFromCache() async {
        let (sut, _, _) = makeSUT(
            cache: .fresh([makeMessage(content: "Hello", originalLanguage: "en")], age: 10),
            cachedTranslations: [messageId: [makeTranslation(target: "fr", text: "Bonjour")]],
            prism: ["fr", "en"]
        )

        await sut.load(for: conversationId, intent: .prefetch)

        XCTAssertEqual(sut.state(for: conversationId).snapshot?.servedTranslation(for: messageId)?.translatedContent, "Bonjour")
    }

    // MARK: - Empreinte

    func test_fingerprint_editedMessage_invalidatesRow() {
        let before = ConversationListPreviewLoader.snapshot(
            messages: [makeMessage(content: "avant", updatedAt: Date(timeIntervalSince1970: 1_000))],
            translations: [:], prism: ["fr"]
        )
        let after = ConversationListPreviewLoader.snapshot(
            messages: [makeMessage(content: "après", updatedAt: Date(timeIntervalSince1970: 2_000))],
            translations: [:], prism: ["fr"]
        )

        XCTAssertNotEqual(
            ConversationPreviewFingerprint(state: .loaded(before)),
            ConversationPreviewFingerprint(state: .loaded(after)),
            "même nombre de messages, contenu modifié : la ligne doit se ré-évaluer"
        )
        XCTAssertEqual(
            ConversationPreviewFingerprint(state: .loaded(before)),
            ConversationPreviewFingerprint(state: .loaded(before))
        )
    }

    func test_fingerprint_loadingThenLoaded_differ() {
        let loaded = ConversationListPreviewLoader.snapshot(messages: [makeMessage()], translations: [:], prism: ["fr"])

        XCTAssertNotEqual(ConversationPreviewFingerprint(state: .loading), ConversationPreviewFingerprint(state: .loaded(loaded)))
        XCTAssertNotEqual(ConversationPreviewFingerprint(state: .loading), ConversationPreviewFingerprint(state: .empty))
    }

    // MARK: - E2EE

    func test_encryptedRest_neverExposesCiphertextAsText() async {
        let (sut, service, _) = makeSUT(cache: .empty, prism: ["fr", "en"])
        service.listResult = .success(page(
            content: "Q2lwaGVydGV4dGUtYmFzZTY0", originalLanguage: "en", isEncrypted: true,
            translations: #"[{"id":"t-fr","messageId":"\#(messageId)","targetLanguage":"fr","translatedContent":"WlpaWlo=","sourceLanguage":"en","isEncrypted":true}]"#
        ))

        await sut.load(for: conversationId, intent: .open)

        let snapshot = sut.state(for: conversationId).snapshot
        let message = snapshot?.messages.first
        XCTAssertEqual(message?.isEncrypted, true, "seul le drapeau voyage")
        XCTAssertEqual(message?.content, "", "le cryptogramme ne devient jamais du texte")
        XCTAssertNil(snapshot?.servedTranslation(for: messageId))
        XCTAssertEqual(message.flatMap { snapshot?.servedText(for: $0) }, "")
    }

    func test_encryptedCache_neverExposesCiphertextAsText() async {
        let (sut, _, _) = makeSUT(
            cache: .fresh([makeMessage(content: "Q2lwaGVy", originalLanguage: "en", isEncrypted: true)], age: 10),
            cachedTranslations: [messageId: [makeTranslation(target: "fr", text: "Bonjour")]],
            prism: ["fr"]
        )

        await sut.load(for: conversationId, intent: .prefetch)

        let snapshot = sut.state(for: conversationId).snapshot
        XCTAssertEqual(snapshot?.messages.first?.content, "")
        XCTAssertNil(snapshot?.servedTranslation(for: messageId))
    }
}

/// Cache simulé de l'aperçu : rend ce que le test y a posé et compte ses lectures.
@MainActor
final class MockConversationPreviewCache: ConversationPreviewCacheProviding {
    nonisolated deinit {}

    var messagesResult: CacheResult<[Message]>
    var translationsResult: [String: [MessageTranslation]]
    private(set) var messagesCallCount = 0

    init(messages: CacheResult<[Message]> = .empty, translations: [String: [MessageTranslation]] = [:]) {
        self.messagesResult = messages
        self.translationsResult = translations
    }

    func messages(for conversationId: String) async -> CacheResult<[Message]> {
        messagesCallCount += 1
        return messagesResult
    }

    func translations(for messageIds: [String]) async -> [String: [MessageTranslation]] {
        translationsResult.filter { messageIds.contains($0.key) }
    }
}
