import XCTest
import MeeshySDK
@testable import Meeshy

/// L'aperçu d'appui long d'une conversation CHIFFRÉE (#11232) : ses derniers
/// messages se déchiffrent SUR L'APPAREIL, par le `DecryptionActor` que le fil
/// emploie déjà — aucune nouvelle primitive. Le clair adopté porte sa
/// provenance (`adoptDecryptedContent`) ; tout ce qui ne se déchiffre pas
/// reste scellé, jamais servi comme cryptogramme ; une conversation verrouillée
/// ne déchiffre ni ne montre rien ; et rien de déchiffré ne repart au serveur.
@MainActor
final class ConversationListPreviewDecryptionTests: XCTestCase {

    private let conversationId = "000000000000000000000c01"
    private let messageId = "000000000000000000000a01"
    /// Le cryptogramme tel que le REST et le cache le portent : du base64.
    private let ciphertext = "eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eA=="
    private let restVersion = Date(timeIntervalSince1970: 1_792_310_400)

    @MainActor
    private final class PhaseLog {
        nonisolated deinit {}
        var phases: [ConversationPreviewPhase?] = []
    }

    @MainActor
    private final class PinLock {
        nonisolated deinit {}
        var isLocked = false
    }

    // MARK: - Fabriques

    private func makeSUT(
        cache: CacheResult<[Message]> = .empty,
        decryptor: MockPreviewDecryptor = MockPreviewDecryptor(),
        isDirect: Bool = true,
        isLocked: @escaping @MainActor (String) -> Bool = { _ in false }
    ) -> (sut: ConversationListPreviewLoader, service: MockMessageService) {
        let service = MockMessageService()
        let sut = ConversationListPreviewLoader(
            messageService: service,
            cache: MockConversationPreviewCache(messages: cache),
            readerPrism: { ["fr"] },
            isLocked: isLocked,
            decryptor: decryptor,
            isDirectConversation: { _ in isDirect }
        )
        return (sut, service)
    }

    private func makeCipherMessage(
        id: String? = nil,
        content: String? = nil,
        updatedAt: Date = Date(timeIntervalSince1970: 1_000)
    ) -> Message {
        Message(
            id: id ?? messageId,
            conversationId: conversationId,
            senderId: "u-other",
            content: content ?? ciphertext,
            originalLanguage: "fr",
            isEncrypted: true,
            createdAt: Date(timeIntervalSince1970: 1_000),
            updatedAt: updatedAt
        )
    }

    private func encryptedPage() -> MessagesAPIResponse {
        JSONStub.decode("""
        {"success":true,"data":[{"id":"\(messageId)","conversationId":"\(conversationId)","senderId":"u-other","content":"\(ciphertext)","originalLanguage":"fr","isEncrypted":true,"createdAt":"2026-10-18T08:00:00.000Z","updatedAt":"2026-10-18T08:00:00.000Z","translations":[]}],"pagination":null,"cursorPagination":null,"hasNewer":null}
        """)
    }

    private func served(_ sut: ConversationListPreviewLoader) -> Message? {
        sut.state(for: conversationId).snapshot?.messages.first
    }

    // MARK: - Le clair déchiffré sur l'appareil

    func test_encryptedCache_withSession_servesThePlaintextWithItsProvenance() async {
        let decryptor = MockPreviewDecryptor(plaintexts: [messageId: "Rendez-vous à midi"])
        let (sut, _) = makeSUT(cache: .fresh([makeCipherMessage()], age: 10), decryptor: decryptor)

        await sut.load(for: conversationId, intent: .prefetch)

        XCTAssertEqual(served(sut)?.content, "Rendez-vous à midi")
        XCTAssertEqual(served(sut)?.isContentDecryptedOnDevice, true, "le clair porte la provenance du déchiffrement")
        let payloads = await decryptor.receivedPayloads
        XCTAssertEqual(payloads.map(\.messageId), [messageId])
        XCTAssertEqual(payloads.first?.senderId, "u-other")
        XCTAssertEqual(payloads.first?.ciphertext, Data(base64Encoded: ciphertext))
    }

    func test_encryptedRest_withSession_servesThePlaintext() async {
        let decryptor = MockPreviewDecryptor(plaintexts: [messageId: "Rendez-vous à midi"])
        let (sut, service) = makeSUT(cache: .empty, decryptor: decryptor)
        service.listResult = .success(encryptedPage())

        await sut.load(for: conversationId, intent: .open)

        XCTAssertEqual(served(sut)?.content, "Rendez-vous à midi")
        XCTAssertEqual(served(sut)?.isContentDecryptedOnDevice, true)
    }

    /// Cache-first : le cache se sert sans que l'aperçu dise « chargement ».
    func test_encryptedCache_neverShowsASpinnerWhileDecrypting() async {
        let decryptor = MockPreviewDecryptor(plaintexts: [messageId: "Rendez-vous à midi"])
        let (sut, _) = makeSUT(cache: .fresh([makeCipherMessage()], age: 10), decryptor: decryptor)
        let log = PhaseLog()
        let id = conversationId
        let token = sut.$states.sink { log.phases.append($0[id]?.phase) }

        await sut.load(for: conversationId, intent: .prefetch)

        XCTAssertFalse(log.phases.contains(.loading), "un cache non vide ne montre jamais de spinner")
        XCTAssertEqual(log.phases.last, .loaded)
        token.cancel()
    }

    // MARK: - Fail-closed

    func test_encryptedCache_sessionMissing_staysSealed() async {
        let decryptor = MockPreviewDecryptor(failures: [messageId: .missingSession])
        let (sut, _) = makeSUT(cache: .fresh([makeCipherMessage()], age: 10), decryptor: decryptor)

        await sut.load(for: conversationId, intent: .prefetch)

        XCTAssertEqual(served(sut)?.content, "", "sans session, le placeholder scellé — jamais le cryptogramme")
        XCTAssertEqual(served(sut)?.isEncrypted, true)
        XCTAssertEqual(served(sut)?.isContentDecryptedOnDevice, false)
    }

    func test_encryptedRest_decryptionFails_staysSealed() async {
        let decryptor = MockPreviewDecryptor(failures: [messageId: .authenticationFailed])
        let (sut, service) = makeSUT(cache: .empty, decryptor: decryptor)
        service.listResult = .success(encryptedPage())

        await sut.load(for: conversationId, intent: .open)

        XCTAssertEqual(served(sut)?.content, "")
        XCTAssertEqual(served(sut)?.isContentDecryptedOnDevice, false)
    }

    /// Le `DecryptionActor` rend `plaintext == nil` sans erreur quand le clair
    /// n'est pas de l'UTF-8 : rien n'est adopté.
    func test_encryptedCache_undecodablePlaintext_staysSealed() async {
        let decryptor = MockPreviewDecryptor(undecodable: [messageId])
        let (sut, _) = makeSUT(cache: .fresh([makeCipherMessage()], age: 10), decryptor: decryptor)

        await sut.load(for: conversationId, intent: .prefetch)

        XCTAssertEqual(served(sut)?.content, "")
    }

    func test_encryptedCache_emptyPlaintext_staysSealed() async {
        let decryptor = MockPreviewDecryptor(plaintexts: [messageId: ""])
        let (sut, _) = makeSUT(cache: .fresh([makeCipherMessage()], age: 10), decryptor: decryptor)

        await sut.load(for: conversationId, intent: .prefetch)

        XCTAssertEqual(served(sut)?.isContentDecryptedOnDevice, false)
        XCTAssertTrue(ConversationPreviewRenderer.isSealed(served(sut)!))
    }

    /// Le fil ne déchiffre que les conversations directes : l'aperçu n'en
    /// montre jamais plus que lui.
    func test_groupConversation_neverDecrypts() async {
        let decryptor = MockPreviewDecryptor(plaintexts: [messageId: "Rendez-vous à midi"])
        let (sut, _) = makeSUT(cache: .fresh([makeCipherMessage()], age: 10), decryptor: decryptor, isDirect: false)

        await sut.load(for: conversationId, intent: .prefetch)

        XCTAssertEqual(served(sut)?.content, "")
        let calls = await decryptor.callCount
        XCTAssertEqual(calls, 0)
    }

    // MARK: - Verrou PIN

    func test_lockedConversation_decryptsNothingAndShowsNothing() async {
        let decryptor = MockPreviewDecryptor(plaintexts: [messageId: "Rendez-vous à midi"])
        let (sut, service) = makeSUT(
            cache: .fresh([makeCipherMessage()], age: 10), decryptor: decryptor, isLocked: { _ in true }
        )
        service.listResult = .success(encryptedPage())

        await sut.load(for: conversationId, intent: .open)

        XCTAssertEqual(sut.state(for: conversationId).phase, .sealed)
        XCTAssertNil(sut.state(for: conversationId).snapshot)
        let calls = await decryptor.callCount
        XCTAssertEqual(calls, 0, "une conversation verrouillée ne déchiffre rien")
    }

    func test_lockAppearsAfterDecryption_dropsThePlaintext() async {
        let pin = PinLock()
        let decryptor = MockPreviewDecryptor(plaintexts: [messageId: "Rendez-vous à midi"])
        let (sut, _) = makeSUT(
            cache: .fresh([makeCipherMessage()], age: 10), decryptor: decryptor, isLocked: { _ in pin.isLocked }
        )
        await sut.load(for: conversationId, intent: .prefetch)
        XCTAssertEqual(served(sut)?.content, "Rendez-vous à midi", "précondition")

        pin.isLocked = true

        XCTAssertEqual(sut.state(for: conversationId).phase, .sealed)
        XCTAssertTrue(sut.messages.isEmpty)
    }

    // MARK: - Cache-first : ce qui est déchiffré ne se re-déchiffre pas

    func test_cacheAlreadyDecrypted_neverCallsTheDecryptor() async {
        var known = makeCipherMessage(updatedAt: restVersion)
        known.adoptDecryptedContent("Déjà en clair")
        let decryptor = MockPreviewDecryptor(plaintexts: [messageId: "Autre chose"])
        let (sut, service) = makeSUT(cache: .fresh([known], age: 10), decryptor: decryptor)
        service.listResult = .success(encryptedPage())

        await sut.load(for: conversationId, intent: .open)

        XCTAssertEqual(served(sut)?.content, "Déjà en clair")
        let calls = await decryptor.callCount
        XCTAssertEqual(calls, 0, "le clair prouvé du cache se sert sans repasser par le déchiffreur")
    }

    func test_reopenAfterDecryption_revalidatesWithoutDecryptingAgain() async {
        let decryptor = MockPreviewDecryptor(plaintexts: [messageId: "Rendez-vous à midi"])
        let (sut, service) = makeSUT(cache: .fresh([makeCipherMessage(updatedAt: restVersion)], age: 10), decryptor: decryptor)
        service.listResult = .success(encryptedPage())

        await sut.load(for: conversationId, intent: .prefetch)
        await sut.load(for: conversationId, intent: .open)

        XCTAssertEqual(served(sut)?.content, "Rendez-vous à midi")
        XCTAssertEqual(service.listCallCount, 1, "précondition : le réseau a revalidé")
        let calls = await decryptor.callCount
        XCTAssertEqual(calls, 1)
    }

    // MARK: - Ce qui part à côté

    func test_decryptedPlaintext_neverReachesTheServer() async {
        let decryptor = MockPreviewDecryptor(plaintexts: [messageId: "Rendez-vous à midi"])
        let (sut, service) = makeSUT(cache: .fresh([makeCipherMessage()], age: 10), decryptor: decryptor)
        service.listResult = .success(encryptedPage())

        await sut.load(for: conversationId, intent: .open)

        XCTAssertEqual(served(sut)?.content, "Rendez-vous à midi", "précondition")
        XCTAssertEqual(service.listCallCount, 1, "une lecture, et rien d'autre")
        XCTAssertEqual(service.sendCallCount, 0)
        XCTAssertEqual(service.editCallCount, 0)
        XCTAssertEqual(service.lastListConversationId, conversationId)
        XCTAssertNil(sut.state(for: conversationId).snapshot?.servedTranslation(for: messageId),
                     "aucune traduction serveur ne double un clair déchiffré")
    }

    /// Une flamme « après lecture » reçue ne se déchiffre pas pour la liste —
    /// et ne s'y montre pas même si l'appareil en a déjà le clair.
    func test_receivedAfterReadFlame_isNeitherDecryptedNorShown() async {
        var burning = makeCipherMessage()
        burning.effects = MessageEffects(flags: [.ephemeral, .ephemeralAfterRead])
        var burningKnown = makeCipherMessage(id: "000000000000000000000a02")
        burningKnown.effects = MessageEffects(flags: [.ephemeral, .ephemeralAfterRead])
        burningKnown.adoptDecryptedContent("secret qui brûle")
        let decryptor = MockPreviewDecryptor(plaintexts: [messageId: "secret qui brûle"])
        let (sut, _) = makeSUT(cache: .fresh([burning, burningKnown], age: 10), decryptor: decryptor)

        await sut.load(for: conversationId, intent: .prefetch)

        let messages = sut.state(for: conversationId).messages
        XCTAssertEqual(messages.map(\.content), ["", ""])
        let calls = await decryptor.callCount
        XCTAssertEqual(calls, 0)
    }

    func test_decryptedMessage_changesTheRowFingerprint() {
        var decrypted = makeCipherMessage()
        decrypted.adoptDecryptedContent("Rendez-vous à midi")
        let sealed = ConversationListPreviewLoader.snapshot(messages: [makeCipherMessage()], translations: [:], prism: ["fr"])
        let clear = ConversationListPreviewLoader.snapshot(messages: [decrypted], translations: [:], prism: ["fr"])

        XCTAssertNotEqual(
            ConversationPreviewFingerprint(state: .loaded(sealed)),
            ConversationPreviewFingerprint(state: .loaded(clear)),
            "un message qui passe de scellé à déchiffré ré-évalue la rangée"
        )
    }
}

/// Déchiffreur simulé : rend le clair, l'échec ou l'indécodable que le test a
/// posé par message, et compte ses appels.
actor MockPreviewDecryptor: ConversationPreviewDecrypting {
    enum Failure: Error { case missingSession, authenticationFailed }

    private let plaintexts: [String: String]
    private let failures: [String: Failure]
    private let undecodable: Set<String>
    private(set) var receivedPayloads: [DecryptionPayload] = []
    private(set) var callCount = 0

    init(plaintexts: [String: String] = [:], failures: [String: Failure] = [:], undecodable: Set<String> = []) {
        self.plaintexts = plaintexts
        self.failures = failures
        self.undecodable = undecodable
    }

    func decrypt(_ payloads: [DecryptionPayload]) async -> [DecryptionResult] {
        callCount += 1
        receivedPayloads.append(contentsOf: payloads)
        return payloads.map { payload in
            if let failure = failures[payload.messageId] {
                return DecryptionResult(messageId: payload.messageId, plaintext: nil, error: failure)
            }
            if undecodable.contains(payload.messageId) {
                return DecryptionResult(messageId: payload.messageId, plaintext: nil, error: nil)
            }
            let plaintext = plaintexts[payload.messageId]
            let error: (any Error)? = plaintext == nil ? Failure.missingSession : nil
            return DecryptionResult(messageId: payload.messageId, plaintext: plaintext, error: error)
        }
    }
}
