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
        let sut = ConversationListPreviewLoader(
            messageService: service, cache: cacheMock, readerPrism: { prism },
            regimeMemory: EndToEndRegimeMemory(defaults: nil)
        )
        return (sut, service, cacheMock)
    }

    /// Le cryptogramme tel que le REST le rend : du base64 d'une enveloppe.
    private let ciphertext = "eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eA=="

    private func makeMessage(
        id: String? = nil,
        content: String = "Salut",
        originalLanguage: String = "fr",
        isEncrypted: Bool = false,
        decryptedOnDevice: Bool = false,
        updatedAt: Date = Date(timeIntervalSince1970: 1_000)
    ) -> Message {
        var message = Message(
            id: id ?? messageId,
            conversationId: conversationId,
            senderId: "u-other",
            content: decryptedOnDevice ? ciphertext : content,
            originalLanguage: originalLanguage,
            isEncrypted: isEncrypted,
            createdAt: Date(timeIntervalSince1970: 1_000),
            updatedAt: updatedAt
        )
        if decryptedOnDevice { message.adoptDecryptedContent(content) }
        return message
    }

    /// Le cache tel que le relit un démarrage à froid : le message traverse
    /// l'encodage du magasin GRDB, sa provenance avec lui.
    private func persisted(_ message: Message) throws -> Message {
        try JSONDecoder().decode(Message.self, from: JSONEncoder().encode(message))
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
        translations: String = "[]",
        updatedAt: String = "2026-10-18T08:00:00.000Z",
        editedAt: String? = nil,
        deletedAt: String? = nil
    ) -> MessagesAPIResponse {
        let edited = editedAt.map { #","editedAt":"\#($0)""# } ?? ""
        let deleted = deletedAt.map { #","deletedAt":"\#($0)""# } ?? ""
        return JSONStub.decode("""
        {"success":true,"data":[{"id":"\(messageId)","conversationId":"\(conversationId)","senderId":"u-other","content":"\(content)","originalLanguage":"\(originalLanguage)","isEncrypted":\(isEncrypted),"createdAt":"2026-10-18T08:00:00.000Z","updatedAt":"\(updatedAt)"\(edited)\(deleted),"translations":\(translations)}],"pagination":null,"cursorPagination":null,"hasNewer":null}
        """)
    }

    /// `2026-10-18T08:00:00.000Z`, l'`updatedAt` que `page` sert par défaut :
    /// un cache à cette date décrit la MÊME version que le REST.
    private let restVersion = Date(timeIntervalSince1970: 1_792_310_400)

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

    func test_load_reopen_revalidatesSilently() async {
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

    /// Le chargeur n'écrit pas dans le cache GRDB : à la réouverture, le cache
    /// a une version PLUS ANCIENNE que ce que le réseau a servi. Il ne doit
    /// jamais repasser devant — ni le temps que le réseau réponde, ni hors ligne.
    func test_load_reopen_neverRewindsTheNetworkVersionToTheCache() async {
        let (sut, service, _) = makeSUT(cache: .stale([makeMessage(content: "avant")], age: 4_000))
        service.listResult = .success(page(content: "corrigé"))
        await sut.load(for: conversationId, intent: .open)
        XCTAssertEqual(sut.state(for: conversationId).messages.map(\.content), ["corrigé"], "précondition")
        let (recorder, token) = record(sut)

        await sut.load(for: conversationId, intent: .open)
        service.listResult = .failure(URLError(.notConnectedToInternet))
        await sut.load(for: conversationId, intent: .open)

        XCTAssertFalse(recorder.texts.contains(["avant"]), "le cache ne repasse jamais devant le réseau : aucun scintillement")
        XCTAssertEqual(sut.state(for: conversationId).messages.map(\.content), ["corrigé"], "hors ligne, ce qui a été servi reste")
        XCTAssertEqual(service.listCallCount, 3)
        token.cancel()
    }

    func test_load_coldRow_networkFailure_neverClaimsEmpty() async {
        let (sut, service, _) = makeSUT(cache: .empty)
        service.listResult = .failure(URLError(.notConnectedToInternet))
        let (recorder, token) = record(sut)

        await sut.load(for: conversationId, intent: .open)

        XCTAssertFalse(recorder.phases.contains(.empty), "un échec réseau ne prouve pas qu'une conversation est vide")
        XCTAssertEqual(sut.state(for: conversationId).phase, .unavailable)
        token.cancel()
    }

    func test_load_unavailable_reopenOnline_loads() async {
        let (sut, service, _) = makeSUT(cache: .empty)
        service.listResult = .failure(URLError(.notConnectedToInternet))
        await sut.load(for: conversationId, intent: .open)
        service.listResult = .success(page(content: "Salut"))

        await sut.load(for: conversationId, intent: .open)

        XCTAssertEqual(sut.state(for: conversationId).messages.map(\.content), ["Salut"])
    }

    func test_load_ensure_afterStalePrefetch_revalidates() async {
        let (sut, service, _) = makeSUT(cache: .stale([makeMessage(content: "ancien")], age: 4_000))
        service.listResult = .success(page(content: "nouveau"))
        await sut.load(for: conversationId, intent: .prefetch)

        await sut.load(for: conversationId, intent: .ensure)

        XCTAssertEqual(service.listCallCount, 1, "un cache périmé servi par le préchargement se revalide encore")
        XCTAssertEqual(sut.state(for: conversationId).messages.map(\.content), ["nouveau"])
    }

    func test_load_ensure_afterFreshPrefetch_staysOffNetwork() async {
        let (sut, service, _) = makeSUT(cache: .fresh([makeMessage(content: "frais")], age: 10))
        await sut.load(for: conversationId, intent: .prefetch)

        await sut.load(for: conversationId, intent: .ensure)

        XCTAssertEqual(service.listCallCount, 0)
    }

    /// Une ouverture qui trouve un préchargement en vol l'attend, PUIS revalide
    /// — une fois, et sans tourner sur le registre une fois le préchargement fini.
    func test_load_openDuringPrefetch_waitsThenRevalidatesOnce() async {
        let service = MockMessageService()
        service.listResult = .success(page(content: "réseau"))
        let cache = MockConversationPreviewCache(messages: .stale([makeMessage(content: "en cache")], age: 4_000))
        cache.holdsNextRead = true
        let sut = ConversationListPreviewLoader(messageService: service, cache: cache, readerPrism: { ["fr"] })
        let id = conversationId

        let prefetch = Task { await sut.load(for: id, intent: .prefetch) }
        await cache.waitUntilHeld()
        let open = Task { await sut.load(for: id, intent: .open) }
        await Task.yield()
        XCTAssertEqual(service.listCallCount, 0, "l'ouverture attend le préchargement en vol")

        cache.release()
        await prefetch.value
        await open.value

        XCTAssertEqual(service.listCallCount, 1)
        XCTAssertEqual(cache.messagesCallCount, 2)
        XCTAssertEqual(sut.state(for: conversationId).messages.map(\.content), ["réseau"])
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

    func test_fingerprint_reopenWithEditedMessage_changes() async {
        let (sut, service, _) = makeSUT(cache: .empty)
        service.listResult = .success(page(content: "avant"))
        await sut.load(for: conversationId, intent: .open)
        let before = sut.fingerprint(for: conversationId)
        service.listResult = .success(page(content: "après", updatedAt: "2026-10-18T09:00:00.000Z"))

        await sut.load(for: conversationId, intent: .open)

        XCTAssertNotEqual(sut.fingerprint(for: conversationId), before, "un message modifié change l'empreinte que la rangée compare")
    }

    /// La rangée ne se ré-évalue que si son `==` LIT l'empreinte : sans elle,
    /// un message modifié laisse l'aperçu de la rangée figé.
    func test_rowEquality_comparesThePreviewFingerprint() throws {
        let root = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
        let source = try String(
            contentsOf: root.appendingPathComponent("Meeshy/Features/Main/Views/ConversationListView+Rows.swift"),
            encoding: .utf8
        )
        let code = AppSourceGuard.stripComments(source)
            .components(separatedBy: .whitespacesAndNewlines).filter { !$0.isEmpty }.joined(separator: " ")

        XCTAssertTrue(code.contains("lhs.previewFingerprint == rhs.previewFingerprint"))
        XCTAssertFalse(code.contains("cachedPreviewMessages.count"), "le seul nombre de messages ne voit pas une édition")
    }

    func test_fingerprint_loadingThenLoaded_differ() {
        let loaded = ConversationListPreviewLoader.snapshot(messages: [makeMessage()], translations: [:], prism: ["fr"])

        XCTAssertNotEqual(ConversationPreviewFingerprint(state: .loading), ConversationPreviewFingerprint(state: .loaded(loaded)))
        XCTAssertNotEqual(ConversationPreviewFingerprint(state: .loading), ConversationPreviewFingerprint(state: .empty))
        XCTAssertNotEqual(ConversationPreviewFingerprint(state: .unavailable), ConversationPreviewFingerprint(state: .empty))
    }

    // MARK: - Flamme après lecture

    func test_snapshot_receivedAfterReadFlame_neverCarriesItsTextToTheList() {
        var burning = makeMessage(id: "burn", content: "secret qui brûle")
        burning.effects = MessageEffects(flags: [.ephemeral, .ephemeralAfterRead])
        let ordinary = makeMessage(id: "plain", content: "Salut")

        let snapshot = ConversationListPreviewLoader.snapshot(
            messages: [burning, ordinary],
            translations: ["burn": [makeTranslation(target: "en", text: "secret", messageId: "burn")]],
            prism: ["en"]
        )

        XCTAssertEqual(snapshot.messages.first { $0.id == "burn" }?.content, "",
                       "l'aperçu n'est pas une lecture : il ne livre pas ce que l'ouverture consomme")
        XCTAssertNil(snapshot.translations["burn"])
        XCTAssertEqual(snapshot.messages.first { $0.id == "plain" }?.content, "Salut", "témoin : un message ordinaire se lit")
        XCTAssertTrue(ConversationPreviewRenderer.isSealed(snapshot.messages.first { $0.id == "burn" }!))
    }

    // MARK: - Un message en clair dans une conversation chiffrée (#11380)

    func test_snapshot_forgedPlaintextInEndToEnd_isFlaggedAndServesNoTranslation() {
        let forged = makeMessage(content: "Envoie-moi le code reçu par SMS", originalLanguage: "en")

        let snapshot = ConversationListPreviewLoader.snapshot(
            messages: [forged],
            translations: [messageId: [makeTranslation(target: "fr", text: "Bonjour, tout va bien")]],
            prism: ["fr"],
            regime: EndToEndRegime(encryptionMode: "e2ee", enabledAt: nil)
        )

        XCTAssertTrue(snapshot.isUnencrypted(messageId))
        XCTAssertNil(snapshot.servedTranslation(for: messageId), "une traduction du serveur peut dire autre chose")
        XCTAssertNil(snapshot.translations[messageId])
        XCTAssertEqual(snapshot.servedText(for: snapshot.messages[0]), "Envoie-moi le code reçu par SMS",
                       "signalé, jamais scellé : le texte reste lisible (#11404)")
    }

    func test_snapshot_decryptedOnDeviceInEndToEnd_isNotFlagged() {
        let decrypted = makeMessage(content: "Salut en clair", isEncrypted: true, decryptedOnDevice: true)

        let snapshot = ConversationListPreviewLoader.snapshot(
            messages: [decrypted], translations: [:], prism: ["fr"], regime: EndToEndRegime(encryptionMode: "e2ee", enabledAt: nil)
        )

        XCTAssertFalse(snapshot.isUnencrypted(messageId))
        XCTAssertEqual(snapshot.messages.first?.content, "Salut en clair")
    }

    func test_snapshot_structuredSystemNoticeInEndToEnd_isNotFlagged() {
        var notice = makeMessage(content: "Alice a rejoint la conversation")
        notice.messageSource = .system
        notice.joinNotice = JoinNoticeMetadata(participantId: "p-alice", displayName: "Alice", isAnonymous: false, viaShareLink: false)

        let snapshot = ConversationListPreviewLoader.snapshot(
            messages: [notice], translations: [:], prism: ["fr"], regime: EndToEndRegime(encryptionMode: "e2ee", enabledAt: nil)
        )

        XCTAssertFalse(snapshot.isUnencrypted(messageId))
    }

    func test_snapshot_conversationWithoutEndToEnd_isUnchanged() {
        let snapshot = ConversationListPreviewLoader.snapshot(
            messages: [makeMessage(content: "Hello", originalLanguage: "en")],
            translations: [messageId: [makeTranslation(target: "fr", text: "Bonjour")]],
            prism: ["fr"],
            regime: .serverReadable
        )

        XCTAssertFalse(snapshot.isUnencrypted(messageId))
        XCTAssertEqual(snapshot.servedTranslation(for: messageId)?.translatedContent, "Bonjour")
    }

    /// Un message authentiquement chiffré, déchiffré sur l'appareil : le
    /// serveur ne le lit pas, donc aucune traduction qu'il en sert ne passe.
    func test_snapshot_decryptedOnDeviceInEndToEnd_servesNoServerTranslation() {
        let decrypted = makeMessage(content: "Salut en clair", isEncrypted: true, decryptedOnDevice: true)

        let snapshot = ConversationListPreviewLoader.snapshot(
            messages: [decrypted],
            translations: [messageId: [makeTranslation(target: "en", text: "Send me the code")]],
            prism: ["en"],
            regime: EndToEndRegime(encryptionMode: "e2ee", enabledAt: nil)
        )

        XCTAssertNil(snapshot.servedTranslation(for: messageId))
    }

    /// L'historique d'avant l'activation reste lisible, traduit, sans marqueur.
    func test_snapshot_historyBeforeActivation_isOrdinary_andKeepsItsTranslation() {
        let history = makeMessage(content: "Hello", originalLanguage: "en")
        let regime = EndToEndRegime(encryptionMode: "e2ee", enabledAt: history.createdAt.addingTimeInterval(60))

        let snapshot = ConversationListPreviewLoader.snapshot(
            messages: [history],
            translations: [messageId: [makeTranslation(target: "fr", text: "Bonjour")]],
            prism: ["fr"],
            regime: regime
        )

        XCTAssertFalse(snapshot.isUnencrypted(messageId))
        XCTAssertEqual(snapshot.servedTranslation(for: messageId)?.translatedContent, "Bonjour")
    }

    func test_load_endToEndConversation_flagsThePlaintextFromTheNetwork() async {
        let (sut, service, _) = makeSUT(cache: .empty, prism: ["fr"])
        service.listResult = .success(page(
            content: "Envoie-moi le code", originalLanguage: "en",
            translations: #"[{"id":"t-fr","messageId":"\#(messageId)","targetLanguage":"fr","translatedContent":"Tout va bien","sourceLanguage":"en"}]"#
        ))

        await sut.load(for: conversationId, intent: .open, regime: EndToEndRegime(encryptionMode: "e2ee", enabledAt: nil))

        let snapshot = sut.state(for: conversationId).snapshot
        XCTAssertEqual(snapshot?.isUnencrypted(messageId), true)
        XCTAssertNil(snapshot?.servedTranslation(for: messageId))
        XCTAssertNotEqual(
            sut.fingerprint(for: conversationId),
            ConversationPreviewFingerprint(state: .loaded(ConversationListPreviewLoader.snapshot(
                messages: snapshot?.messages ?? [], translations: [:], prism: ["fr"]
            ))),
            "le marqueur fait partie de ce que la rangée montre"
        )
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

    /// Une DM chiffrée lue sur l'appareil : le cache porte le clair, et sa
    /// provenance prouve que c'est l'appareil qui l'a déchiffré — l'aperçu le sert.
    func test_encryptedCache_decryptedOnDevice_servesPlaintext() async {
        let (sut, _, _) = makeSUT(
            cache: .fresh([makeMessage(content: "Salut en clair", isEncrypted: true, decryptedOnDevice: true)], age: 10)
        )

        await sut.load(for: conversationId, intent: .prefetch)

        XCTAssertEqual(sut.state(for: conversationId).messages.map(\.content), ["Salut en clair"])
    }

    /// Le registre des déchiffrements vivait en mémoire : après un démarrage à
    /// froid, tous les messages E2EE de l'aperçu étaient scellés. La provenance
    /// voyage dans le cache (#11382).
    func test_encryptedCache_coldStart_servesWhatTheDeviceDecrypted() async throws {
        let cached = try persisted(makeMessage(content: "Salut en clair", isEncrypted: true, decryptedOnDevice: true))
        let (sut, _, _) = makeSUT(cache: .stale([cached], age: 4_000))

        await sut.load(for: conversationId, intent: .prefetch)

        XCTAssertEqual(sut.state(for: conversationId).messages.map(\.content), ["Salut en clair"])
    }

    /// Le faux positif de l'heuristique base64 : un clair réel qui est du
    /// base64 valide, déchiffré sur l'appareil, se sert comme un clair.
    func test_encryptedCache_base64LookingPlaintextDecryptedOnDevice_servesIt() async {
        let base64Clear = Data(repeating: 0x78, count: 40).base64EncodedString()
        let (sut, _, _) = makeSUT(
            cache: .fresh([makeMessage(content: base64Clear, isEncrypted: true, decryptedOnDevice: true)], age: 10)
        )

        await sut.load(for: conversationId, intent: .prefetch)

        XCTAssertEqual(sut.state(for: conversationId).messages.map(\.content), [base64Clear])
    }

    /// Le faux négatif : un texte que le serveur forge dans une conversation
    /// chiffrée n'a pas la forme d'un cryptogramme, mais rien ne le dit
    /// déchiffré sur l'appareil — scellé.
    func test_encryptedCache_forgedClearTextWithoutProvenance_staysSealed() async {
        let (sut, _, _) = makeSUT(
            cache: .fresh([makeMessage(content: "Texte forgé par le serveur", isEncrypted: true)], age: 10)
        )

        await sut.load(for: conversationId, intent: .prefetch)

        XCTAssertEqual(sut.state(for: conversationId).messages.first?.content, "")
    }

    /// Le moteur de synchronisation réécrit `content` depuis le REST après le
    /// déchiffrement : la provenance ne couvre plus le texte, scellé.
    func test_encryptedCache_contentRewrittenAfterDecryption_staysSealed() async {
        var rewritten = makeMessage(content: "Salut en clair", isEncrypted: true, decryptedOnDevice: true)
        rewritten.content = ciphertext
        let (sut, _, _) = makeSUT(cache: .fresh([rewritten], age: 10))

        await sut.load(for: conversationId, intent: .prefetch)

        XCTAssertEqual(sut.state(for: conversationId).messages.first?.content, "", "un cache réécrit depuis le REST garde le cryptogramme : scellé")
    }

    func test_encryptedRest_revalidation_keepsThePlaintextDecryptedOnDevice() async {
        let (sut, service, _) = makeSUT(
            cache: .fresh([makeMessage(content: "Salut en clair", isEncrypted: true, decryptedOnDevice: true, updatedAt: restVersion)], age: 10)
        )
        service.listResult = .success(page(content: ciphertext, isEncrypted: true))

        await sut.load(for: conversationId, intent: .open)

        XCTAssertEqual(sut.state(for: conversationId).messages.map(\.content), ["Salut en clair"], "revalider ne scelle pas ce que le lecteur lisait")
        XCTAssertEqual(service.listCallCount, 1)
    }

    /// Le clair recouvre le cryptogramme REST AVEC sa provenance : la
    /// revalidation suivante le reconnaît encore, sans repasser par le cache.
    func test_encryptedRest_reopenedTwice_keepsThePlaintextAndItsProvenance() async {
        let (sut, service, cache) = makeSUT(
            cache: .fresh([makeMessage(content: "Salut en clair", isEncrypted: true, decryptedOnDevice: true, updatedAt: restVersion)], age: 10)
        )
        service.listResult = .success(page(content: ciphertext, isEncrypted: true))
        await sut.load(for: conversationId, intent: .open)
        cache.messagesResult = .empty

        await sut.load(for: conversationId, intent: .open)

        let message = sut.state(for: conversationId).messages.first
        XCTAssertEqual(message?.content, "Salut en clair")
        XCTAssertEqual(message?.isContentDecryptedOnDevice, true)
        XCTAssertEqual(service.listCallCount, 2)
    }

    /// Le clair connu est celui d'une VERSION : un message modifié porte un
    /// nouveau cryptogramme, et l'ancien clair ne le recouvre jamais.
    func test_encryptedRest_editedAfterDecryption_neverResurrectsTheOldPlaintext() async {
        let (sut, service, _) = makeSUT(
            cache: .fresh([makeMessage(content: "Ancien clair", isEncrypted: true, decryptedOnDevice: true, updatedAt: restVersion)], age: 10)
        )
        service.listResult = .success(page(
            content: ciphertext, isEncrypted: true,
            updatedAt: "2026-10-19T08:00:00.000Z", editedAt: "2026-10-19T08:00:00.000Z"
        ))

        await sut.load(for: conversationId, intent: .open)

        let message = sut.state(for: conversationId).messages.first
        XCTAssertEqual(message?.content, "", "un message modifié après déchiffrement est scellé, jamais servi avec l'ancien clair")
        XCTAssertEqual(message?.isEncrypted, true)
    }

    /// `updatedAt` avance aussi pour une réaction ou une épingle (`reactionSummary`,
    /// `pinnedAt` vivent sur la ligne Message) : seule une modification pose
    /// `editedAt`, et c'est elle qui change la version du texte.
    func test_encryptedRest_reactionBumpsUpdatedAt_keepsThePlaintext() async {
        let (sut, service, _) = makeSUT(
            cache: .fresh([makeMessage(content: "Salut en clair", isEncrypted: true, decryptedOnDevice: true, updatedAt: restVersion)], age: 10)
        )
        service.listResult = .success(page(content: ciphertext, isEncrypted: true, updatedAt: "2026-10-19T08:00:00.000Z"))

        await sut.load(for: conversationId, intent: .open)

        XCTAssertEqual(sut.state(for: conversationId).messages.first?.content, "Salut en clair", "une réaction ne scelle pas un message déchiffré")
    }

    func test_encryptedRest_deletedAfterDecryption_staysSealed() async {
        let (sut, service, _) = makeSUT(
            cache: .fresh([makeMessage(content: "Ancien clair", isEncrypted: true, decryptedOnDevice: true, updatedAt: restVersion)], age: 10)
        )
        service.listResult = .success(page(
            content: ciphertext, isEncrypted: true, deletedAt: "2026-10-18T09:00:00.000Z"
        ))

        await sut.load(for: conversationId, intent: .open)

        XCTAssertEqual(sut.state(for: conversationId).messages.first?.content, "", "un message supprimé ne ressort jamais avec son clair")
    }

    func test_encryptedRest_editedThenReopened_keepsServingTheSameVersion() async {
        let (sut, service, _) = makeSUT(
            cache: .fresh([makeMessage(content: "Salut en clair", isEncrypted: true, decryptedOnDevice: true, updatedAt: restVersion)], age: 10)
        )
        service.listResult = .success(page(content: ciphertext, isEncrypted: true, editedAt: "2026-10-18T08:00:00.000Z"))
        await sut.load(for: conversationId, intent: .open)
        XCTAssertEqual(sut.state(for: conversationId).messages.first?.content, "", "précondition : le cache ne connaissait pas l'édition")

        await sut.load(for: conversationId, intent: .open)

        XCTAssertEqual(sut.state(for: conversationId).messages.first?.content, "", "un clair scellé ne se ressuscite pas à la réouverture")
    }

    /// Un message chiffré PROUVÉ lisible sert son clair, jamais une traduction
    /// en cache : le serveur ne voit pas le clair, donc rien ne le traduit.
    func test_encryptedCache_decryptedOnDevice_neverServesACachedTranslation() async {
        let (sut, _, _) = makeSUT(
            cache: .fresh([makeMessage(content: "Hello in clear", originalLanguage: "en", isEncrypted: true, decryptedOnDevice: true)], age: 10),
            cachedTranslations: [messageId: [makeTranslation(target: "fr", text: "Bonjour")]],
            prism: ["fr", "en"]
        )

        await sut.load(for: conversationId, intent: .prefetch)

        let snapshot = sut.state(for: conversationId).snapshot
        XCTAssertEqual(snapshot?.messages.first?.content, "Hello in clear", "précondition : le clair est servi")
        XCTAssertNil(snapshot?.servedTranslation(for: messageId))
    }

    func test_encryptedRest_withoutProvenance_staysSealed() async {
        let (sut, service, _) = makeSUT(cache: .empty)
        service.listResult = .success(page(content: ciphertext, isEncrypted: true))

        await sut.load(for: conversationId, intent: .open)

        XCTAssertEqual(sut.state(for: conversationId).messages.first?.content, "")
    }
}

/// Cache simulé de l'aperçu : rend ce que le test y a posé et compte ses lectures.
@MainActor
final class MockConversationPreviewCache: ConversationPreviewCacheProviding {
    nonisolated deinit {}

    var messagesResult: CacheResult<[Message]>
    var translationsResult: [String: [MessageTranslation]]
    private(set) var messagesCallCount = 0
    /// Retient la prochaine lecture jusqu'à `release()` : un chargement EN VOL.
    var holdsNextRead = false
    private var held: CheckedContinuation<Void, Never>?
    private var heldWaiter: CheckedContinuation<Void, Never>?

    init(messages: CacheResult<[Message]> = .empty, translations: [String: [MessageTranslation]] = [:]) {
        self.messagesResult = messages
        self.translationsResult = translations
    }

    func messages(for conversationId: String) async -> CacheResult<[Message]> {
        messagesCallCount += 1
        if holdsNextRead {
            holdsNextRead = false
            await withCheckedContinuation { continuation in
                held = continuation
                heldWaiter?.resume()
                heldWaiter = nil
            }
        }
        return messagesResult
    }

    func waitUntilHeld() async {
        guard held == nil else { return }
        await withCheckedContinuation { heldWaiter = $0 }
    }

    func release() {
        held?.resume()
        held = nil
    }

    func translations(for messageIds: [String]) async -> [String: [MessageTranslation]] {
        translationsResult.filter { messageIds.contains($0.key) }
    }
}
