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
    /// Le pair de la conversation directe, tel que la rangée l'élit localement.
    private let peerId = "user-other"
    private let reader: @MainActor @Sendable () -> String = { "user-me" }
    private var peer: DirectSessionPeer { DirectSessionPeer(peerUserId: peerId, readerUserId: "user-me")! }

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
        var directness: PreviewDirectness?
        init(directness: PreviewDirectness?) { self.directness = directness }
    }

    @MainActor
    private final class Observed {
        nonisolated deinit {}
        var phases: [ConversationPreviewPhase] = []
    }

    /// Vrai au premier appel seulement : la déconnexion n'arrive qu'une fois.
    @MainActor
    private final class Once {
        nonisolated deinit {}
        private var fired = false
        func fire() -> Bool {
            defer { fired = true }
            return !fired
        }
    }

    private final class ContentLog {
        var contents: [String] = []
    }

    // MARK: - Fabriques

    private func makeSUT(
        cache: CacheResult<[Message]> = .empty,
        cachedTranslations: [String: [MessageTranslation]] = [:],
        decryptor: any OnDeviceMessageDecrypting = MockPreviewDecryptor(),
        directness: PreviewDirectness? = .direct(peerUserId: "user-other"),
        isLocked: @escaping @MainActor (String) -> Bool = { _ in false },
        locksDidChange: AnyPublisher<Void, Never> = Empty<Void, Never>().eraseToAnyPublisher()
    ) -> (sut: ConversationListPreviewLoader, service: MockMessageService) {
        let service = MockMessageService()
        let sut = ConversationListPreviewLoader(
            messageService: service,
            cache: MockConversationPreviewCache(messages: cache, translations: cachedTranslations),
            readerPrism: { ["fr"] },
            isLocked: isLocked,
            decryptor: decryptor,
            directness: { _ in directness },
            locksDidChange: locksDidChange,
            regimeMemory: EndToEndRegimeMemory(defaults: nil)
        )
        return (sut, service)
    }

    /// Le cryptogramme d'un pair tel qu'une LIGNE GRDB le rend
    /// (`MessageRecord.toMessage`), forme que le fil sauvegarde dans
    /// `CacheCoordinator.messages` : `senderId` est l'utilisateur résolu à
    /// l'ingestion, et `senderUserId` est ABSENT — il n'est posé que pour le
    /// lecteur (B1 de la revue de #12722).
    private func makeCipherMessage(
        id: String? = nil,
        content: String? = nil,
        updatedAt: Date = Date(timeIntervalSince1970: 1_000),
        senderId: String = "user-other",
        senderUserId: String? = nil,
        isMe: Bool = false
    ) -> Message {
        Message(
            id: id ?? messageId,
            conversationId: conversationId,
            senderId: senderId,
            content: content ?? ciphertext,
            originalLanguage: "fr",
            isEncrypted: true,
            createdAt: Date(timeIntervalSince1970: 1_000),
            updatedAt: updatedAt,
            senderUserId: senderUserId,
            isMe: isMe
        )
    }

    /// Le même cryptogramme tel que le REST ou le socket le rend : `senderId`
    /// désigne le Participant, l'utilisateur est dans `senderUserId`.
    private func makeWireCipherMessage(id: String? = nil, content: String? = nil) -> Message {
        makeCipherMessage(id: id, content: content, senderId: "participant-other", senderUserId: "user-other")
    }

    /// Mon propre cryptogramme, ligne GRDB : `toMessage` pose `senderUserId`
    /// pour le lecteur seulement.
    private func makeOwnCipherMessage(id: String, content: String? = nil) -> Message {
        makeCipherMessage(id: id, content: content, senderId: "user-me", senderUserId: "user-me", isMe: true)
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

        await sut.load(for: conversationId, intent: .prefetch, currentUserId: reader)

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

        await sut.load(for: conversationId, intent: .open, currentUserId: reader)

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

        await sut.load(for: conversationId, intent: .prefetch, currentUserId: reader)

        XCTAssertEqual(served(sut)?.content, "Rendez-vous à midi")
        XCTAssertEqual(served(sut)?.isContentDecryptedOnDevice, true)
    }

    /// Le message REST d'un pair porte son Participant dans `senderId` : la clé
    /// se cherche sous le PAIR local, jamais sous ce que le message affirme.
    func test_realDecryptionActor_wireMessageOfThePeer_opensUnderThePeerSession() async throws {
        let key = SymmetricKey(size: .bits256)
        let sealed = try sealedBase64("Rendez-vous à midi", with: key)
        let decryptor = DecryptionActor(provider: RoundTripSessionProvider(sessions: [peerId: key.rawBytes, "participant-other": SymmetricKey(size: .bits256).rawBytes]))
        let (sut, _) = makeSUT(cache: .fresh([makeWireCipherMessage(content: sealed)], age: 10), decryptor: decryptor)

        await sut.load(for: conversationId, intent: .prefetch, currentUserId: reader)

        XCTAssertEqual(served(sut)?.content, "Rendez-vous à midi")
    }

    /// Un message qui se dit d'un TIERS dans une directe ne s'ouvre pas, même
    /// si l'appareil a une session sous ce tiers : l'auteur annoncé ne choisit
    /// jamais la clé, il ne sert qu'à refuser (#12757, M1). Il reste scellé,
    /// jamais présenté comme un clair ordinaire.
    func test_realDecryptionActor_authorNeitherPeerNorReader_staysSealed() async throws {
        let key = SymmetricKey(size: .bits256)
        let sealed = try sealedBase64("Rendez-vous à midi", with: key)
        let decryptor = DecryptionActor(provider: RoundTripSessionProvider(sessions: ["user-eve": key.rawBytes, peerId: key.rawBytes]))
        let (sut, _) = makeSUT(
            cache: .fresh([makeCipherMessage(content: sealed, senderId: "user-eve")], age: 10), decryptor: decryptor
        )

        await sut.load(for: conversationId, intent: .prefetch, currentUserId: reader)

        XCTAssertEqual(served(sut)?.content, "")
        XCTAssertEqual(served(sut)?.isContentDecryptedOnDevice, false)
        XCTAssertTrue(ConversationPreviewRenderer.isSealed(try XCTUnwrap(served(sut))))
    }

    /// F1 (audit de #12722) : UN déchiffreur sert toutes les conversations de
    /// l'aperçu. Le même message (même identifiant, même cryptogramme), rejoué
    /// par un serveur malveillant dans la directe avec Carol après avoir été
    /// ouvert dans celle avec Bob, ne sort jamais du mémo : il reste scellé.
    func test_memo_neverOpensAnotherConversationsCiphertext() async throws {
        let bob = SymmetricKey(size: .bits256)
        let sealed = try sealedBase64("Code 4242", with: bob)
        let decryptor = DecryptionActor(provider: RoundTripSessionProvider(sessions: [
            "user-bob": bob.rawBytes, "user-carol": SymmetricKey(size: .bits256).rawBytes
        ]))
        func row(_ conversation: String, _ sender: String) -> Message {
            Message(
                id: messageId, conversationId: conversation, senderId: sender, content: sealed,
                originalLanguage: "fr", isEncrypted: true,
                createdAt: Date(timeIntervalSince1970: 1_000), updatedAt: Date(timeIntervalSince1970: 1_000)
            )
        }
        let sut = ConversationListPreviewLoader(
            messageService: MockMessageService(),
            cache: PerConversationPreviewCache(["cB": [row("cB", "user-bob")], "cC": [row("cC", "user-carol")]]),
            readerPrism: { ["fr"] },
            isLocked: { _ in false },
            decryptor: decryptor,
            directness: { $0 == "cB" ? .direct(peerUserId: "user-bob") : .direct(peerUserId: "user-carol") },
            locksDidChange: Empty<Void, Never>().eraseToAnyPublisher(),
            regimeMemory: EndToEndRegimeMemory(defaults: nil)
        )

        await sut.load(for: "cB", intent: .prefetch, currentUserId: reader)
        XCTAssertEqual(sut.state(for: "cB").snapshot?.messages.first?.content, "Code 4242", "précondition")
        await sut.load(for: "cC", intent: .prefetch, currentUserId: reader)

        XCTAssertEqual(sut.state(for: "cC").snapshot?.messages.first?.content, "", "le clair de Bob ne s'affiche jamais chez Carol")
        XCTAssertEqual(sut.state(for: "cC").snapshot?.messages.first?.isContentDecryptedOnDevice, false)
    }

    /// Mon propre message s'ouvre avec la session du PAIR : c'est la clé
    /// symétrique sous laquelle `SessionManager.encryptMessage(_:for:)` l'a
    /// scellé (m3). Aucune session n'est rangée sous le lecteur.
    func test_realDecryptionActor_readersOwnMessage_opensUnderThePeerSession() async throws {
        let key = SymmetricKey(size: .bits256)
        let sealed = try sealedBase64("J'arrive", with: key)
        let decryptor = DecryptionActor(provider: RoundTripSessionProvider(sessions: [peerId: key.rawBytes]))
        let (sut, _) = makeSUT(cache: .fresh([makeOwnCipherMessage(id: messageId, content: sealed)], age: 10), decryptor: decryptor)

        await sut.load(for: conversationId, intent: .prefetch, currentUserId: reader)

        XCTAssertEqual(served(sut)?.content, "J'arrive")
        XCTAssertEqual(served(sut)?.isContentDecryptedOnDevice, true)
    }

    // MARK: - Le pair local inconnu : scellé, jamais le cryptogramme

    func test_directConversationWithoutAKnownPeer_staysSealed_andAsksNothing() async {
        let decryptor = MockPreviewDecryptor(plaintexts: [messageId: "Rendez-vous à midi"])
        let (sut, _) = makeSUT(cache: .fresh([makeCipherMessage()], age: 10), decryptor: decryptor, directness: .direct(peerUserId: nil))

        await sut.load(for: conversationId, intent: .prefetch, currentUserId: reader)

        XCTAssertEqual(served(sut)?.content, "", "le placeholder scellé, jamais le cryptogramme")
        let calls = await decryptor.callCount
        XCTAssertEqual(calls, 0)
    }

    /// Le pair appris ensuite : rien n'avait été réputé réglé, `.ensure` ouvre.
    func test_peerLearnedLater_ensureOpensWhatWasSealed() async {
        let type = TypeBox(directness: .direct(peerUserId: nil))
        let decryptor = MockPreviewDecryptor(plaintexts: [messageId: "Rendez-vous à midi"])
        let sut = ConversationListPreviewLoader(
            messageService: MockMessageService(),
            cache: MockConversationPreviewCache(messages: .fresh([makeCipherMessage()], age: 10)),
            readerPrism: { ["fr"] },
            isLocked: { _ in false },
            decryptor: decryptor,
            directness: { _ in type.directness },
            locksDidChange: Empty<Void, Never>().eraseToAnyPublisher()
        )
        await sut.load(for: conversationId, intent: .prefetch, currentUserId: reader)
        XCTAssertEqual(served(sut)?.content, "", "précondition : pair inconnu ⇒ scellé")

        type.directness = .direct(peerUserId: peerId)
        await sut.load(for: conversationId, intent: .ensure, currentUserId: reader)

        XCTAssertEqual(served(sut)?.content, "Rendez-vous à midi")
    }

    /// Lecteur inconnu (session pas encore chargée) : aucune clé ne se cherche.
    func test_unknownReader_staysSealed() async {
        let decryptor = MockPreviewDecryptor(plaintexts: [messageId: "Rendez-vous à midi"])
        let (sut, _) = makeSUT(cache: .fresh([makeCipherMessage()], age: 10), decryptor: decryptor)

        await sut.load(for: conversationId, intent: .prefetch)

        XCTAssertEqual(served(sut)?.content, "")
        let calls = await decryptor.callCount
        XCTAssertEqual(calls, 0)
    }

    /// m2 : un type encore inconnu ne réputait la conversation que « cache
    /// périmé », et la demande suivante republiait le cache PLUS ANCIEN par-dessus
    /// la page réseau.
    func test_typeUnknownAfterNetwork_theOlderCacheNeverCoversTheNetworkPage() async {
        let older = Message(
            id: "000000000000000000000a00", conversationId: conversationId, senderId: peerId,
            content: "Ancien", originalLanguage: "fr",
            createdAt: Date(timeIntervalSince1970: 500), updatedAt: Date(timeIntervalSince1970: 500)
        )
        let decryptor = MockPreviewDecryptor(plaintexts: [messageId: "Rendez-vous à midi"])
        let (sut, service) = makeSUT(cache: .stale([older], age: 10_000), decryptor: decryptor, directness: nil)
        service.listResult = .success(encryptedPage())

        await sut.load(for: conversationId, intent: .open, currentUserId: reader)
        XCTAssertEqual(sut.state(for: conversationId).messages.map(\.id), [messageId], "précondition : la page réseau est servie")
        service.listResult = .failure(URLError(.notConnectedToInternet))

        await sut.load(for: conversationId, intent: .ensure, currentUserId: reader)

        XCTAssertEqual(sut.state(for: conversationId).messages.map(\.id), [messageId], "le cache ancien ne recouvre jamais le réseau")
    }

    func test_realDecryptionActor_wrongKey_staysSealed() async throws {
        let sealed = try sealedBase64("Rendez-vous à midi", with: SymmetricKey(size: .bits256))
        let other = SymmetricKey(size: .bits256)
        let decryptor = DecryptionActor(provider: RoundTripSessionProvider(sessions: ["user-other": other.rawBytes]))
        let (sut, _) = makeSUT(cache: .fresh([makeCipherMessage(content: sealed)], age: 10), decryptor: decryptor)

        await sut.load(for: conversationId, intent: .prefetch, currentUserId: reader)

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
        let (sut, _) = makeSUT(cache: .fresh([makeCipherMessage()], age: 10), decryptor: decryptor, directness: nil)

        await sut.load(for: conversationId, intent: .prefetch, directness: .direct(peerUserId: peerId), currentUserId: reader)

        XCTAssertEqual(served(sut)?.content, "Rendez-vous à midi")
    }

    func test_rowSaysGroup_neverDecrypts() async {
        let decryptor = MockPreviewDecryptor(plaintexts: [messageId: "Rendez-vous à midi"])
        let (sut, _) = makeSUT(cache: .fresh([makeCipherMessage()], age: 10), decryptor: decryptor)

        await sut.load(for: conversationId, intent: .prefetch, directness: .notDirect, currentUserId: reader)

        XCTAssertEqual(served(sut)?.content, "")
        let calls = await decryptor.callCount
        XCTAssertEqual(calls, 0)
    }

    /// Type encore inconnu : servi scellé, mais rien n'est réputé réglé — le
    /// chargement suivant retente dès que le type se sait.
    func test_typeUnknown_staysSealedThenEnsureRetries() async {
        let type = TypeBox(directness: nil)
        let decryptor = MockPreviewDecryptor(plaintexts: [messageId: "Rendez-vous à midi"])
        let service = MockMessageService()
        let sut = ConversationListPreviewLoader(
            messageService: service,
            cache: MockConversationPreviewCache(messages: .fresh([makeCipherMessage()], age: 10)),
            readerPrism: { ["fr"] },
            isLocked: { _ in false },
            decryptor: decryptor,
            directness: { _ in type.directness },
            locksDidChange: Empty<Void, Never>().eraseToAnyPublisher()
        )

        await sut.load(for: conversationId, intent: .prefetch, currentUserId: reader)
        XCTAssertEqual(served(sut)?.content, "", "précondition : type inconnu ⇒ scellé")

        type.directness = .direct(peerUserId: peerId)
        await sut.load(for: conversationId, intent: .ensure, currentUserId: reader)

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

        await sut.load(for: conversationId, intent: .prefetch, currentUserId: reader)

        XCTAssertFalse(log.phases.contains(.loading), "un cache non vide ne montre jamais de spinner")
        XCTAssertEqual(log.phases.last, .loaded)
        token.cancel()
    }

    // MARK: - Fail-closed

    func test_encryptedCache_sessionMissing_staysSealed() async {
        let decryptor = MockPreviewDecryptor(failures: [messageId: .missingSession])
        let (sut, _) = makeSUT(cache: .fresh([makeCipherMessage()], age: 10), decryptor: decryptor)

        await sut.load(for: conversationId, intent: .prefetch, currentUserId: reader)

        XCTAssertEqual(served(sut)?.content, "", "sans session, le placeholder scellé — jamais le cryptogramme")
        XCTAssertEqual(served(sut)?.isEncrypted, true)
        XCTAssertEqual(served(sut)?.isContentDecryptedOnDevice, false)
    }

    func test_encryptedRest_decryptionFails_staysSealed() async {
        let decryptor = MockPreviewDecryptor(failures: [messageId: .authenticationFailed])
        let (sut, service) = makeSUT(cache: .empty, decryptor: decryptor)
        service.listResult = .success(encryptedPage())

        await sut.load(for: conversationId, intent: .open, currentUserId: reader)

        XCTAssertEqual(served(sut)?.content, "")
        XCTAssertEqual(served(sut)?.isContentDecryptedOnDevice, false)
    }

    /// Le `DecryptionActor` rend `plaintext == nil` sans erreur quand le clair
    /// n'est pas de l'UTF-8 : rien n'est adopté.
    func test_encryptedCache_undecodablePlaintext_staysSealed() async {
        let decryptor = MockPreviewDecryptor(undecodable: [messageId])
        let (sut, _) = makeSUT(cache: .fresh([makeCipherMessage()], age: 10), decryptor: decryptor)

        await sut.load(for: conversationId, intent: .prefetch, currentUserId: reader)

        XCTAssertEqual(served(sut)?.content, "")
    }

    func test_encryptedCache_emptyPlaintext_staysSealed() async {
        let decryptor = MockPreviewDecryptor(plaintexts: [messageId: ""])
        let (sut, _) = makeSUT(cache: .fresh([makeCipherMessage()], age: 10), decryptor: decryptor)

        await sut.load(for: conversationId, intent: .prefetch, currentUserId: reader)

        XCTAssertEqual(served(sut)?.isContentDecryptedOnDevice, false)
        XCTAssertTrue(ConversationPreviewRenderer.isSealed(served(sut)!))
    }

    /// Le fil ne déchiffre que les conversations directes : l'aperçu n'en
    /// montre jamais plus que lui.
    func test_groupConversation_neverDecrypts() async {
        let decryptor = MockPreviewDecryptor(plaintexts: [messageId: "Rendez-vous à midi"])
        let (sut, _) = makeSUT(cache: .fresh([makeCipherMessage()], age: 10), decryptor: decryptor, directness: .notDirect)

        await sut.load(for: conversationId, intent: .prefetch, currentUserId: reader)

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

        await sut.load(for: conversationId, intent: .open, currentUserId: reader)

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

        await sut.load(for: conversationId, intent: .open, currentUserId: reader)
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
        await sut.load(for: conversationId, intent: .prefetch, currentUserId: reader)
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
        await sut.load(for: conversationId, intent: .prefetch, currentUserId: reader)
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
            directness: { _ in .direct(peerUserId: "user-other") },
            locksDidChange: Empty<Void, Never>().eraseToAnyPublisher()
        )
        await sut.load(for: conversationId, intent: .prefetch, currentUserId: reader)
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

        await sut.load(for: conversationId, intent: .prefetch, currentUserId: reader)

        XCTAssertNil(sut.state(for: conversationId).snapshot)
        XCTAssertTrue(sut.messages.isEmpty)
    }

    /// m1 : un `.open` qui attendait un préchargement en vol reprend APRÈS la
    /// purge — il ne republie rien, même sous une génération neuve.
    func test_openWaitingOnAPrefetch_resumedAfterThePurge_publishesNothing() async {
        let decryptor = MockPreviewDecryptor(plaintexts: [messageId: "Rendez-vous à midi"])
        let (sut, service) = makeSUT(cache: .fresh([makeCipherMessage()], age: 10), decryptor: decryptor)
        service.listResult = .success(encryptedPage())
        let once = Once()
        await decryptor.setOnDecrypt { if once.fire() { sut.purge() } }
        let reader = self.reader
        let id = conversationId

        let prefetch = Task { await sut.load(for: id, intent: .prefetch, currentUserId: reader) }
        await Task.yield()
        await sut.load(for: conversationId, intent: .open, currentUserId: reader)
        await prefetch.value

        XCTAssertNil(sut.state(for: conversationId).snapshot)
        XCTAssertTrue(sut.messages.isEmpty)
        XCTAssertEqual(service.listCallCount, 0, "rien ne revalide pour un compte sorti")
    }

    /// m1 : après la déconnexion, un chargement sans lecteur ne publie rien ;
    /// le lecteur suivant rouvre le chargeur.
    func test_afterLogout_aLoadWithoutAReaderPublishesNothing_untilAReaderSignsIn() async {
        let decryptor = MockPreviewDecryptor(plaintexts: [messageId: "Rendez-vous à midi"])
        let (sut, _) = makeSUT(cache: .fresh([makeCipherMessage()], age: 10), decryptor: decryptor)
        ConversationListPreviewLoader.purgeAllLive()

        await sut.load(for: conversationId, intent: .open, currentUserId: { "" })
        XCTAssertNil(sut.state(for: conversationId).snapshot, "session close : rien ne se republie")

        await sut.load(for: conversationId, intent: .prefetch, currentUserId: reader)
        XCTAssertEqual(served(sut)?.content, "Rendez-vous à midi", "un lecteur connecté rouvre le chargeur")
    }

    func test_purgeAllLive_purgesEveryLiveLoader() async {
        let decryptor = MockPreviewDecryptor(plaintexts: [messageId: "Rendez-vous à midi"])
        let (sut, _) = makeSUT(cache: .fresh([makeCipherMessage()], age: 10), decryptor: decryptor)
        await sut.load(for: conversationId, intent: .prefetch, currentUserId: reader)
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

        await sut.load(for: conversationId, intent: .open, currentUserId: reader)

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

        await sut.load(for: conversationId, intent: .open, currentUserId: reader)

        XCTAssertEqual(served(sut)?.content, "Déjà en clair")
        let calls = await decryptor.callCount
        XCTAssertEqual(calls, 0, "le clair prouvé du cache se sert sans repasser par le déchiffreur")
    }

    func test_reopenAfterDecryption_revalidatesWithoutDecryptingAgain() async {
        let decryptor = MockPreviewDecryptor(plaintexts: [messageId: "Rendez-vous à midi"])
        let (sut, service) = makeSUT(cache: .fresh([makeCipherMessage(updatedAt: restVersion)], age: 10), decryptor: decryptor)
        service.listResult = .success(encryptedPage())

        await sut.load(for: conversationId, intent: .prefetch, currentUserId: reader)
        await sut.load(for: conversationId, intent: .open, currentUserId: reader)

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

        await sut.load(for: conversationId, intent: .open, currentUserId: reader)

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

        await sut.load(for: conversationId, intent: .prefetch, currentUserId: reader)

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

    // MARK: - Les deux lois ensemble : le clair DÉCHIFFRÉ et le clair DÉCLARÉ (#11232 × #11380)

    private let forgedId = "000000000000000000000a02"
    private let endToEnd = EndToEndRegime(encryptionMode: "e2ee", enabledAt: nil)

    /// Ce qu'une passerelle compromise injecte : `isEncrypted: false` et un
    /// texte sous le nom d'un membre, dans l'ère chiffrée.
    private func makeForgedClearMessage(id: String? = nil) -> Message {
        Message(
            id: id ?? forgedId,
            conversationId: conversationId,
            senderId: "participant-other",
            content: "Envoie-moi le code",
            originalLanguage: "en",
            isEncrypted: false,
            createdAt: Date(timeIntervalSince1970: 1_000),
            updatedAt: Date(timeIntervalSince1970: 1_000),
            senderUserId: "user-other"
        )
    }

    private func wireTranslation(for messageId: String, text: String) -> MessageTranslation {
        MessageTranslation(
            id: "t-\(messageId)",
            messageId: messageId,
            sourceLanguage: "en",
            targetLanguage: "fr",
            translatedContent: text,
            translationModel: "nllb",
            confidenceScore: nil
        )
    }

    /// Un cryptogramme et un clair déclaré, chacun avec une traduction du serveur.
    private func mixedPage() -> MessagesAPIResponse {
        JSONStub.decode("""
        {"success":true,"data":[\
        {"id":"\(forgedId)","conversationId":"\(conversationId)","senderId":"participant-other","sender":{"id":"participant-other","userId":"user-other","type":"user"},"content":"Envoie-moi le code","originalLanguage":"en","isEncrypted":false,"createdAt":"2026-10-18T08:01:00.000Z","updatedAt":"2026-10-18T08:01:00.000Z","translations":[{"id":"t-b","messageId":"\(forgedId)","targetLanguage":"fr","translatedContent":"Envoie-moi le code, vite","sourceLanguage":"en"}]},\
        {"id":"\(messageId)","conversationId":"\(conversationId)","senderId":"participant-other","sender":{"id":"participant-other","userId":"user-other","type":"user"},"content":"\(ciphertext)","originalLanguage":"en","isEncrypted":true,"createdAt":"2026-10-18T08:00:00.000Z","updatedAt":"2026-10-18T08:00:00.000Z","translations":[{"id":"t-a","messageId":"\(messageId)","targetLanguage":"fr","translatedContent":"Forgé par le serveur","sourceLanguage":"en"}]}\
        ],"pagination":null,"cursorPagination":null,"hasNewer":null}
        """)
    }

    /// e2ee + déchiffré sur l'appareil ⇒ un clair normal : lu, sans marqueur,
    /// et sans la traduction que le serveur prétendrait en avoir faite.
    func test_endToEnd_decryptedOnDevice_readsAsOrdinaryClear_withoutWireTranslation() async throws {
        let decryptor = MockPreviewDecryptor(plaintexts: [messageId: "Rendez-vous à midi"])
        let (sut, _) = makeSUT(
            cache: .fresh([makeCipherMessage()], age: 10),
            cachedTranslations: [messageId: [wireTranslation(for: messageId, text: "Forgé par le serveur")]],
            decryptor: decryptor
        )

        await sut.load(for: conversationId, intent: .prefetch, regime: endToEnd, currentUserId: reader)

        let snapshot = try XCTUnwrap(sut.state(for: conversationId).snapshot)
        let message = try XCTUnwrap(served(sut))
        XCTAssertEqual(message.content, "Rendez-vous à midi")
        XCTAssertTrue(message.isContentDecryptedOnDevice)
        XCTAssertFalse(ConversationPreviewRenderer.isSealed(message))
        XCTAssertFalse(snapshot.isUnencrypted(messageId), "un clair déchiffré sur l'appareil n'est jamais « non chiffré »")
        XCTAssertNil(snapshot.servedTranslation(for: messageId), "le serveur ne lit pas ce message : il n'en traduit rien")
        XCTAssertNil(snapshot.translations[messageId])
    }

    /// e2ee + clair déclaré (`isEncrypted: false`) ⇒ marqué « non chiffré »,
    /// jamais envoyé au déchiffreur, jamais blanchi par une provenance.
    func test_endToEnd_forgedClearInCache_keepsItsMarker_andNeverReachesTheDecryptor() async throws {
        let decryptor = MockPreviewDecryptor(plaintexts: [messageId: "Rendez-vous à midi", forgedId: "Blanchi"])
        let (sut, _) = makeSUT(
            cache: .fresh([makeCipherMessage(), makeForgedClearMessage()], age: 10),
            cachedTranslations: [forgedId: [wireTranslation(for: forgedId, text: "Envoie-moi le code, vite")]],
            decryptor: decryptor
        )

        await sut.load(for: conversationId, intent: .prefetch, regime: endToEnd, currentUserId: reader)

        let snapshot = try XCTUnwrap(sut.state(for: conversationId).snapshot)
        let forged = try XCTUnwrap(snapshot.messages.first { $0.id == forgedId })
        XCTAssertEqual(forged.content, "Envoie-moi le code")
        XCTAssertFalse(forged.isContentDecryptedOnDevice)
        XCTAssertTrue(snapshot.isUnencrypted(forgedId))
        XCTAssertNil(snapshot.servedTranslation(for: forgedId))
        XCTAssertEqual(snapshot.messages.first { $0.id == messageId }?.content, "Rendez-vous à midi")
        XCTAssertFalse(snapshot.isUnencrypted(messageId))
        let payloads = await decryptor.receivedPayloads
        XCTAssertEqual(payloads.map(\.messageId), [messageId], "seul le cryptogramme part au déchiffreur")
    }

    /// Le même verdict sur le chemin réseau, où le REST porte les deux messages
    /// et leurs traductions du serveur.
    func test_endToEnd_restPage_decryptedAndForgedClear_eachKeepsItsLaw() async throws {
        let decryptor = MockPreviewDecryptor(plaintexts: [messageId: "Rendez-vous à midi", forgedId: "Blanchi"])
        let (sut, service) = makeSUT(cache: .empty, decryptor: decryptor)
        service.listResult = .success(mixedPage())

        await sut.load(for: conversationId, intent: .open, regime: endToEnd, currentUserId: reader)

        let snapshot = try XCTUnwrap(sut.state(for: conversationId).snapshot)
        let byId = Dictionary(uniqueKeysWithValues: snapshot.messages.map { ($0.id, $0) })
        XCTAssertEqual(byId[messageId]?.content, "Rendez-vous à midi")
        XCTAssertEqual(byId[messageId]?.isContentDecryptedOnDevice, true)
        XCTAssertFalse(snapshot.isUnencrypted(messageId))
        XCTAssertEqual(byId[forgedId]?.content, "Envoie-moi le code", "le déchiffreur ne réécrit jamais un message déclaré en clair")
        XCTAssertEqual(byId[forgedId]?.isContentDecryptedOnDevice, false)
        XCTAssertTrue(snapshot.isUnencrypted(forgedId))
        XCTAssertNil(snapshot.servedTranslation(for: messageId))
        XCTAssertNil(snapshot.servedTranslation(for: forgedId))
        let payloads = await decryptor.receivedPayloads
        XCTAssertEqual(payloads.map(\.messageId), [messageId])
    }

    /// Un résultat qui porterait l'identifiant d'un message déclaré en clair
    /// (même identifiant qu'un cryptogramme, ou déchiffreur fautif) n'adopte
    /// rien : la provenance ne s'obtient que pour ce qu'on a demandé de déchiffrer.
    func test_adopting_neverLaundersAMessageDeclaredClear() {
        let forged = makeForgedClearMessage(id: messageId)
        let results = [DecryptionResult(messageId: messageId, plaintext: "Blanchi", error: nil)]

        XCTAssertNil(ConversationListPreviewLoader.adopting(results, into: [forged], under: peer))
        let snapshot = ConversationListPreviewLoader.snapshot(
            messages: [forged], translations: [:], prism: ["fr"], regime: endToEnd
        )
        XCTAssertTrue(snapshot.isUnencrypted(messageId))
    }

    /// e2ee + échec du déchiffrement ⇒ scellé : ni texte, ni marqueur « non
    /// chiffré » (un scellé n'a rien dit en clair), ni traduction du serveur.
    func test_endToEnd_decryptionFails_staysSealed_withoutMarkerNorTranslation() async throws {
        let decryptor = MockPreviewDecryptor(failures: [messageId: .authenticationFailed])
        let (sut, _) = makeSUT(
            cache: .fresh([makeCipherMessage()], age: 10),
            cachedTranslations: [messageId: [wireTranslation(for: messageId, text: "Forgé par le serveur")]],
            decryptor: decryptor
        )

        await sut.load(for: conversationId, intent: .prefetch, regime: endToEnd, currentUserId: reader)

        let snapshot = try XCTUnwrap(sut.state(for: conversationId).snapshot)
        let message = try XCTUnwrap(served(sut))
        XCTAssertEqual(message.content, "")
        XCTAssertFalse(message.isContentDecryptedOnDevice)
        XCTAssertTrue(ConversationPreviewRenderer.isSealed(message))
        XCTAssertEqual(ConversationPreviewRenderer.sealedReason(message), .encrypted)
        XCTAssertFalse(snapshot.isUnencrypted(messageId))
        XCTAssertNil(snapshot.servedTranslation(for: messageId))
    }

    /// Hors e2ee, rien ne change : le clair se lit, traduit par le serveur,
    /// sans marqueur, et le déchiffreur n'est pas appelé.
    func test_serverReadable_clearMessage_isUnchanged() async throws {
        let decryptor = MockPreviewDecryptor()
        let (sut, _) = makeSUT(
            cache: .fresh([makeForgedClearMessage()], age: 10),
            cachedTranslations: [forgedId: [wireTranslation(for: forgedId, text: "Envoie-moi le code, vite")]],
            decryptor: decryptor
        )

        await sut.load(for: conversationId, intent: .prefetch, regime: .serverReadable, currentUserId: reader)

        let snapshot = try XCTUnwrap(sut.state(for: conversationId).snapshot)
        XCTAssertEqual(snapshot.messages.first?.content, "Envoie-moi le code")
        XCTAssertFalse(snapshot.isUnencrypted(forgedId))
        XCTAssertEqual(snapshot.servedTranslation(for: forgedId)?.translatedContent, "Envoie-moi le code, vite")
        let calls = await decryptor.callCount
        XCTAssertEqual(calls, 0)
    }

    /// Verrouillée par PIN (#11387) ⇒ rien : ni clair, ni marqueur, ni
    /// déchiffrement, ni réseau — quel que soit le régime.
    func test_endToEnd_lockedConversation_showsNeitherPlaintextNorMarker() async {
        let decryptor = MockPreviewDecryptor(plaintexts: [messageId: "Rendez-vous à midi"])
        let (sut, service) = makeSUT(
            cache: .fresh([makeCipherMessage(), makeForgedClearMessage()], age: 10),
            decryptor: decryptor,
            isLocked: { _ in true }
        )
        service.listResult = .success(mixedPage())

        await sut.load(for: conversationId, intent: .open, regime: endToEnd, currentUserId: reader)

        XCTAssertEqual(sut.state(for: conversationId).phase, .sealed)
        XCTAssertNil(sut.state(for: conversationId).snapshot)
        XCTAssertNil(sut.messages[conversationId])
        XCTAssertEqual(sut.fingerprint(for: conversationId).entries, [])
        XCTAssertEqual(service.listCallCount, 0)
        let calls = await decryptor.callCount
        XCTAssertEqual(calls, 0)
    }

    /// La déconnexion purge aussi ce que la loi du clair avait servi.
    func test_purge_afterEndToEndLoad_leavesNeitherPlaintextNorMarker() async {
        let decryptor = MockPreviewDecryptor(plaintexts: [messageId: "Rendez-vous à midi"])
        let (sut, _) = makeSUT(
            cache: .fresh([makeCipherMessage(), makeForgedClearMessage()], age: 10), decryptor: decryptor
        )
        await sut.load(for: conversationId, intent: .prefetch, regime: endToEnd, currentUserId: reader)
        XCTAssertEqual(sut.state(for: conversationId).snapshot?.isUnencrypted(forgedId), true)

        sut.purge()

        XCTAssertEqual(sut.state(for: conversationId).phase, .loading)
        XCTAssertNil(sut.state(for: conversationId).snapshot)
        XCTAssertNil(sut.messages[conversationId])
    }

    // MARK: - Une seule construction

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

/// Un cache dont chaque conversation sert ses propres lignes.
@MainActor
private struct PerConversationPreviewCache: ConversationPreviewCacheProviding {
    let byConversation: [String: [Message]]
    init(_ byConversation: [String: [Message]]) { self.byConversation = byConversation }

    func messages(for conversationId: String) async -> CacheResult<[Message]> {
        .fresh(byConversation[conversationId] ?? [], age: 10)
    }

    func translations(for messageIds: [String]) async -> [String: [MessageTranslation]] { [:] }
}

/// Compte les déchiffreurs fabriqués : une purge en reconstruit un.
private final class DecryptorFactory {
    private let plaintexts: [String: String]
    private(set) var made = 0

    init(plaintexts: [String: String]) {
        self.plaintexts = plaintexts
    }

    func make() -> any OnDeviceMessageDecrypting {
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
extension MockPreviewDecryptor: OnDeviceMessageDecrypting {}
