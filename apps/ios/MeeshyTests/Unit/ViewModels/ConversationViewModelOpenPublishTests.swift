import XCTest
import Combine
import GRDB
@testable import Meeshy
import MeeshySDK

/// L'OUVERTURE d'une conversation (#4943) — ce que l'utilisateur voit dans la
/// seconde qui suit le tap.
///
/// Deux chemins lisaient la même fenêtre GRDB et la republiaient chacun : le
/// `Task { await messageStore.loadInitial() }` de `start()`, non attendu, et le
/// `loadInitialSnapshot()` + `apply()` de `loadMessages()`. Sur une conversation
/// déjà en cache — le cas NOMINAL — la liste se re-disposait deux à trois fois
/// pour un contenu identique, chaque republication réveillant le sink du
/// ViewModel ET un `applySnapshot()` O(n) de la liste.
///
/// Les témoins de cette suite portent donc sur des NOMBRES : combien de lectures
/// de fenêtre, combien de publications, combien d'appels réseau. C'est la seule
/// forme qui distingue « ça marche » de « ça n'a plus lieu deux fois ».
@MainActor
final class ConversationViewModelOpenPublishTests: XCTestCase {

    private let conversationId = "000000000000000000000001"
    private let myUserId = "000000000000000000000099"
    private let otherUserId = "000000000000000000000002"

    private var messageService: MockMessageService!

    override func setUp() async throws {
        try await super.setUp()
        await CacheCoordinator.shared.messages.invalidate(for: conversationId)
        messageService = MockMessageService()
        MessageSocketManager.shared.isConnected = false
    }

    override func tearDown() async throws {
        messageService = nil
        try await super.tearDown()
    }

    // MARK: - Factory

    private func makeSUT(dbPool: DatabaseQueue) -> (
        sut: ConversationViewModel,
        persistence: MessagePersistenceActor
    ) {
        let authManager = MockAuthManager()
        authManager.simulateLoggedIn(
            user: MeeshyUser(id: myUserId, username: "me", displayName: "Me")
        )
        let persistence = MessagePersistenceActor(dbWriter: dbPool)
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
            messageSocket: MockMessageSocket(),
            dependencies: ConversationDependencies(dbPool: dbPool, persistence: persistence)
        )
        // Le `.task` de la vue : `start()` puis `loadMessages()`.
        sut.start()
        return (sut, persistence)
    }

    private func makeInMemoryPool() throws -> DatabaseQueue {
        let db = try DatabaseQueue()
        try MessageDatabaseMigrations.runAll(on: db)
        return db
    }

    private func seed(_ count: Int, into pool: DatabaseQueue) async throws {
        let base = Date().addingTimeInterval(-3_600)
        let records: [MessageRecord] = (0..<count).map { i in
            var record = MessageStoreObservationHelper.makeRecord(
                localId: "seed-\(i)", conversationId: conversationId,
                senderId: otherUserId, content: "message \(i)",
                state: .delivered, createdAt: base.addingTimeInterval(TimeInterval(i))
            )
            record.cachedTimeString = MessageRecord.computeTimeString(for: record.createdAt)
            return record
        }
        try await pool.write { db in
            for record in records { try record.insert(db) }
        }
    }

    // MARK: - `start()` n'est plus un chemin de lecture

    /// La première lecture appartient à `loadMessages()`, seul point qui lit
    /// APRÈS le drain des messages pré-récupérés par la NSE et la
    /// réconciliation des lignes d'envoi orphelines. Une lecture lancée par
    /// `start()` les manquerait toutes et publierait une fenêtre incomplète
    /// avant que les traductions ne soient hydratées.
    func test_start_neLitPasLaFenetre() async throws {
        let pool = try makeInMemoryPool()
        try await seed(3, into: pool)

        let (sut, _) = makeSUT(dbPool: pool)

        // Convergence SONDÉE, jamais une horloge : on attend qu'une lecture
        // parasite APPARAISSE, et l'échec de cette attente EST le verdict. Un
        // `Task.sleep` fixe rend l'inverse — vert quand la machine est lente,
        // rouge quand elle l'est un peu trop.
        let lectureParasite = await MessageStoreObservationHelper.awaitCondition {
            sut.messageStore.windowReadsForTesting > 0
        }

        XCTAssertFalse(
            lectureParasite,
            "`start()` observe et arme, il ne LIT pas — la première lecture appartient à `loadMessages()`"
        )
        XCTAssertTrue(sut.messages.isEmpty)
    }

    // MARK: - Une ouverture, une lecture, une publication

    func test_loadMessages_surUnCacheChaud_publieLaFenetreUneSeuleFois() async throws {
        let pool = try makeInMemoryPool()
        try await seed(3, into: pool)
        let (sut, _) = makeSUT(dbPool: pool)

        var publications = 0
        var sawEmptyAfterContent = false
        let token = sut.$messages.dropFirst().sink { snapshot in
            publications += 1
            if snapshot.isEmpty && publications > 1 { sawEmptyAfterContent = true }
        }
        defer { token.cancel() }

        await sut.loadMessages()
        let painted = await MessageStoreObservationHelper.awaitMessagesCount(equals: 3, in: sut)
        XCTAssertTrue(painted, "précondition : la fenêtre GRDB doit être peinte")
        // La revalidation de fond est attendue par CONVERGENCE (sa lecture
        // autoritaire est la seconde), pas par une horloge : à 300 ms fixes le
        // témoin passait au vert quand le runner tenait le rythme et au rouge
        // sans qu'aucun défaut n'existe quand il était chargé.
        let deuxLectures = await MessageStoreObservationHelper.awaitCondition {
            sut.messageStore.windowReadsForTesting >= 2
        }
        XCTAssertTrue(deuxLectures, "précondition : la revalidation autoritaire doit avoir relu la fenêtre")
        // Puis la STABILITÉ : rien ne doit s'ajouter après elle.
        _ = await MessageStoreObservationHelper.awaitCondition {
            sut.messageStore.windowReadsForTesting > 2 || publications > 1
        }

        XCTAssertEqual(
            publications, 1,
            "ouvrir une conversation en cache doit publier la fenêtre UNE fois — chaque publication de plus re-dispose toute la liste"
        )
        XCTAssertEqual(
            sut.messageStore.windowReadsForTesting, 2,
            "DEUX lectures et pas trois : celle de l'ouverture et celle de la revalidation autoritaire. La troisième était la lecture jumelle de `start()`, qui relisait la même fenêtre pour rien"
        )
        XCTAssertFalse(
            sawEmptyAfterContent,
            "cache-first : la liste ne doit jamais repasser par le vide après avoir affiché des bulles"
        )
        XCTAssertFalse(sut.isLoadingInitial)
    }

    // MARK: - Idempotence du `.task`

    /// Le `.task` d'une vue SwiftUI est rejoué à chaque ré-apparition de
    /// l'écran. Sans garde, tout le chargement initial repartait — jusqu'au
    /// tour REST — alors que la liste était déjà peinte.
    func test_loadMessages_rejoue_neRelitNiLaFenetreNiLeReseau() async throws {
        let pool = try makeInMemoryPool()
        try await seed(3, into: pool)
        let (sut, _) = makeSUT(dbPool: pool)

        await sut.loadMessages()
        _ = await MessageStoreObservationHelper.awaitMessagesCount(equals: 3, in: sut)
        // On attend la revalidation par CONVERGENCE (sa lecture est la
        // seconde), pas par une horloge : sous une horloge fixe, la ligne de
        // base ci-dessous se prend AVANT la revalidation sur un runner lent, et
        // le rejeu se voit alors attribuer une lecture qui ne lui appartient
        // pas — rouge sans défaut.
        _ = await MessageStoreObservationHelper.awaitCondition {
            sut.messageStore.windowReadsForTesting >= 2
        }

        let readsAfterOpen = sut.messageStore.windowReadsForTesting
        let listCallsAfterOpen = messageService.listCallCount
        var publicationsAfterOpen = 0
        let token = sut.$messages.dropFirst().sink { _ in publicationsAfterOpen += 1 }
        defer { token.cancel() }

        await sut.loadMessages()
        // Le verdict est une ABSENCE : on laisse le temps à une relecture, un
        // tour REST ou une publication de se manifester, et l'échec de cette
        // attente EST la preuve.
        _ = await MessageStoreObservationHelper.awaitCondition {
            sut.messageStore.windowReadsForTesting != readsAfterOpen
                || messageService.listCallCount != listCallsAfterOpen
                || publicationsAfterOpen > 0
        }

        XCTAssertEqual(
            sut.messageStore.windowReadsForTesting, readsAfterOpen,
            "un rejeu du `.task` ne doit PAS relire la fenêtre"
        )
        XCTAssertEqual(
            messageService.listCallCount, listCallsAfterOpen,
            "ni refaire le tour REST d'ouverture"
        )
        XCTAssertEqual(publicationsAfterOpen, 0, "ni re-disposer la liste")
        XCTAssertEqual(sut.messages.count, 3, "et la fenêtre reste à l'écran")
    }

    /// La moitié NÉGATIVE de la garde, et c'est elle qui la rend acceptable :
    /// une ouverture STÉRILE (GRDB froid + réseau KO) doit rester rejouable,
    /// sinon une conversation ouverte hors ligne resterait vide jusqu'à ce que
    /// SwiftUI détruise l'écran.
    func test_loadMessages_apresUneOuvertureSterile_resteRejouable() async throws {
        let pool = try makeInMemoryPool()
        let (sut, _) = makeSUT(dbPool: pool)
        messageService.listResult = .failure(
            NSError(domain: "test", code: -1009, userInfo: [NSLocalizedDescriptionKey: "offline"])
        )

        await sut.loadMessages()
        XCTAssertTrue(sut.messages.isEmpty, "précondition : l'ouverture n'a rien donné")
        let callsAfterFirst = messageService.listCallCount

        await sut.loadMessages()

        XCTAssertGreaterThan(
            messageService.listCallCount, callsAfterFirst,
            "une ouverture qui n'a rien affiché doit être rejouable au réveil suivant"
        )
    }

    // MARK: - Transcription locale : tempId → id serveur (#4948)

    /// La transcription faite SUR L'APPAREIL est posée sous le `tempId` de la
    /// bulle optimiste. À l'accusé, la bulle prend son id SERVEUR et lit
    /// `messageTranscriptions[message.id]` : sans recopie, le karaoké
    /// disparaissait à l'instant précis où le message était confirmé.
    func test_publicationDuStore_recopieLaTranscriptionLocaleSousLIdServeur() async throws {
        let pool = try makeInMemoryPool()
        let (sut, persistence) = makeSUT(dbPool: pool)

        sut.pendingServerIds["temp-vocal"] = "SRV-vocal"
        sut.messageTranscriptions["temp-vocal"] = MessageTranscription(
            attachmentId: "att-vocal", text: "bonjour tout le monde", language: "fr"
        )

        // Une écriture GRDB — l'accusé serveur en produit une — fait publier le
        // magasin, donc passer le sink d'observation.
        try await persistence.insertOptimistic(
            MessageStoreObservationHelper.makeRecord(
                localId: "temp-vocal", conversationId: conversationId,
                senderId: myUserId, content: "vocal", state: .sent
            )
        )

        let rekeyed = await MessageStoreObservationHelper.awaitCondition {
            sut.messageTranscriptions["SRV-vocal"] != nil
        }

        XCTAssertTrue(rekeyed, "la transcription locale doit suivre l'id que la bulle vient de prendre")
        XCTAssertEqual(sut.messageTranscriptions["SRV-vocal"]?.text, "bonjour tout le monde")
        XCTAssertNotNil(
            sut.messageTranscriptions["temp-vocal"],
            "on RECOPIE : la clé optimiste reste valide tant que des vues la citent"
        )
    }

    /// Et la recopie n'écrase JAMAIS : une transcription arrivée du SERVEUR
    /// sous l'id serveur fait autorité sur celle de l'appareil.
    func test_publicationDuStore_neRecouvrePasUneTranscriptionServeur() async throws {
        let pool = try makeInMemoryPool()
        let (sut, persistence) = makeSUT(dbPool: pool)

        sut.pendingServerIds["temp-vocal"] = "SRV-vocal"
        sut.messageTranscriptions["temp-vocal"] = MessageTranscription(
            attachmentId: "att-vocal", text: "version appareil", language: "fr"
        )
        sut.messageTranscriptions["SRV-vocal"] = MessageTranscription(
            attachmentId: "att-vocal", text: "version serveur", language: "fr"
        )

        try await persistence.insertOptimistic(
            MessageStoreObservationHelper.makeRecord(
                localId: "temp-vocal", conversationId: conversationId,
                senderId: myUserId, content: "vocal", state: .sent
            )
        )
        _ = await MessageStoreObservationHelper.awaitMessagesCount(equals: 1, in: sut)

        XCTAssertEqual(
            sut.messageTranscriptions["SRV-vocal"]?.text, "version serveur",
            "Whisper a raison sur la transcription de l'appareil"
        )
    }
}
