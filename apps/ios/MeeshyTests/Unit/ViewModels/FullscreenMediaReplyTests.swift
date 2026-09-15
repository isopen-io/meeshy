import XCTest
import GRDB
@testable import Meeshy
import MeeshySDK

/// **Répondre à la pièce qu'on REGARDE, depuis son plein écran** (#6165), et
/// la moitié ÉCRITURE de #6164 qui en est la condition.
///
/// Trois témoins, et le deuxième est celui qui coûte :
///
/// 1. la citation composée depuis le plein écran NOMME la pièce regardée ;
/// 2. l'ancre atteint le CORPS REST — et un envoi qui la porte ne part JAMAIS
///    par le socket, qui ne la transporte pas ;
/// 3. une pièce protégée ne se cite pas, ni par sa vignette, ni du tout.
///
/// **Tout est écrit sur la TROISIÈME pièce d'un lot de cinq** (leçon 261) : au
/// rang 1, le court-circuit « le représentatif » et la règle juste « la pièce
/// nommée » rendent le MÊME verdict, donc un témoin écrit sur la première ne
/// peut pas tomber. C'est exactement le cas NOMINAL du lot — une galerie
/// n'existe que parce qu'un message porte plusieurs pièces.
///
/// Aucun témoin ne lit de texte source : chacun instancie le ViewModel, appelle
/// une méthode, et observe un EFFET — la référence rendue, le corps REST capté
/// par le service factice, le compteur d'appels du socket factice.
/// Le réseau et l'outbox sont INJECTÉS, jamais empruntés aux singletons : sans
/// eux, `sendMessage` bascule sur la branche hors-ligne dès que la machine de
/// test n'a pas de lien, et le témoin qui mesure le TRANSPORT rendrait vert
/// pour la mauvaise raison — l'ancre n'aurait jamais atteint aucun corps.
private final class FullscreenReplyNetworkMonitor: NetworkMonitorProviding, @unchecked Sendable {
    var isOnline: Bool
    init(isOnline: Bool = true) { self.isOnline = isOnline }
}

@MainActor
final class FullscreenMediaReplyTests: XCTestCase {

    private let conversationId = "000000000000000000000001"
    private let myUserId = "000000000000000000000099"
    private let otherUserId = "000000000000000000000002"

    private var messageService: MockMessageService!
    private var messageSocket: MockMessageSocket!

    override func setUp() async throws {
        try await super.setUp()
        MessageSocketManager.shared.isConnected = false
        APIClient.shared.anonymousSessionToken = nil
    }

    override func tearDown() async throws {
        APIClient.shared.anonymousSessionToken = nil
        messageService = nil
        messageSocket = nil
        offlineQueue = nil
        try await super.tearDown()
    }

    // MARK: - Fabriques

    private var offlineQueue: FakeOfflineMessageQueue!

    private func makeSUT(isOnline: Bool = true) -> ConversationViewModel {
        let authManager = MockAuthManager()
        authManager.simulateLoggedIn(user: MeeshyUser(
            id: myUserId, username: "me", displayName: "Me",
            systemLanguage: "fr", regionalLanguage: nil, deviceLocale: "fr"
        ))

        let pool = try! makeInMemoryPool()
        offlineQueue = FakeOfflineMessageQueue()
        messageService = MockMessageService()
        messageSocket = MockMessageSocket()
        let sut = ConversationViewModel(
            conversationId: conversationId,
            unreadCount: 0,
            isDirect: false,
            participantUserId: nil,
            anonymousSession: nil,
            authManager: authManager,
            messageService: messageService,
            conversationService: MockConversationService(),
            reactionService: MockReactionService(),
            reportService: MockReportService(),
            messageSocket: messageSocket,
            dependencies: ConversationDependencies(
                dbPool: pool,
                persistence: MessagePersistenceActor(dbWriter: pool)
            ),
            networkMonitor: FullscreenReplyNetworkMonitor(isOnline: isOnline),
            offlineQueue: offlineQueue
        )
        sut.start()
        return sut
    }

    private func makeInMemoryPool() throws -> DatabaseQueue {
        let db = try DatabaseQueue()
        try MessageDatabaseMigrations.runAll(on: db)
        return db
    }

    private func makePhoto(_ rank: Int, isViewOnce: Bool = false, isBlurred: Bool = false) -> MessageAttachment {
        MessageAttachment(
            id: "piece-\(rank)",
            mimeType: "image/jpeg",
            fileSize: 100_000 + rank,
            fileUrl: "https://cdn.meeshy.me/piece-\(rank).jpg",
            isViewOnce: isViewOnce,
            isBlurred: isBlurred,
            width: 1000 + rank,
            height: 700 + rank,
            thumbnailUrl: "https://cdn.meeshy.me/piece-\(rank)-t.jpg",
            thumbHash: "hash-\(rank)"
        )
    }

    /// Un carrousel de CINQ photos — la seule forme dans laquelle une galerie
    /// existe, et donc la seule dans laquelle ce lot a un sens.
    private func makeCarousel(protectedRank: Int? = nil) -> Message {
        let pieces = (1...5).map { rank in
            makePhoto(rank, isViewOnce: protectedRank == rank)
        }
        return Message(
            id: "carrousel",
            conversationId: conversationId,
            senderId: otherUserId,
            content: "",
            originalLanguage: "fr",
            attachments: pieces,
            senderName: "Bob",
            senderColor: "FF8800",
            senderAvatarURL: "https://cdn.meeshy.me/bob.jpg",
            isMe: false
        )
    }

    // MARK: - Témoin 1 — la citation NOMME la pièce regardée

    func test_citationDuPleinEcran_ancreLaTroisiemePiece_pasLeRepresentatif() {
        let sut = makeSUT()
        let carrousel = makeCarousel()
        sut.messages = [carrousel]
        let troisieme = carrousel.attachments[2]

        let citation = sut.optimisticReplyReference(quoting: carrousel, citing: troisieme)

        XCTAssertEqual(citation.attachmentId, "piece-3",
                       "on regardait la troisième photo : la citation doit la NOMMER, pas emprunter la première")
        XCTAssertEqual(citation.attachmentThumbnailUrl, "https://cdn.meeshy.me/piece-3-t.jpg")
        XCTAssertEqual(citation.attachmentThumbHash, "hash-3")
        XCTAssertEqual(citation.attachmentWidth, 1003)
        XCTAssertEqual(citation.attachmentFileSize, 100_003)
    }

    /// Le contrôle du témoin de rang : SANS pièce nommée, la règle d'avant ce
    /// lot est intacte — le représentatif, c'est-à-dire la première. Sans lui,
    /// un correctif qui nommerait TOUJOURS la première passerait le témoin
    /// ci-dessus… et celui-ci aussi ; les deux ENSEMBLE ne laissent que la
    /// règle juste.
    func test_citationSansPieceNommee_gardeLeRepresentatif() {
        let sut = makeSUT()
        let carrousel = makeCarousel()
        sut.messages = [carrousel]

        let citation = sut.optimisticReplyReference(quoting: carrousel)

        XCTAssertEqual(citation.attachmentId, "piece-1",
                       "aucune citation existante ne change de rendu")
    }

    /// Nommer une pièce qui n'appartient PAS au message cité est une ancre que
    /// la passerelle REFUSERAIT (`admitAttachmentReply` : « la pièce jointe
    /// citée n'appartient pas au message cité »). Le client ne la compose donc
    /// pas : il retombe sur le représentatif, comme une réponse ordinaire.
    func test_citationDUnePieceEtrangere_retombeSurLeRepresentatif() {
        let sut = makeSUT()
        let carrousel = makeCarousel()
        sut.messages = [carrousel]
        let etrangere = makePhoto(42)

        let citation = sut.optimisticReplyReference(quoting: carrousel, citing: etrangere)

        XCTAssertEqual(citation.attachmentId, "piece-1")
    }

    // MARK: - Témoin 3 — une pièce protégée ne se cite pas avec sa vignette

    func test_citationDUnePieceProtegee_nEmporteNiVignetteNiThumbHash() {
        let sut = makeSUT()
        let carrousel = makeCarousel(protectedRank: 3)
        sut.messages = [carrousel]
        let troisieme = carrousel.attachments[2]

        let citation = sut.optimisticReplyReference(quoting: carrousel, citing: troisieme)

        XCTAssertEqual(citation.attachmentId, "piece-3",
                       "l'ancre n'est pas un secret : elle sert le saut, et le verrou vit à l'ouverture")
        XCTAssertNil(citation.attachmentThumbnailUrl,
                     "une vue unique ne sort pas de la conversation par la vignette d'une citation")
        XCTAssertNil(citation.attachmentThumbHash,
                     "le ThumbHash EST une image : il ne voyage pas non plus")
        XCTAssertEqual(citation.attachmentIsProtected, true)
    }

    /// La garde du BOUTON, mesurée sur l'effet : l'envoi en place REFUSE une
    /// pièce protégée. Sans elle, une barre montée par un autre chemin (un
    /// raccourci clavier, un futur geste) contournerait la règle d'affichage.
    func test_envoiEnPlace_surUnePieceProtegee_nEnvoieRien() async {
        let sut = makeSUT()
        let carrousel = makeCarousel(protectedRank: 3)
        sut.messages = [carrousel]

        let envoye = await sut.sendReplyToAttachment(
            attachmentId: "piece-3", text: "je la vois", language: "fr"
        )

        XCTAssertFalse(envoye)
        XCTAssertEqual(messageService.sendCallCount, 0,
                       "rien ne part : une pièce protégée ne se cite pas")
    }

    // MARK: - Témoin 2 — l'ancre atteint le CORPS, et ne prend pas le socket

    func test_envoiEnPlace_porteLAncreDeLaTroisiemePiece_dansLeCorpsREST() async {
        let sut = makeSUT()
        let carrousel = makeCarousel()
        sut.messages = [carrousel]

        let envoye = await sut.sendReplyToAttachment(
            attachmentId: "piece-3", text: "elle est floue celle-là", language: "fr"
        )

        XCTAssertTrue(envoye)
        XCTAssertEqual(messageService.lastSendRequest?.replyToId, "carrousel")
        XCTAssertEqual(messageService.lastSendRequest?.attachmentReplyTo?.attachmentId, "piece-3",
                       "la citation composée porte l'identifiant de la pièce REGARDÉE")
        XCTAssertEqual(messageService.lastSendRequest?.content, "elle est floue celle-là")
    }

    /// **Le socket ne transporte pas l'ancre, et ne fera pas semblant.**
    ///
    /// `admitAttachmentReply` n'est wiré que sur la route REST
    /// (`messages-send.ts`) ; `MessageHandler.ts` ne lit `attachmentReplyTo`
    /// nulle part. Un envoi porteur d'ancre passé par le socket-first
    /// arriverait donc SANS elle — et la citation montrerait la photo 1 pour
    /// une réponse composée sur la photo 3. Le défaut serait invisible : le
    /// message part, l'accusé revient, seule la citation ment.
    ///
    /// Le socket est ici CONNECTÉ et son ACK est prêt : sans la garde, il
    /// gagnerait. Le témoin observe donc bien un CHOIX, pas une absence.
    func test_unEnvoiAvecAncre_nePrendPasLeSocketFirst() async {
        let sut = makeSUT()
        let carrousel = makeCarousel()
        sut.messages = [carrousel]
        messageSocket.isConnected = true
        messageSocket.sendViaSocketFallbackResult = MessageSocketManager.SendMessageAck(
            messageId: "srv-1", clientMessageId: nil, createdAt: Date()
        )

        _ = await sut.sendReplyToAttachment(
            attachmentId: "piece-3", text: "regarde la troisième", language: "fr"
        )

        XCTAssertEqual(messageSocket.sendViaSocketFallbackCallCount, 0,
                       "le canal socket ne porte pas l'ancre : un envoi qui en a une lui est inéligible")
        XCTAssertEqual(messageService.sendCallCount, 1,
                       "c'est le POST REST qui l'emporte — le seul transport que la garde serveur admet")
        XCTAssertEqual(messageService.lastSendRequest?.attachmentReplyTo?.attachmentId, "piece-3")
    }

    /// Le CONTRÔLE de la garde ci-dessus : un message SANS ancre garde le
    /// chemin rapide. Sans ce témoin, désactiver le socket-first pour tout le
    /// monde passerait le précédent au vert en cassant la latence d'envoi de
    /// toute l'application.
    func test_unEnvoiSansAncre_prendToujoursLeSocketFirst() async {
        let sut = makeSUT()
        messageSocket.isConnected = true
        messageSocket.sendViaSocketFallbackResult = MessageSocketManager.SendMessageAck(
            messageId: "srv-1", clientMessageId: nil, createdAt: Date()
        )

        _ = await sut.sendMessage(content: "bonjour")

        XCTAssertEqual(messageSocket.sendViaSocketFallbackCallCount, 1)
        XCTAssertEqual(messageService.sendCallCount, 0)
    }

    /// **L'ancre survit à la FILE.** Hors ligne, la réponse est enfilée et
    /// rejouée plus tard par `OutboxDispatcher` — qui repasse toujours par le
    /// POST REST, le canal socket étant déclaré inéligible juste au-dessus.
    /// Sans ce champ sur `OfflineQueueItem`, un simple métro sous tunnel
    /// suffisait à faire citer la PREMIÈRE photo d'un carrousel à une réponse
    /// composée sur la troisième — et le défaut ne se voyait qu'après coup,
    /// dans le fil, une fois l'envoi parti.
    func test_horsLigne_laFileGardeLAncreDeLaPieceRegardee() async {
        let sut = makeSUT(isOnline: false)
        let carrousel = makeCarousel()
        sut.messages = [carrousel]

        _ = await sut.sendReplyToAttachment(
            attachmentId: "piece-3", text: "sous le tunnel", language: "fr"
        )

        let enfiles = await offlineQueue.enqueuedItems
        XCTAssertEqual(enfiles.count, 1)
        XCTAssertEqual(enfiles.first?.replyToId, "carrousel")
        XCTAssertEqual(enfiles.first?.attachmentReplyTo, "piece-3",
                       "la file rejoue le POST REST : elle doit porter l'ancre, sinon le rejeu cite la première pièce")
    }

    // MARK: - Témoin 1 bis — le plein écran n'émet AUCUNE fermeture

    /// **Ce que le bouton « répondre » FAIT dépend de ce que l'hôte a câblé**,
    /// et c'est la seule décision du lot qui puisse mentir.
    ///
    /// Avant #6165, répondre depuis le plein écran REFERMAIT la galerie pour
    /// rendre la main au composer du fil : on perdait la pièce des yeux au
    /// moment précis où l'on voulait en parler. La route `.composeInPlace` est
    /// celle qui ne referme rien — et l'hôte ne peut plus la confondre avec
    /// l'ancienne, parce qu'elles ne sont plus le même cas.
    func test_laRouteDuBouton_repondreEnPlaceQuandLHoteSaitComposer() {
        XCTAssertEqual(
            FullscreenReplyRoute.route(isProtected: false, hasInPlaceComposer: true, hasThreadHandOff: true),
            .composeInPlace,
            "l'hôte qui sait composer sur place l'emporte : la galerie reste ouverte"
        )
    }

    func test_laRouteDuBouton_ancienCheminQuandLHoteNeSaitPasComposerEnPlace() {
        XCTAssertEqual(
            FullscreenReplyRoute.route(isProtected: false, hasInPlaceComposer: false, hasThreadHandOff: true),
            .handOffToThread,
            "les hôtes SOCIAUX gardent l'ancien chemin tant qu'ils ne câblent pas la barre"
        )
    }

    func test_laRouteDuBouton_aucuneOffreSurUnePieceProtegee() {
        XCTAssertEqual(
            FullscreenReplyRoute.route(isProtected: true, hasInPlaceComposer: true, hasThreadHandOff: true),
            .none,
            "une pièce protégée n'a même pas d'entrée vers le geste"
        )
        XCTAssertEqual(
            FullscreenReplyRoute.route(isProtected: false, hasInPlaceComposer: false, hasThreadHandOff: false),
            .none,
            "un contrôle existe s'il a un effet (loi 4)"
        )
    }
}
