import Combine
import XCTest
import MeeshyE2EE
import MeeshySDK
@testable import Meeshy

/// L'aperçu d'appui long d'une conversation CHIFFRÉE (#11232) : ses derniers
/// messages se lisent en clair SUR L'APPAREIL, par la source unique que le fil
/// lit aussi (#3707) — la base scellée où libsignal a rangé ce que CET appareil
/// a ouvert ou écrit, posée par `EndToEndThreadPlaintexts`. L'aperçu ne
/// déchiffre rien lui-même. Le clair adopté porte sa provenance ; tout ce qui
/// ne s'adopte pas reste scellé, jamais servi comme le littéral du serveur ;
/// une conversation verrouillée ne lit ni ne montre rien ; et rien de clair ne
/// repart au serveur.
@MainActor
final class ConversationListPreviewDecryptionTests: XCTestCase {

    private let conversationId = "000000000000000000000c01"
    private let messageId = "000000000000000000000a01"
    private let restVersion = Date(timeIntervalSince1970: 1_792_310_400)
    private let peerId = "user-other"
    private let reader: @MainActor @Sendable () -> String = { "user-me" }

    private final class PhaseLog {
        var phases: [ConversationPreviewPhase?] = []
    }

    @MainActor
    private final class PinLock {
        nonisolated deinit {}
        var isLocked = false
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

    /// Une barrière : `wait()` suspend jusqu'à `open()`. Elle rend un ordre
    /// GARANTI là où un `Task.yield()` ne le rendait que probable (#12766).
    private actor Gate {
        private var isOpen = false
        private var waiters: [CheckedContinuation<Void, Never>] = []

        func wait() async {
            guard !isOpen else { return }
            await withCheckedContinuation { waiters.append($0) }
        }

        func open() {
            isOpen = true
            waiters.forEach { $0.resume() }
            waiters = []
        }
    }

    // MARK: - Fabriques

    private func makeSUT(
        cache: CacheResult<[Message]> = .empty,
        cachedTranslations: [String: [MessageTranslation]] = [:],
        endToEnd: MockEndToEndMessaging = MockEndToEndMessaging(),
        isLocked: @escaping @MainActor (String) -> Bool = { _ in false },
        locksDidChange: AnyPublisher<Void, Never> = Empty<Void, Never>().eraseToAnyPublisher(),
        sessionsDidBegin: AnyPublisher<Void, Never> = Empty<Void, Never>().eraseToAnyPublisher()
    ) -> (sut: ConversationListPreviewLoader, service: MockMessageService) {
        let service = MockMessageService()
        let sut = ConversationListPreviewLoader(
            messageService: service,
            cache: MockConversationPreviewCache(messages: cache, translations: cachedTranslations),
            readerPrism: { ["fr"] },
            isLocked: isLocked,
            endToEnd: endToEnd,
            locksDidChange: locksDidChange,
            regimeMemory: EndToEndRegimeMemory(defaults: nil),
            sessionsDidBegin: sessionsDidBegin
        )
        return (sut, service)
    }

    /// Ce que l'appareil a ouvert : le clair, sa conversation, et l'auteur que
    /// libsignal a authentifié.
    private func endToEnd(_ plaintexts: [String: String], by author: String? = nil, in conversation: String? = nil) -> MockEndToEndMessaging {
        let mock = MockEndToEndMessaging()
        plaintexts.forEach { id, text in mock.store(opened(text, by: author ?? peerId, in: conversation), for: id) }
        return mock
    }

    private func opened(_ text: String, by author: String, in conversation: String? = nil, clientMessageId: String? = nil) -> E2EEPlaintextEntry {
        .readable(
            E2EEContent(text: text, language: "fr", replyTo: nil, conversationId: conversation ?? conversationId, clientMessageId: clientMessageId, sentAt: Date()),
            senderUserId: author
        )
    }

    /// Un message chiffré tel qu'une LIGNE GRDB le rend (`MessageRecord.toMessage`) :
    /// le littéral servi, `senderId` l'utilisateur résolu à l'ingestion, et
    /// `senderUserId` ABSENT — il n'est posé que pour le lecteur.
    private func makeSealedMessage(
        id: String? = nil,
        conversation: String? = nil,
        updatedAt: Date = Date(timeIntervalSince1970: 1_000),
        senderId: String = "user-other",
        senderUserId: String? = nil,
        clientMessageId: String? = nil,
        isMe: Bool = false
    ) -> Message {
        Message(
            id: id ?? messageId,
            clientMessageId: clientMessageId,
            conversationId: conversation ?? conversationId,
            senderId: senderId,
            content: E2EEWire.contentPlaceholder,
            originalLanguage: "fr",
            isEncrypted: true,
            encryptionMode: E2EEWire.mode,
            createdAt: Date(timeIntervalSince1970: 1_000),
            updatedAt: updatedAt,
            senderUserId: senderUserId,
            isMe: isMe
        )
    }

    /// Mon propre message, ligne GRDB : `toMessage` pose `senderUserId` pour le lecteur.
    private func makeOwnSealedMessage(clientMessageId: String? = nil) -> Message {
        makeSealedMessage(senderId: "user-me", senderUserId: "user-me", clientMessageId: clientMessageId, isMe: true)
    }

    private func encryptedPage(author: String = "user-other") -> MessagesAPIResponse {
        JSONStub.decode("""
        {"success":true,"data":[{"id":"\(messageId)","conversationId":"\(conversationId)","senderId":"participant-other","sender":{"id":"participant-other","userId":"\(author)","type":"user"},"content":"\(E2EEWire.contentPlaceholder)","originalLanguage":"fr","isEncrypted":true,"encryptionMode":"e2ee","createdAt":"2026-10-18T08:00:00.000Z","updatedAt":"2026-10-18T08:00:00.000Z","translations":[]}],"pagination":null,"cursorPagination":null,"hasNewer":null}
        """)
    }

    private func served(_ sut: ConversationListPreviewLoader) -> Message? {
        sut.state(for: conversationId).snapshot?.messages.first
    }

    // MARK: - Le clair ouvert sur l'appareil

    func test_encryptedCache_openedOnThisDevice_servesThePlaintextWithItsProvenance() async {
        let e2ee = endToEnd([messageId: "Rendez-vous à midi"])
        let (sut, _) = makeSUT(cache: .fresh([makeSealedMessage()], age: 10), endToEnd: e2ee)

        await sut.load(for: conversationId, intent: .prefetch, currentUserId: reader)

        XCTAssertEqual(served(sut)?.content, "Rendez-vous à midi")
        XCTAssertEqual(served(sut)?.isContentDecryptedOnDevice, true, "le clair porte sa provenance")
        XCTAssertEqual(e2ee.requestedPlaintextKeys, [messageId])
    }

    func test_encryptedRest_openedOnThisDevice_servesThePlaintext() async {
        let e2ee = endToEnd([messageId: "Rendez-vous à midi"])
        let (sut, service) = makeSUT(cache: .empty, endToEnd: e2ee)
        service.listResult = .success(encryptedPage())

        await sut.load(for: conversationId, intent: .open, currentUserId: reader)

        XCTAssertEqual(served(sut)?.content, "Rendez-vous à midi")
        XCTAssertEqual(served(sut)?.isContentDecryptedOnDevice, true)
    }

    /// Mon propre message est rangé sous son identifiant CLIENT avant l'accusé.
    func test_myOwnMessage_readsUnderItsClientIdentifier() async {
        let e2ee = MockEndToEndMessaging()
        e2ee.store(opened("J'arrive", by: "user-me", clientMessageId: "cid_1"), for: "cid_1")
        let (sut, _) = makeSUT(cache: .fresh([makeOwnSealedMessage(clientMessageId: "cid_1")], age: 10), endToEnd: e2ee)

        await sut.load(for: conversationId, intent: .prefetch, currentUserId: reader)

        XCTAssertEqual(served(sut)?.content, "J'arrive")
    }

    // MARK: - À SA place, ou scellé

    /// Le même identifiant rejoué par un serveur malveillant dans une autre
    /// conversation n'y ouvre pas le clair de la première.
    func test_plaintextOfAnotherConversation_staysSealed() async {
        let e2ee = endToEnd([messageId: "Code 4242"], in: "000000000000000000000c02")
        let (sut, _) = makeSUT(cache: .fresh([makeSealedMessage()], age: 10), endToEnd: e2ee)

        await sut.load(for: conversationId, intent: .prefetch, currentUserId: reader)

        XCTAssertEqual(served(sut)?.content, "", "le scellé, jamais le littéral du serveur")
        XCTAssertEqual(served(sut)?.isContentDecryptedOnDevice, false)
        XCTAssertEqual(e2ee.requestedPlaintextKeys, [messageId], "le clair est cherché, puis refusé hors de sa conversation")
    }

    /// Un serveur compromis présente MON message comme celui du pair : la ligne
    /// GRDB n'a pas `senderUserId`, son `senderId` dit l'auteur, et le clair
    /// authentifié comme le mien ne s'y adopte pas.
    func test_myPlaintextPresentedAsThePeers_staysSealed() async throws {
        let e2ee = endToEnd([messageId: "Mon secret"], by: "user-me")
        let (sut, _) = makeSUT(cache: .fresh([makeSealedMessage()], age: 10), endToEnd: e2ee)

        await sut.load(for: conversationId, intent: .prefetch, currentUserId: reader)

        XCTAssertEqual(served(sut)?.content, "")
        XCTAssertTrue(ConversationPreviewRenderer.isSealed(try XCTUnwrap(served(sut))))
        XCTAssertEqual(e2ee.requestedPlaintextKeys, [messageId], "le clair est cherché, puis refusé sous un autre auteur")
    }

    func test_authorNeitherPeerNorReader_staysSealed() async {
        let e2ee = endToEnd([messageId: "Rendez-vous à midi"])
        let (sut, _) = makeSUT(cache: .fresh([makeSealedMessage(senderId: "user-eve")], age: 10), endToEnd: e2ee)

        await sut.load(for: conversationId, intent: .prefetch, currentUserId: reader)

        XCTAssertEqual(served(sut)?.content, "")
        XCTAssertEqual(served(sut)?.isContentDecryptedOnDevice, false)
        XCTAssertEqual(e2ee.requestedPlaintextKeys, [messageId], "le clair est cherché, puis refusé à l'auteur annoncé")
    }

    func test_nothingOpenedOnThisDevice_staysSealed() async {
        let e2ee = MockEndToEndMessaging()
        let (sut, _) = makeSUT(cache: .fresh([makeSealedMessage()], age: 10), endToEnd: e2ee)

        await sut.load(for: conversationId, intent: .prefetch, currentUserId: reader)

        XCTAssertEqual(served(sut)?.content, "", "sans clair, le placeholder scellé — jamais « [Encrypted] »")
        XCTAssertEqual(served(sut)?.isEncrypted, true)
        XCTAssertEqual(served(sut)?.isContentDecryptedOnDevice, false)
        XCTAssertEqual(e2ee.requestedPlaintextKeys, [messageId], "la base scellée est interrogée, et ne rend rien")
    }

    func test_undecryptableOnThisDevice_staysSealed() async {
        let e2ee = MockEndToEndMessaging()
        e2ee.store(.undecryptable, for: messageId)
        let (sut, service) = makeSUT(cache: .empty, endToEnd: e2ee)
        service.listResult = .success(encryptedPage())

        await sut.load(for: conversationId, intent: .open, currentUserId: reader)

        XCTAssertEqual(served(sut)?.content, "")
        XCTAssertEqual(served(sut)?.isContentDecryptedOnDevice, false)
        XCTAssertEqual(e2ee.requestedPlaintextKeys, [messageId], "la base scellée est interrogée, et dit l'échec")
    }

    /// Cache-first : le cache se sert sans que l'aperçu dise « chargement ».
    func test_encryptedCache_neverShowsASpinnerWhileReading() async {
        let (sut, _) = makeSUT(cache: .fresh([makeSealedMessage()], age: 10), endToEnd: endToEnd([messageId: "Rendez-vous à midi"]))
        let log = PhaseLog()
        let id = conversationId
        let token = sut.$states.sink { log.phases.append($0[id]?.phase) }

        await sut.load(for: conversationId, intent: .prefetch, currentUserId: reader)

        XCTAssertFalse(log.phases.contains(.loading), "un cache non vide ne montre jamais de spinner")
        XCTAssertEqual(log.phases.last, .loaded)
        token.cancel()
    }

    // MARK: - Verrou PIN

    func test_lockedConversation_readsNothingAndShowsNothing() async {
        let e2ee = endToEnd([messageId: "Rendez-vous à midi"])
        let (sut, service) = makeSUT(cache: .fresh([makeSealedMessage()], age: 10), endToEnd: e2ee, isLocked: { _ in true })
        service.listResult = .success(encryptedPage())

        await sut.load(for: conversationId, intent: .open, currentUserId: reader)

        XCTAssertEqual(sut.state(for: conversationId).phase, .sealed)
        XCTAssertNil(sut.state(for: conversationId).snapshot)
        XCTAssertEqual(e2ee.plaintextsCallCount, 0, "une conversation verrouillée ne lit aucun clair")
    }

    /// Le verrou se pose PENDANT la lecture : le clair n'est jamais publié, et
    /// lever le verrou ensuite ne le fait pas réapparaître.
    func test_lockDuringReading_neverPublishesThePlaintext() async {
        let pin = PinLock()
        let e2ee = endToEnd([messageId: "Rendez-vous à midi"])
        e2ee.onPlaintexts = { pin.isLocked = true }
        let (sut, service) = makeSUT(cache: .fresh([makeSealedMessage()], age: 10), endToEnd: e2ee, isLocked: { _ in pin.isLocked })
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

    /// Poser un verrou PURGE le clair déjà servi — masquer ne suffit pas.
    func test_lockPosted_purgesThePlaintextFromMemory() async {
        let pin = PinLock()
        let locks = PassthroughSubject<Void, Never>()
        let (sut, _) = makeSUT(
            cache: .fresh([makeSealedMessage()], age: 10), endToEnd: endToEnd([messageId: "Rendez-vous à midi"]),
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

    func test_lockAppearsAfterReading_dropsThePlaintext() async {
        let pin = PinLock()
        let (sut, _) = makeSUT(
            cache: .fresh([makeSealedMessage()], age: 10), endToEnd: endToEnd([messageId: "Rendez-vous à midi"]),
            isLocked: { _ in pin.isLocked }
        )
        await sut.load(for: conversationId, intent: .prefetch, currentUserId: reader)
        XCTAssertEqual(served(sut)?.content, "Rendez-vous à midi", "précondition")

        pin.isLocked = true

        XCTAssertEqual(sut.state(for: conversationId).phase, .sealed)
        XCTAssertTrue(sut.messages.isEmpty)
    }

    // MARK: - Purge à la déconnexion

    func test_purge_dropsThePlaintext() async {
        let (sut, _) = makeSUT(cache: .fresh([makeSealedMessage()], age: 10), endToEnd: endToEnd([messageId: "Rendez-vous à midi"]))
        await sut.load(for: conversationId, intent: .prefetch, currentUserId: reader)
        XCTAssertEqual(served(sut)?.content, "Rendez-vous à midi", "précondition")

        sut.purge()

        XCTAssertNil(sut.state(for: conversationId).snapshot)
        XCTAssertEqual(sut.state(for: conversationId).phase, .loading)
        XCTAssertTrue(sut.messages.isEmpty)
    }

    /// Une lecture en vol à la déconnexion ne publie rien après la purge.
    func test_purgeDuringReading_publishesNothingAfterwards() async {
        let e2ee = endToEnd([messageId: "Rendez-vous à midi"])
        let (sut, _) = makeSUT(cache: .fresh([makeSealedMessage()], age: 10), endToEnd: e2ee)
        e2ee.onPlaintexts = { sut.purge() }

        await sut.load(for: conversationId, intent: .prefetch, currentUserId: reader)

        XCTAssertNil(sut.state(for: conversationId).snapshot)
        XCTAssertTrue(sut.messages.isEmpty)
    }

    /// Un `.open` qui attendait un préchargement en vol reprend APRÈS la purge :
    /// il ne republie rien, même sous une génération neuve. L'ordre est tenu par
    /// deux barrières : le préchargement est EN VOL (dans la lecture de la base
    /// scellée) avant que l'ouverture ne parte, et il ne reprend — pour purger —
    /// qu'une fois l'ouverture suspendue à l'attendre (#12766).
    func test_openWaitingOnAPrefetch_resumedAfterThePurge_publishesNothing() async {
        let e2ee = endToEnd([messageId: "Rendez-vous à midi"])
        let (sut, service) = makeSUT(cache: .fresh([makeSealedMessage()], age: 10), endToEnd: e2ee)
        service.listResult = .success(encryptedPage())
        let once = Once()
        let prefetchReading = Gate()
        let openWaiting = Gate()
        e2ee.onPlaintexts = {
            guard once.fire() else { return }
            await prefetchReading.open()
            await openWaiting.wait()
            sut.purge()
        }
        let reader = self.reader
        let id = conversationId

        let prefetch = Task { await sut.load(for: id, intent: .prefetch, currentUserId: reader) }
        await prefetchReading.wait()
        // Sur le fil principal, cette tâche ne part qu'une fois l'ouverture
        // ci-dessous suspendue à attendre le préchargement.
        Task { @MainActor in await openWaiting.open() }
        await sut.load(for: conversationId, intent: .open, currentUserId: reader)
        await prefetch.value

        XCTAssertNil(sut.state(for: conversationId).snapshot)
        XCTAssertTrue(sut.messages.isEmpty)
        XCTAssertEqual(service.listCallCount, 0, "rien ne revalide pour un compte sorti")
    }

    /// Après la déconnexion, un chargement sans lecteur ne publie rien ; le
    /// lecteur suivant rouvre le chargeur.
    func test_afterLogout_aLoadWithoutAReaderPublishesNothing_untilAReaderSignsIn() async {
        let (sut, _) = makeSUT(cache: .fresh([makeSealedMessage()], age: 10), endToEnd: endToEnd([messageId: "Rendez-vous à midi"]))
        ConversationListPreviewLoader.purgeAllLive()

        await sut.load(for: conversationId, intent: .open, currentUserId: { "" })
        XCTAssertNil(sut.state(for: conversationId).snapshot, "session close : rien ne se republie")

        await sut.load(for: conversationId, intent: .prefetch, currentUserId: reader)
        XCTAssertEqual(served(sut)?.content, "Rendez-vous à midi", "un lecteur connecté rouvre le chargeur")
    }

    /// #12766 — un chargement qui lit encore l'identifiant du compte SORTI (le
    /// lecteur n'est pas encore retombé à vide quand la déconnexion purge) ne
    /// rouvre pas le chargeur ; un autre lecteur, si.
    func test_afterThePurge_theSignedOutReader_publishesNothing_andANewReaderReopens() async {
        let (sut, _) = makeSUT(cache: .fresh([makeSealedMessage()], age: 10), endToEnd: endToEnd([messageId: "Rendez-vous à midi"]))
        await sut.load(for: conversationId, intent: .prefetch, currentUserId: reader)
        XCTAssertEqual(served(sut)?.content, "Rendez-vous à midi", "précondition")

        sut.purge()
        await sut.load(for: conversationId, intent: .open, currentUserId: reader)
        XCTAssertNil(sut.state(for: conversationId).snapshot, "le compte sorti ne rouvre pas le chargeur")

        await sut.load(for: conversationId, intent: .prefetch, currentUserId: { "user-next" })
        XCTAssertEqual(sut.state(for: conversationId).phase, .loaded, "un nouveau lecteur rouvre le chargeur")
    }

    /// Le compte sorti est refusé même s'il n'avait encore rien chargé : la
    /// déconnexion le nomme.
    func test_purgeNamingTheSignedOutAccount_refusesIt_beforeItEverLoaded() async {
        let (sut, _) = makeSUT(cache: .fresh([makeSealedMessage()], age: 10), endToEnd: endToEnd([messageId: "Rendez-vous à midi"]))

        sut.purge(signedOutUserId: "user-me")
        await sut.load(for: conversationId, intent: .prefetch, currentUserId: reader)

        XCTAssertNil(sut.state(for: conversationId).snapshot)
    }

    /// Le même compte qui se RECONNECTE retrouve son aperçu : c'est la
    /// connexion neuve qui le réarme, jamais la seule lecture de son identifiant.
    func test_theSignedOutAccount_signingBackIn_reopensTheLoader() async {
        let sessions = PassthroughSubject<Void, Never>()
        let (sut, _) = makeSUT(
            cache: .fresh([makeSealedMessage()], age: 10), endToEnd: endToEnd([messageId: "Rendez-vous à midi"]),
            sessionsDidBegin: sessions.eraseToAnyPublisher()
        )
        await sut.load(for: conversationId, intent: .prefetch, currentUserId: reader)
        sut.purge()

        sessions.send(())
        await sut.load(for: conversationId, intent: .prefetch, currentUserId: reader)

        XCTAssertEqual(served(sut)?.content, "Rendez-vous à midi")
    }

    func test_purgeAllLive_purgesEveryLiveLoader() async {
        let (sut, _) = makeSUT(cache: .fresh([makeSealedMessage()], age: 10), endToEnd: endToEnd([messageId: "Rendez-vous à midi"]))
        await sut.load(for: conversationId, intent: .prefetch, currentUserId: reader)
        XCTAssertEqual(served(sut)?.content, "Rendez-vous à midi", "précondition")

        ConversationListPreviewLoader.purgeAllLive()

        XCTAssertNil(sut.state(for: conversationId).snapshot)
    }

    // MARK: - Cache-first : ce qui est lu ne se relit pas

    /// Ouverture sur un cache chiffré : pendant la lecture, l'aperçu montre
    /// déjà le cache (scellé), jamais un chargement.
    func test_openOnEncryptedCache_showsTheCacheWhileReading() async {
        let observed = Observed()
        let e2ee = endToEnd([messageId: "Rendez-vous à midi"])
        let (sut, service) = makeSUT(cache: .fresh([makeSealedMessage(updatedAt: restVersion)], age: 10), endToEnd: e2ee)
        service.listResult = .success(encryptedPage())
        let id = conversationId
        e2ee.onPlaintexts = { observed.phases.append(sut.state(for: id).phase) }
        let log = PhaseLog()
        let token = sut.$states.sink { log.phases.append($0[id]?.phase) }

        await sut.load(for: conversationId, intent: .open, currentUserId: reader)

        XCTAssertEqual(observed.phases.first, .loaded, "le cache est servi avant que la lecture ne rende")
        XCTAssertFalse(log.phases.contains(.loading), "un cache non vide ne montre jamais de spinner")
        token.cancel()
    }

    func test_cacheAlreadyInClear_neverReadsTheStore() async {
        var known = makeSealedMessage(updatedAt: restVersion)
        known.adoptDecryptedContent("Déjà en clair")
        let e2ee = endToEnd([messageId: "Autre chose"])
        let (sut, service) = makeSUT(cache: .fresh([known], age: 10), endToEnd: e2ee)
        service.listResult = .success(encryptedPage())

        await sut.load(for: conversationId, intent: .open, currentUserId: reader)

        XCTAssertEqual(served(sut)?.content, "Déjà en clair")
        XCTAssertEqual(e2ee.plaintextsCallCount, 0, "le clair prouvé du cache se sert sans relire la base scellée")
    }

    func test_reopenAfterReading_revalidatesWithoutReadingAgain() async {
        let e2ee = endToEnd([messageId: "Rendez-vous à midi"])
        let (sut, service) = makeSUT(cache: .fresh([makeSealedMessage(updatedAt: restVersion)], age: 10), endToEnd: e2ee)
        service.listResult = .success(encryptedPage())

        await sut.load(for: conversationId, intent: .prefetch, currentUserId: reader)
        await sut.load(for: conversationId, intent: .open, currentUserId: reader)

        XCTAssertEqual(served(sut)?.content, "Rendez-vous à midi")
        XCTAssertEqual(service.listCallCount, 1, "précondition : le réseau a revalidé")
        XCTAssertEqual(e2ee.plaintextsCallCount, 1)
    }

    /// La revalidation ne recouvre pas d'un clair déjà servi un message que le
    /// serveur réattribue à un autre auteur : il repasse par la règle du fil,
    /// et l'auteur authentifié par libsignal le laisse scellé.
    func test_revalidation_messageReattributedByTheServer_staysSealed() async {
        let e2ee = endToEnd([messageId: "Rendez-vous à midi"])
        let (sut, service) = makeSUT(cache: .fresh([makeSealedMessage(updatedAt: restVersion)], age: 10), endToEnd: e2ee)
        await sut.load(for: conversationId, intent: .prefetch, currentUserId: reader)
        XCTAssertEqual(served(sut)?.content, "Rendez-vous à midi", "précondition")
        service.listResult = .success(encryptedPage(author: "user-eve"))

        await sut.load(for: conversationId, intent: .open, currentUserId: reader)

        XCTAssertEqual(served(sut)?.content, "")
        XCTAssertEqual(served(sut)?.isContentDecryptedOnDevice, false)
        XCTAssertEqual(e2ee.requestedPlaintextKeys, [messageId, messageId],
                       "le message réattribué repasse par la base scellée, qui le refuse sous le nouvel auteur")
    }

    // MARK: - Ce qui part à côté

    /// La seule requête est une LECTURE, et elle ne transporte que ce qui
    /// désigne la page : ni texte, ni recherche, ni langue d'un clair.
    func test_plaintextOnDevice_neverReachesTheServer() async {
        let e2ee = endToEnd([messageId: "Rendez-vous à midi"])
        let (sut, service) = makeSUT(cache: .fresh([makeSealedMessage()], age: 10), endToEnd: e2ee)
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
        XCTAssertEqual(e2ee.deliverCallCount, 0, "rien n'est scellé ni remis")
        XCTAssertNil(sut.state(for: conversationId).snapshot?.servedTranslation(for: messageId),
                     "aucune traduction serveur ne double un clair lu sur l'appareil")
    }

    /// F3 (audit de #12722) : un appui long ne fait sortir aucun lien d'un
    /// clair lu sur l'appareil — ni OpenGraph vers un site tiers, ni carte de
    /// conversation interrogée au serveur.
    func test_plaintextWithALink_mountsNoLinkEmbed() {
        var opened = makeSealedMessage()
        opened.adoptDecryptedContent("Le dossier : https://exemple.org/dossier-secret")
        let clear = Message(
            id: "000000000000000000000a09", conversationId: conversationId, senderId: peerId,
            content: "Le dossier : https://exemple.org/dossier", originalLanguage: "fr"
        )

        XCTAssertFalse(ConversationPreviewRenderer.mountsLinkEmbed(for: opened))
        XCTAssertFalse(ConversationPreviewRenderer.mountsLinkEmbed(for: makeSealedMessage()))
        XCTAssertTrue(ConversationPreviewRenderer.mountsLinkEmbed(for: clear), "un clair ordinaire garde sa carte de lien")
    }

    /// La règle ne vaut que si l'unique monteur des cartes de lien la lit, et
    /// si l'aperçu la pose par message.
    func test_linkEmbedGate_isReadByTheEmbedAndPostedByThePreview() throws {
        let views = Self.appRoot.appendingPathComponent("Meeshy/Features/Main/Views")
        let embed = AppSourceGuard.stripComments(try String(contentsOf: views.appendingPathComponent("Bubble/BubbleLinkEmbed.swift"), encoding: .utf8))
        let preview = AppSourceGuard.stripComments(try String(contentsOf: views.appendingPathComponent("ConversationRecentMessagesPreview.swift"), encoding: .utf8))

        XCTAssertTrue(embed.contains("if mountsLinkEmbeds"))
        XCTAssertTrue(preview.contains(".environment(\\.mountsLinkEmbeds, ConversationPreviewRenderer.mountsLinkEmbed(for: message))"))
    }

    /// Une flamme « après lecture » reçue n'est pas lue pour la liste — et ne
    /// s'y montre pas même si l'aperçu en a déjà le clair.
    func test_receivedAfterReadFlame_isNeitherReadNorShown() async {
        var burning = makeSealedMessage()
        burning.effects = MessageEffects(flags: [.ephemeral, .ephemeralAfterRead])
        var burningKnown = makeSealedMessage(id: "000000000000000000000a02")
        burningKnown.effects = MessageEffects(flags: [.ephemeral, .ephemeralAfterRead])
        burningKnown.adoptDecryptedContent("secret qui brûle")
        let e2ee = endToEnd([messageId: "secret qui brûle"])
        let (sut, _) = makeSUT(cache: .fresh([burning, burningKnown], age: 10), endToEnd: e2ee)

        await sut.load(for: conversationId, intent: .prefetch, currentUserId: reader)

        XCTAssertEqual(sut.state(for: conversationId).messages.map(\.content), ["", ""])
        XCTAssertEqual(e2ee.plaintextsCallCount, 0)
    }

    func test_openedMessage_changesTheRowFingerprint() {
        var opened = makeSealedMessage()
        opened.adoptDecryptedContent("Rendez-vous à midi")
        let sealed = ConversationListPreviewLoader.snapshot(messages: [makeSealedMessage()], translations: [:], prism: ["fr"])
        let clear = ConversationListPreviewLoader.snapshot(messages: [opened], translations: [:], prism: ["fr"])

        XCTAssertNotEqual(
            ConversationPreviewFingerprint(state: .loaded(sealed)),
            ConversationPreviewFingerprint(state: .loaded(clear)),
            "un message qui passe de scellé à lu ré-évalue la rangée"
        )
    }

    // MARK: - Les deux lois ensemble : le clair LU et le clair DÉCLARÉ (#11232 × #11380)

    private let forgedId = "000000000000000000000a02"
    private let endToEndRegime = EndToEndRegime(encryptionMode: "e2ee", enabledAt: nil)

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

    /// Un message chiffré et un clair déclaré, chacun avec une traduction du serveur.
    private func mixedPage() -> MessagesAPIResponse {
        JSONStub.decode("""
        {"success":true,"data":[\
        {"id":"\(forgedId)","conversationId":"\(conversationId)","senderId":"participant-other","sender":{"id":"participant-other","userId":"user-other","type":"user"},"content":"Envoie-moi le code","originalLanguage":"en","isEncrypted":false,"createdAt":"2026-10-18T08:01:00.000Z","updatedAt":"2026-10-18T08:01:00.000Z","translations":[{"id":"t-b","messageId":"\(forgedId)","targetLanguage":"fr","translatedContent":"Envoie-moi le code, vite","sourceLanguage":"en"}]},\
        {"id":"\(messageId)","conversationId":"\(conversationId)","senderId":"participant-other","sender":{"id":"participant-other","userId":"user-other","type":"user"},"content":"\(E2EEWire.contentPlaceholder)","originalLanguage":"en","isEncrypted":true,"encryptionMode":"e2ee","createdAt":"2026-10-18T08:00:00.000Z","updatedAt":"2026-10-18T08:00:00.000Z","translations":[{"id":"t-a","messageId":"\(messageId)","targetLanguage":"fr","translatedContent":"Forgé par le serveur","sourceLanguage":"en"}]}\
        ],"pagination":null,"cursorPagination":null,"hasNewer":null}
        """)
    }

    /// e2ee + lu sur l'appareil ⇒ un clair normal : lu, sans marqueur, et
    /// sans la traduction que le serveur prétendrait en avoir faite.
    func test_endToEnd_openedOnDevice_readsAsOrdinaryClear_withoutWireTranslation() async throws {
        let (sut, _) = makeSUT(
            cache: .fresh([makeSealedMessage()], age: 10),
            cachedTranslations: [messageId: [wireTranslation(for: messageId, text: "Forgé par le serveur")]],
            endToEnd: endToEnd([messageId: "Rendez-vous à midi"])
        )

        await sut.load(for: conversationId, intent: .prefetch, regime: endToEndRegime, currentUserId: reader)

        let snapshot = try XCTUnwrap(sut.state(for: conversationId).snapshot)
        let message = try XCTUnwrap(served(sut))
        XCTAssertEqual(message.content, "Rendez-vous à midi")
        XCTAssertTrue(message.isContentDecryptedOnDevice)
        XCTAssertFalse(ConversationPreviewRenderer.isSealed(message))
        XCTAssertFalse(snapshot.isUnencrypted(messageId), "un clair lu sur l'appareil n'est jamais « non chiffré »")
        XCTAssertNil(snapshot.servedTranslation(for: messageId), "le serveur ne lit pas ce message : il n'en traduit rien")
        XCTAssertNil(snapshot.translations[messageId])
    }

    /// e2ee + clair déclaré (`isEncrypted: false`) ⇒ marqué « non chiffré »,
    /// jamais cherché dans la base scellée, jamais blanchi par une provenance.
    func test_endToEnd_forgedClearInCache_keepsItsMarker_andIsNeverLookedUp() async throws {
        let e2ee = endToEnd([messageId: "Rendez-vous à midi", forgedId: "Blanchi"])
        let (sut, _) = makeSUT(
            cache: .fresh([makeSealedMessage(), makeForgedClearMessage()], age: 10),
            cachedTranslations: [forgedId: [wireTranslation(for: forgedId, text: "Envoie-moi le code, vite")]],
            endToEnd: e2ee
        )

        await sut.load(for: conversationId, intent: .prefetch, regime: endToEndRegime, currentUserId: reader)

        let snapshot = try XCTUnwrap(sut.state(for: conversationId).snapshot)
        let forged = try XCTUnwrap(snapshot.messages.first { $0.id == forgedId })
        XCTAssertEqual(forged.content, "Envoie-moi le code")
        XCTAssertFalse(forged.isContentDecryptedOnDevice)
        XCTAssertTrue(snapshot.isUnencrypted(forgedId))
        XCTAssertNil(snapshot.servedTranslation(for: forgedId))
        XCTAssertEqual(snapshot.messages.first { $0.id == messageId }?.content, "Rendez-vous à midi")
        XCTAssertFalse(snapshot.isUnencrypted(messageId))
        XCTAssertEqual(e2ee.requestedPlaintextKeys, [messageId], "seul le message chiffré est cherché")
    }

    /// Le même verdict sur le chemin réseau, où le REST porte les deux messages
    /// et leurs traductions du serveur.
    func test_endToEnd_restPage_openedAndForgedClear_eachKeepsItsLaw() async throws {
        let e2ee = endToEnd([messageId: "Rendez-vous à midi", forgedId: "Blanchi"])
        let (sut, service) = makeSUT(cache: .empty, endToEnd: e2ee)
        service.listResult = .success(mixedPage())

        await sut.load(for: conversationId, intent: .open, regime: endToEndRegime, currentUserId: reader)

        let snapshot = try XCTUnwrap(sut.state(for: conversationId).snapshot)
        let byId = Dictionary(uniqueKeysWithValues: snapshot.messages.map { ($0.id, $0) })
        XCTAssertEqual(byId[messageId]?.content, "Rendez-vous à midi")
        XCTAssertEqual(byId[messageId]?.isContentDecryptedOnDevice, true)
        XCTAssertFalse(snapshot.isUnencrypted(messageId))
        XCTAssertEqual(byId[forgedId]?.content, "Envoie-moi le code", "la base scellée ne réécrit jamais un message déclaré en clair")
        XCTAssertEqual(byId[forgedId]?.isContentDecryptedOnDevice, false)
        XCTAssertTrue(snapshot.isUnencrypted(forgedId))
        XCTAssertNil(snapshot.servedTranslation(for: messageId))
        XCTAssertNil(snapshot.servedTranslation(for: forgedId))
        XCTAssertEqual(e2ee.requestedPlaintextKeys, [messageId])
    }

    /// Une entrée qui porterait l'identifiant d'un message déclaré en clair
    /// n'adopte rien : la provenance ne s'obtient que pour ce qui est chiffré.
    func test_adopting_neverLaundersAMessageDeclaredClear() {
        let forged = makeForgedClearMessage(id: messageId)

        XCTAssertNil(ConversationListPreviewLoader.adopting(
            [messageId: opened("Blanchi", by: peerId)], into: [forged], conversationId: conversationId
        ))
        let snapshot = ConversationListPreviewLoader.snapshot(
            messages: [forged], translations: [:], prism: ["fr"], regime: endToEndRegime
        )
        XCTAssertTrue(snapshot.isUnencrypted(messageId))
    }

    /// e2ee + rien d'ouvert ⇒ scellé : ni texte, ni marqueur « non chiffré »
    /// (un scellé n'a rien dit en clair), ni traduction du serveur.
    func test_endToEnd_nothingOpened_staysSealed_withoutMarkerNorTranslation() async throws {
        let e2ee = MockEndToEndMessaging()
        let (sut, _) = makeSUT(
            cache: .fresh([makeSealedMessage()], age: 10),
            cachedTranslations: [messageId: [wireTranslation(for: messageId, text: "Forgé par le serveur")]],
            endToEnd: e2ee
        )

        await sut.load(for: conversationId, intent: .prefetch, regime: endToEndRegime, currentUserId: reader)

        let snapshot = try XCTUnwrap(sut.state(for: conversationId).snapshot)
        let message = try XCTUnwrap(served(sut))
        XCTAssertEqual(message.content, "")
        XCTAssertFalse(message.isContentDecryptedOnDevice)
        XCTAssertTrue(ConversationPreviewRenderer.isSealed(message))
        XCTAssertEqual(ConversationPreviewRenderer.sealedReason(message), .encrypted)
        XCTAssertFalse(snapshot.isUnencrypted(messageId))
        XCTAssertNil(snapshot.servedTranslation(for: messageId))
        XCTAssertEqual(e2ee.requestedPlaintextKeys, [messageId], "la base scellée est interrogée, et ne rend rien")
    }

    /// Hors e2ee, rien ne change : le clair se lit, traduit par le serveur,
    /// sans marqueur, et la base scellée n'est pas lue.
    func test_serverReadable_clearMessage_isUnchanged() async throws {
        let e2ee = MockEndToEndMessaging()
        let (sut, _) = makeSUT(
            cache: .fresh([makeForgedClearMessage()], age: 10),
            cachedTranslations: [forgedId: [wireTranslation(for: forgedId, text: "Envoie-moi le code, vite")]],
            endToEnd: e2ee
        )

        await sut.load(for: conversationId, intent: .prefetch, regime: .serverReadable, currentUserId: reader)

        let snapshot = try XCTUnwrap(sut.state(for: conversationId).snapshot)
        XCTAssertEqual(snapshot.messages.first?.content, "Envoie-moi le code")
        XCTAssertFalse(snapshot.isUnencrypted(forgedId))
        XCTAssertEqual(snapshot.servedTranslation(for: forgedId)?.translatedContent, "Envoie-moi le code, vite")
        XCTAssertEqual(e2ee.plaintextsCallCount, 0)
    }

    /// Verrouillée par PIN (#11387) ⇒ rien : ni clair, ni marqueur, ni
    /// lecture, ni réseau — quel que soit le régime.
    func test_endToEnd_lockedConversation_showsNeitherPlaintextNorMarker() async {
        let e2ee = endToEnd([messageId: "Rendez-vous à midi"])
        let (sut, service) = makeSUT(
            cache: .fresh([makeSealedMessage(), makeForgedClearMessage()], age: 10),
            endToEnd: e2ee,
            isLocked: { _ in true }
        )
        service.listResult = .success(mixedPage())

        await sut.load(for: conversationId, intent: .open, regime: endToEndRegime, currentUserId: reader)

        XCTAssertEqual(sut.state(for: conversationId).phase, .sealed)
        XCTAssertNil(sut.state(for: conversationId).snapshot)
        XCTAssertNil(sut.messages[conversationId])
        XCTAssertEqual(sut.fingerprint(for: conversationId).entries, [])
        XCTAssertEqual(service.listCallCount, 0)
        XCTAssertEqual(e2ee.plaintextsCallCount, 0)
    }

    /// La déconnexion purge aussi ce que la loi du clair avait servi.
    func test_purge_afterEndToEndLoad_leavesNeitherPlaintextNorMarker() async {
        let (sut, _) = makeSUT(
            cache: .fresh([makeSealedMessage(), makeForgedClearMessage()], age: 10),
            endToEnd: endToEnd([messageId: "Rendez-vous à midi"])
        )
        await sut.load(for: conversationId, intent: .prefetch, regime: endToEndRegime, currentUserId: reader)
        XCTAssertEqual(sut.state(for: conversationId).snapshot?.isUnencrypted(forgedId), true)

        sut.purge()

        XCTAssertEqual(sut.state(for: conversationId).phase, .loading)
        XCTAssertNil(sut.state(for: conversationId).snapshot)
        XCTAssertNil(sut.messages[conversationId])
    }

    // MARK: - Une seule source de clair

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

    /// Le fil et l'aperçu lisent le clair de la MÊME base scellée (#3707) :
    /// aucun site de l'app ne rouvre le déchiffreur hérité, dont une seconde
    /// voie avait déjà divergé (gardes, clé d'expéditeur).
    func test_noProductionSiteReopensTheLegacyDecryptor() throws {
        let files = productionSources()
        XCTAssertGreaterThan(files.count, 500, "la garde ne mesurerait RIEN : le dossier Meeshy est introuvable")
        let legacy = try files.filter { url in
            let source = AppSourceGuard.stripComments(try String(contentsOf: url, encoding: .utf8))
            return source.contains("DecryptionActor(") || source.contains("DecryptionPayload(")
        }
        XCTAssertEqual(legacy.map(\.lastPathComponent), [])
    }
}
