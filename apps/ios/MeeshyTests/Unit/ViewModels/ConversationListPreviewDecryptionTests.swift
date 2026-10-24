import Combine
import CryptoKit
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

    private final class PhaseLog {
        var phases: [ConversationPreviewPhase?] = []
    }

    @MainActor
    private final class PinLock {
        nonisolated deinit {}
        var isLocked = false
    }

    @MainActor
    private final class TypeBox {
        nonisolated deinit {}
        var isDirect: Bool?
        init(isDirect: Bool?) { self.isDirect = isDirect }
    }

    @MainActor
    private final class Observed {
        nonisolated deinit {}
        var phases: [ConversationPreviewPhase] = []
    }

    private final class ContentLog {
        var contents: [String] = []
    }

    // MARK: - Fabriques

    private func makeSUT(
        cache: CacheResult<[Message]> = .empty,
        decryptor: any ConversationPreviewDecrypting = MockPreviewDecryptor(),
        isDirect: Bool? = true,
        isLocked: @escaping @MainActor (String) -> Bool = { _ in false },
        locksDidChange: AnyPublisher<Void, Never> = Empty<Void, Never>().eraseToAnyPublisher()
    ) -> (sut: ConversationListPreviewLoader, service: MockMessageService) {
        let service = MockMessageService()
        let sut = ConversationListPreviewLoader(
            messageService: service,
            cache: MockConversationPreviewCache(messages: cache),
            readerPrism: { ["fr"] },
            isLocked: isLocked,
            decryptor: decryptor,
            isDirectConversation: { _ in isDirect },
            locksDidChange: locksDidChange
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
            senderId: "participant-other",
            content: content ?? ciphertext,
            originalLanguage: "fr",
            isEncrypted: true,
            createdAt: Date(timeIntervalSince1970: 1_000),
            updatedAt: updatedAt,
            senderUserId: "user-other"
        )
    }

    private func encryptedPage() -> MessagesAPIResponse {
        JSONStub.decode("""
        {"success":true,"data":[{"id":"\(messageId)","conversationId":"\(conversationId)","senderId":"participant-other","sender":{"id":"participant-other","userId":"user-other","type":"user"},"content":"\(ciphertext)","originalLanguage":"fr","isEncrypted":true,"createdAt":"2026-10-18T08:00:00.000Z","updatedAt":"2026-10-18T08:00:00.000Z","translations":[]}],"pagination":null,"cursorPagination":null,"hasNewer":null}
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
        XCTAssertEqual(payloads.first?.senderId, "user-other", "la session se cherche sous l'utilisateur, jamais sous le Participant")
        XCTAssertEqual(payloads.first?.ciphertext, Data(base64Encoded: ciphertext))
    }

    func test_encryptedRest_withSession_servesThePlaintext() async {
        let decryptor = MockPreviewDecryptor(plaintexts: [messageId: "Rendez-vous à midi"])
        let (sut, service) = makeSUT(cache: .empty, decryptor: decryptor)
        service.listResult = .success(encryptedPage())

        await sut.load(for: conversationId, intent: .open)

        XCTAssertEqual(served(sut)?.content, "Rendez-vous à midi")
        XCTAssertEqual(served(sut)?.isContentDecryptedOnDevice, true)
        let payloads = await decryptor.receivedPayloads
        XCTAssertEqual(payloads.first?.senderId, "user-other", "le REST porte l'utilisateur dans `sender.userId`")
    }

    // MARK: - Le vrai déchiffreur, un vrai chiffrement

    /// Le critère de fin ne se prouve pas avec un faux déchiffreur qui rend le
    /// clair sans clé : ici le `DecryptionActor` de production ouvre un vrai
    /// AES-GCM, avec la clé rangée sous l'identifiant UTILISATEUR du pair.
    func test_realDecryptionActor_opensTheSealUnderTheSenderUserId() async throws {
        let key = SymmetricKey(size: .bits256)
        let sealed = try sealedBase64("Rendez-vous à midi", with: key)
        let decryptor = DecryptionActor(provider: RoundTripSessionProvider(sessions: ["user-other": key.rawBytes]))
        let (sut, _) = makeSUT(cache: .fresh([makeCipherMessage(content: sealed)], age: 10), decryptor: decryptor)

        await sut.load(for: conversationId, intent: .prefetch)

        XCTAssertEqual(served(sut)?.content, "Rendez-vous à midi")
        XCTAssertEqual(served(sut)?.isContentDecryptedOnDevice, true)
    }

    /// La session rangée sous le PARTICIPANT n'est jamais celle qu'on cherche :
    /// un `senderId` de message n'identifie pas le pair.
    func test_realDecryptionActor_sessionUnderTheParticipantId_staysSealed() async throws {
        let key = SymmetricKey(size: .bits256)
        let sealed = try sealedBase64("Rendez-vous à midi", with: key)
        let decryptor = DecryptionActor(provider: RoundTripSessionProvider(sessions: ["participant-other": key.rawBytes]))
        let (sut, _) = makeSUT(cache: .fresh([makeCipherMessage(content: sealed)], age: 10), decryptor: decryptor)

        await sut.load(for: conversationId, intent: .prefetch)

        XCTAssertEqual(served(sut)?.content, "")
        XCTAssertEqual(served(sut)?.isContentDecryptedOnDevice, false)
    }

    func test_realDecryptionActor_wrongKey_staysSealed() async throws {
        let sealed = try sealedBase64("Rendez-vous à midi", with: SymmetricKey(size: .bits256))
        let other = SymmetricKey(size: .bits256)
        let decryptor = DecryptionActor(provider: RoundTripSessionProvider(sessions: ["user-other": other.rawBytes]))
        let (sut, _) = makeSUT(cache: .fresh([makeCipherMessage(content: sealed)], age: 10), decryptor: decryptor)

        await sut.load(for: conversationId, intent: .prefetch)

        XCTAssertEqual(served(sut)?.content, "", "une authentification AES-GCM ratée laisse le scellé, jamais du bruit")
    }

    private func sealedBase64(_ plaintext: String, with key: SymmetricKey) throws -> String {
        try XCTUnwrap(AES.GCM.seal(Data(plaintext.utf8), using: key).combined).base64EncodedString()
    }

    // MARK: - Le type de conversation que la rangée connaît

    /// La rangée sait déjà que la conversation est directe : l'aperçu natif
    /// se prépare déchiffré sans attendre l'hydratation du store.
    func test_rowSaysDirect_decryptsWhileTheStoreDoesNotKnowYet() async {
        let decryptor = MockPreviewDecryptor(plaintexts: [messageId: "Rendez-vous à midi"])
        let (sut, _) = makeSUT(cache: .fresh([makeCipherMessage()], age: 10), decryptor: decryptor, isDirect: nil)

        await sut.load(for: conversationId, intent: .prefetch, isDirect: true)

        XCTAssertEqual(served(sut)?.content, "Rendez-vous à midi")
    }

    func test_rowSaysGroup_neverDecrypts() async {
        let decryptor = MockPreviewDecryptor(plaintexts: [messageId: "Rendez-vous à midi"])
        let (sut, _) = makeSUT(cache: .fresh([makeCipherMessage()], age: 10), decryptor: decryptor, isDirect: true)

        await sut.load(for: conversationId, intent: .prefetch, isDirect: false)

        XCTAssertEqual(served(sut)?.content, "")
        let calls = await decryptor.callCount
        XCTAssertEqual(calls, 0)
    }

    /// Type encore inconnu : servi scellé, mais rien n'est réputé réglé — le
    /// chargement suivant retente dès que le type se sait.
    func test_typeUnknown_staysSealedThenEnsureRetries() async {
        let type = TypeBox(isDirect: nil)
        let decryptor = MockPreviewDecryptor(plaintexts: [messageId: "Rendez-vous à midi"])
        let service = MockMessageService()
        let sut = ConversationListPreviewLoader(
            messageService: service,
            cache: MockConversationPreviewCache(messages: .fresh([makeCipherMessage()], age: 10)),
            readerPrism: { ["fr"] },
            isLocked: { _ in false },
            decryptor: decryptor,
            isDirectConversation: { _ in type.isDirect },
            locksDidChange: Empty<Void, Never>().eraseToAnyPublisher()
        )

        await sut.load(for: conversationId, intent: .prefetch)
        XCTAssertEqual(served(sut)?.content, "", "précondition : type inconnu ⇒ scellé")

        type.isDirect = true
        await sut.load(for: conversationId, intent: .ensure)

        XCTAssertEqual(served(sut)?.content, "Rendez-vous à midi")
        XCTAssertEqual(service.listCallCount, 0, "un cache frais se redéchiffre sans réseau")
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

    /// Le verrou se pose PENDANT le déchiffrement : le clair n'est jamais
    /// publié, et lever le verrou ensuite ne le fait pas réapparaître.
    func test_lockDuringDecryption_neverPublishesThePlaintext() async {
        let pin = PinLock()
        let decryptor = MockPreviewDecryptor(plaintexts: [messageId: "Rendez-vous à midi"])
        await decryptor.setOnDecrypt { pin.isLocked = true }
        let (sut, service) = makeSUT(
            cache: .fresh([makeCipherMessage()], age: 10), decryptor: decryptor, isLocked: { _ in pin.isLocked }
        )
        service.listResult = .success(encryptedPage())
        let log = ContentLog()
        let id = conversationId
        let token = sut.$states.sink { log.contents.append(contentsOf: $0[id]?.snapshot?.messages.map(\.content) ?? []) }

        await sut.load(for: conversationId, intent: .open)
        pin.isLocked = false

        XCTAssertFalse(log.contents.contains("Rendez-vous à midi"), "aucun état publié n'a porté le clair")
        XCTAssertNotEqual(served(sut)?.content, "Rendez-vous à midi")
        token.cancel()
    }

    /// Poser un verrou PURGE le clair déjà servi — masquer ne suffit pas :
    /// une fois le verrou levé, le clair ne revient pas de la mémoire.
    func test_lockPosted_purgesThePlaintextFromMemory() async {
        let pin = PinLock()
        let locks = PassthroughSubject<Void, Never>()
        let decryptor = MockPreviewDecryptor(plaintexts: [messageId: "Rendez-vous à midi"])
        let (sut, _) = makeSUT(
            cache: .fresh([makeCipherMessage()], age: 10), decryptor: decryptor,
            isLocked: { _ in pin.isLocked }, locksDidChange: locks.eraseToAnyPublisher()
        )
        await sut.load(for: conversationId, intent: .prefetch)
        XCTAssertEqual(served(sut)?.content, "Rendez-vous à midi", "précondition")

        pin.isLocked = true
        locks.send(())
        pin.isLocked = false

        XCTAssertNil(sut.state(for: conversationId).snapshot, "le clair a quitté la mémoire")
        XCTAssertEqual(sut.state(for: conversationId).phase, .loading)
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

    // MARK: - Purge à la déconnexion

    func test_purge_dropsThePlaintextAndRebuildsTheDecryptor() async {
        let factory = DecryptorFactory(plaintexts: [messageId: "Rendez-vous à midi"])
        let sut = ConversationListPreviewLoader(
            messageService: MockMessageService(),
            cache: MockConversationPreviewCache(messages: .fresh([makeCipherMessage()], age: 10)),
            readerPrism: { ["fr"] },
            isLocked: { _ in false },
            decryptor: factory.make(),
            isDirectConversation: { _ in true },
            locksDidChange: Empty<Void, Never>().eraseToAnyPublisher()
        )
        await sut.load(for: conversationId, intent: .prefetch)
        XCTAssertEqual(served(sut)?.content, "Rendez-vous à midi", "précondition")

        sut.purge()

        XCTAssertNil(sut.state(for: conversationId).snapshot)
        XCTAssertEqual(sut.state(for: conversationId).phase, .loading)
        XCTAssertTrue(sut.messages.isEmpty)
        XCTAssertEqual(factory.made, 2, "la mémoire du déchiffreur part avec le compte")
    }

    /// Un déchiffrement en vol à la déconnexion ne publie rien après la purge.
    func test_purgeDuringDecryption_publishesNothingAfterwards() async {
        let decryptor = MockPreviewDecryptor(plaintexts: [messageId: "Rendez-vous à midi"])
        let (sut, _) = makeSUT(cache: .fresh([makeCipherMessage()], age: 10), decryptor: decryptor)
        await decryptor.setOnDecrypt { sut.purge() }

        await sut.load(for: conversationId, intent: .prefetch)

        XCTAssertNil(sut.state(for: conversationId).snapshot)
        XCTAssertTrue(sut.messages.isEmpty)
    }

    func test_purgeAllLive_purgesEveryLiveLoader() async {
        let decryptor = MockPreviewDecryptor(plaintexts: [messageId: "Rendez-vous à midi"])
        let (sut, _) = makeSUT(cache: .fresh([makeCipherMessage()], age: 10), decryptor: decryptor)
        await sut.load(for: conversationId, intent: .prefetch)
        XCTAssertEqual(served(sut)?.content, "Rendez-vous à midi", "précondition")

        ConversationListPreviewLoader.purgeAllLive()

        XCTAssertNil(sut.state(for: conversationId).snapshot)
    }

    // MARK: - Cache-first : ce qui est déchiffré ne se re-déchiffre pas

    /// Ouverture sur un cache chiffré : pendant le déchiffrement, l'aperçu
    /// montre déjà le cache (scellé), jamais un chargement.
    func test_openOnEncryptedCache_showsTheCacheWhileDecrypting() async {
        let observed = Observed()
        let decryptor = MockPreviewDecryptor(plaintexts: [messageId: "Rendez-vous à midi"])
        let (sut, service) = makeSUT(cache: .fresh([makeCipherMessage(updatedAt: restVersion)], age: 10), decryptor: decryptor)
        service.listResult = .success(encryptedPage())
        let id = conversationId
        await decryptor.setOnDecrypt { observed.phases.append(sut.state(for: id).phase) }
        let log = PhaseLog()
        let token = sut.$states.sink { log.phases.append($0[id]?.phase) }

        await sut.load(for: conversationId, intent: .open)

        XCTAssertEqual(observed.phases.first, .loaded, "le cache est servi avant que le déchiffrement ne rende")
        XCTAssertFalse(log.phases.contains(.loading), "un cache non vide ne montre jamais de spinner")
        token.cancel()
    }

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

    /// La seule requête est une LECTURE, et elle ne transporte que ce qui
    /// désigne la page : ni texte, ni recherche, ni langue d'un clair.
    func test_decryptedPlaintext_neverReachesTheServer() async {
        let decryptor = MockPreviewDecryptor(plaintexts: [messageId: "Rendez-vous à midi"])
        let (sut, service) = makeSUT(cache: .fresh([makeCipherMessage()], age: 10), decryptor: decryptor)
        service.listResult = .success(encryptedPage())

        await sut.load(for: conversationId, intent: .open)

        XCTAssertEqual(served(sut)?.content, "Rendez-vous à midi", "précondition")
        XCTAssertEqual(service.listCallCount, 1, "une lecture, et rien d'autre")
        XCTAssertEqual(service.lastListConversationId, conversationId)
        XCTAssertEqual(service.lastListOffset, 0)
        XCTAssertEqual(service.lastListLimit, ConversationListPreviewLoader.previewLimit)
        XCTAssertEqual(service.lastListIncludeReplies, false)
        XCTAssertEqual(service.lastListIncludeTranslations, true)
        XCTAssertNil(service.lastListLanguages)
        let otherCalls = service.sendCallCount + service.editCallCount + service.searchCallCount
            + service.searchWithCursorCallCount + service.consumeViewOnceCallCount + service.deleteCallCount
            + service.listBeforeCallCount + service.listAfterCallCount + service.listAroundCallCount
        XCTAssertEqual(otherCalls, 0, "aucune autre route n'est touchée")
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

    // MARK: - Une seule construction, une purge câblée

    private static var appRoot: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // ViewModels
            .deletingLastPathComponent()   // Unit
            .deletingLastPathComponent()   // MeeshyTests
            .deletingLastPathComponent()   // apps/ios
    }

    private func productionSources() -> [URL] {
        let root = Self.appRoot.appendingPathComponent("Meeshy")
        let enumerator = FileManager.default.enumerator(at: root, includingPropertiesForKeys: nil)
        return (enumerator?.allObjects as? [URL] ?? []).filter { $0.pathExtension == "swift" }
    }

    /// Le fil et l'aperçu bâtissent leur demande par `DecryptionPayload(decrypting:)` :
    /// deux constructions avaient déjà divergé (gardes, clé d'expéditeur).
    func test_noProductionSiteBuildsADecryptionPayloadByHand() throws {
        let files = productionSources()
        XCTAssertGreaterThan(files.count, 500, "la garde ne mesurerait RIEN : le dossier Meeshy est introuvable")
        let handBuilt = try files.filter { url in
            AppSourceGuard.stripComments(try String(contentsOf: url, encoding: .utf8)).contains("DecryptionPayload(messageId:")
        }
        XCTAssertEqual(handBuilt.map(\.lastPathComponent), [])
    }

    func test_logoutPurgesThePreviewLoaders() throws {
        let container = Self.appRoot.appendingPathComponent("Meeshy/Core/DependencyContainer.swift")
        let code = AppSourceGuard.stripComments(try String(contentsOf: container, encoding: .utf8))
        XCTAssertTrue(code.contains("ConversationListPreviewLoader.purgeAllLive()"),
                      "la déconnexion doit purger les clairs de l'aperçu (resetInMemoryAccountState)")
    }
}

/// Un fournisseur de session qui DÉCHIFFRE pour de vrai (AES-GCM combiné,
/// comme `E2EEService.decrypt`), avec ses clés rangées par identifiant.
private struct RoundTripSessionProvider: DecryptionSessionProviding {
    let sessions: [String: Data]

    func decryptMessage(_ ciphertext: Data, from senderId: String) async throws -> Data {
        guard let raw = sessions[senderId] else { throw MockPreviewDecryptor.Failure.missingSession }
        return try AES.GCM.open(AES.GCM.SealedBox(combined: ciphertext), using: SymmetricKey(data: raw))
    }
}

private extension SymmetricKey {
    var rawBytes: Data { withUnsafeBytes { Data($0) } }
}

/// Compte les déchiffreurs fabriqués : une purge en reconstruit un.
private final class DecryptorFactory {
    private let plaintexts: [String: String]
    private(set) var made = 0

    init(plaintexts: [String: String]) {
        self.plaintexts = plaintexts
    }

    func make() -> any ConversationPreviewDecrypting {
        made += 1
        return MockPreviewDecryptor(plaintexts: plaintexts)
    }
}

/// Déchiffreur simulé : rend le clair, l'échec ou l'indécodable que le test a
/// posé par message, et compte ses appels.
actor MockPreviewDecryptor {
    enum Failure: Error { case missingSession, authenticationFailed }

    private let plaintexts: [String: String]
    private let failures: [String: Failure]
    private let undecodable: Set<String>
    private(set) var receivedPayloads: [DecryptionPayload] = []
    private(set) var callCount = 0
    private var onDecrypt: (@MainActor @Sendable () -> Void)?

    init(plaintexts: [String: String] = [:], failures: [String: Failure] = [:], undecodable: Set<String> = []) {
        self.plaintexts = plaintexts
        self.failures = failures
        self.undecodable = undecodable
    }

    /// Ce qui arrive PENDANT le déchiffrement : un verrou, une déconnexion.
    func setOnDecrypt(_ hook: @escaping @MainActor @Sendable () -> Void) {
        onDecrypt = hook
    }

    func decrypt(_ payloads: [DecryptionPayload]) async -> [DecryptionResult] {
        callCount += 1
        receivedPayloads.append(contentsOf: payloads)
        if let onDecrypt { await onDecrypt() }
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

// Conformité posée en extension, comme `DecryptionActor` : sur la déclaration,
// le protocole `nonisolated` rendrait l'init synchrone de l'acteur `nonisolated`,
// ce que Swift refuse.
extension MockPreviewDecryptor: ConversationPreviewDecrypting {}
