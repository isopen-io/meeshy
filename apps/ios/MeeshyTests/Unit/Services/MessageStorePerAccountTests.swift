import XCTest
import GRDB
import MeeshySDK
@testable import Meeshy

/// #8656 / #8657 — la base locale des messages est cloisonnée PAR COMPTE, et
/// la bascule au changement de compte est synchrone.
///
/// Défaut d'origine : une seule base pour tous les comptes de l'appareil,
/// purgée en tâche asynchrone. Dans une conversation PARTAGÉE par deux comptes
/// du même appareil, le second lisait, le temps de la purge, les lignes du
/// premier — contenu protégé compris — attribuées au mauvais auteur.
@MainActor
final class MessageStorePerAccountTests: XCTestCase {

    private static let production = "https://gate.meeshy.me"
    private static let staging = "https://gate.staging.meeshy.me"

    private func makeDirectory() throws -> URL {
        let dir = URL(fileURLWithPath: NSTemporaryDirectory())
            .appendingPathComponent("meeshy-store-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        addTeardownBlock { try? FileManager.default.removeItem(at: dir) }
        return dir
    }

    private func key(_ userId: String, _ origin: String = production) -> MessageStoreAccountKey {
        MessageStoreAccountKey(userId: userId, serverOrigin: origin)!
    }

    private func makeRouter(in directory: URL, initialKey: MessageStoreAccountKey?) -> MessageStoreRouter {
        MessageStoreRouter(initialKey: initialKey) { key in
            MessageStoreSession.open(key: key, directory: directory)
        }
    }

    private func record(id: String, conversationId: String = "conv-shared", senderId: String, content: String) -> MessageRecord {
        MessageRecord(
            localId: id, serverId: id,
            conversationId: conversationId, senderId: senderId,
            content: content, originalLanguage: "fr",
            messageType: "text", messageSource: "user", contentType: "text",
            state: .delivered, retryCount: 0, lastError: nil,
            isEncrypted: false, encryptionMode: nil, encryptedPayload: nil,
            replyToId: nil, storyReplyToId: nil,
            forwardedFromId: nil, forwardedFromConversationId: nil,
            replyToJson: nil, forwardedFromJson: nil,
            expiresAt: nil, effectFlags: 0,
            maxViewOnceCount: nil, viewOnceCount: 0,
            isEdited: false, editedAt: nil, deletedAt: nil,
            pinnedAt: nil, pinnedBy: nil,
            senderName: nil, senderUsername: nil,
            senderColor: nil, senderAvatarURL: nil,
            deliveredCount: 0, readCount: 0,
            deliveredToAllAt: nil, readByAllAt: nil,
            createdAt: Date(), sentAt: nil,
            deliveredAt: nil, readAt: nil, updatedAt: Date(),
            attachmentsJson: nil, reactionsJson: nil,
            reactionCount: 0, currentUserReactionsJson: nil,
            mentionedUsersJson: nil,
            cachedBubbleWidth: nil, cachedBubbleHeight: nil,
            cachedLastLineWidth: nil, cachedLineCount: nil,
            cachedTimestampInline: nil,
            layoutVersion: 0, layoutMaxWidth: nil, changeVersion: 0
        )
    }

    private func contents(of session: MessageStoreSession, conversationId: String = "conv-shared") throws -> [String] {
        try session.messagePersistence.messages(for: conversationId).compactMap(\.content)
    }

    // MARK: - Deux comptes, une conversation partagée

    func test_activate_secondAccountOnASharedConversation_readsNoneOfTheFirstAccountsRows() async throws {
        let dir = try makeDirectory()
        let router = makeRouter(in: dir, initialKey: key("alice"))
        try await router.current.messagePersistence.insertOptimistic(
            record(id: "m-secret", senderId: "alice", content: "le code est 4271")
        )

        router.activate(key("bob"))

        XCTAssertEqual(try contents(of: router.current), [],
                       "le compte suivant ne doit lire AUCUNE ligne du compte quitté, à aucun instant")
    }

    func test_activate_returningToTheFirstAccount_findsItsOwnRowsOnly() async throws {
        let dir = try makeDirectory()
        let router = makeRouter(in: dir, initialKey: key("alice"))
        try await router.current.messagePersistence.insertOptimistic(record(id: "m-a", senderId: "alice", content: "d'Alice"))
        router.activate(key("bob"))
        try await router.current.messagePersistence.insertOptimistic(record(id: "m-b", senderId: "bob", content: "de Bob"))

        router.activate(key("alice"))

        XCTAssertEqual(try contents(of: router.current), ["d'Alice"])
    }

    func test_activate_isSynchronous_theNextReadAlreadyTargetsTheNewAccountsFile() throws {
        let dir = try makeDirectory()
        let router = makeRouter(in: dir, initialKey: key("alice"))

        let outgoing = router.activate(key("bob"))

        XCTAssertEqual(outgoing?.key, key("alice"), "la session quittée est rendue pour être purgée")
        XCTAssertEqual(router.current.key, key("bob"))
        XCTAssertEqual(router.current.fileName, key("bob").databaseFileName)
    }

    // MARK: - Écriture en vol pendant la bascule

    func test_inFlightWriteOfTheOutgoingAccount_landsInItsOwnStoreNeverInTheNextOne() async throws {
        let dir = try makeDirectory()
        let router = makeRouter(in: dir, initialKey: key("alice"))
        let aliceSession = router.current

        router.activate(key("bob"))
        try await aliceSession.messagePersistence.insertOptimistic(
            record(id: "m-late", senderId: "alice", content: "arrivé après la bascule")
        )

        XCTAssertEqual(try contents(of: router.current), [],
                       "une écriture du compte quitté n'atteint jamais la base du compte suivant")
        XCTAssertEqual(try contents(of: aliceSession), ["arrivé après la bascule"])
    }

    func test_sessionOwnedBy_anAccountNoLongerActive_isRefused() throws {
        let dir = try makeDirectory()
        let router = makeRouter(in: dir, initialKey: key("alice"))

        router.activate(key("bob"))

        XCTAssertNil(router.session(ownedBy: "alice"),
                     "une page demandée pour Alice ne s'écrit nulle part une fois Bob actif")
        XCTAssertTrue(router.session(ownedBy: "bob") === router.current)
        XCTAssertTrue(router.session(ownedBy: nil) === router.current)
        XCTAssertNil(router.session(ownedBy: ""),
                     "une page demandée sans compte ne s'écrit dans aucune base de compte")
    }

    // MARK: - Déconnexion

    func test_activateNobody_afterLogout_readsNothingAndKeepsTheAccountFileOutOfReach() async throws {
        let dir = try makeDirectory()
        let router = makeRouter(in: dir, initialKey: key("alice"))
        try await router.current.messagePersistence.insertOptimistic(record(id: "m-a", senderId: "alice", content: "d'Alice"))

        let outgoing = router.activate(nil)

        XCTAssertEqual(outgoing?.key, key("alice"))
        XCTAssertNil(router.current.key)
        XCTAssertEqual(try contents(of: router.current), [])
        XCTAssertFalse(router.current.path.hasPrefix(dir.path),
                       "la base de personne ne vit pas parmi les bases de compte")
    }

    func test_activate_sameAccountTwice_keepsTheSameSessionSoItsPurgeIsSerialisedBeforeItsWrites() throws {
        let dir = try makeDirectory()
        let router = makeRouter(in: dir, initialKey: key("alice"))
        let first = router.current

        router.activate(nil)
        router.activate(key("alice"))

        XCTAssertTrue(router.current === first)
        XCTAssertNil(router.activate(key("alice")), "réactiver le compte actif ne bascule rien")
    }

    // MARK: - #8657 — même compte, deux environnements

    func test_activate_sameUserInAnotherEnvironment_readsNoneOfTheOtherEnvironmentsRows() async throws {
        let dir = try makeDirectory()
        let router = makeRouter(in: dir, initialKey: key("alice", Self.production))
        try await router.current.messagePersistence.insertOptimistic(record(id: "m-prod", senderId: "alice", content: "production"))

        let outgoing = router.activate(key("alice", Self.staging))

        XCTAssertNotNil(outgoing, "changer d'environnement est un changement de base")
        XCTAssertEqual(try contents(of: router.current), [])
    }

    // MARK: - NSE : la base du destinataire

    func test_nseResolvedStore_isTheActiveAccountsStore_andNoOtherAccountSeesItsPrePersistedRow() async throws {
        let dir = try makeDirectory()
        let router = makeRouter(in: dir, initialKey: key("bob"))
        let bobSession = router.current
        router.activate(key("alice"))
        let defaults = try XCTUnwrap(UserDefaults(suiteName: "test.nse.\(UUID().uuidString)"))
        defaults.set("alice", forKey: MessageStoreAccountKey.activeUserIdDefaultsKey)

        let nseKey = try XCTUnwrap(MessageStoreAccountKey.activeAccount(appGroupDefaults: defaults, serverOrigin: Self.production))
        let nsePool = try DatabasePool(path: dir.appendingPathComponent(nseKey.databaseFileName).path,
                                       configuration: DependencyContainer.dbConfig())
        try MessageDatabaseMigrations.runAll(on: nsePool)
        let pushed = record(id: "m-push", senderId: "carol", content: "pré-enregistré")
        try await nsePool.write { db in
            try pushed.insert(db)
        }

        XCTAssertEqual(try contents(of: router.current), ["pré-enregistré"],
                       "la NSE écrit dans la base que l'app ouvre pour le destinataire")
        XCTAssertEqual(try contents(of: bobSession), [],
                       "et dans aucune autre")
    }

    // MARK: - Fichiers : l'ancienne base partagée, les bases dormantes

    func test_adoptLegacyStore_withAnActiveAccount_movesTheSharedBaseToThatAccount() throws {
        let dir = try makeDirectory()
        let legacy = dir.appendingPathComponent(MessageStoreAccountKey.legacyDatabaseFileName).path
        FileManager.default.createFile(atPath: legacy, contents: Data("legacy".utf8))
        FileManager.default.createFile(atPath: legacy + "-wal", contents: Data())

        MessageStoreRouter.adoptLegacyStore(in: dir, for: key("alice"))

        let target = dir.appendingPathComponent(key("alice").databaseFileName).path
        XCTAssertFalse(FileManager.default.fileExists(atPath: legacy))
        XCTAssertFalse(FileManager.default.fileExists(atPath: legacy + "-wal"))
        XCTAssertEqual(FileManager.default.contents(atPath: target), Data("legacy".utf8),
                       "la file d'envoi et le cache du compte actif survivent à la mise à jour")
        XCTAssertTrue(FileManager.default.fileExists(atPath: target + "-wal"))
    }

    func test_adoptLegacyStore_withNobodySignedIn_deletesTheSharedBase() throws {
        let dir = try makeDirectory()
        let legacy = dir.appendingPathComponent(MessageStoreAccountKey.legacyDatabaseFileName).path
        FileManager.default.createFile(atPath: legacy, contents: Data("legacy".utf8))

        MessageStoreRouter.adoptLegacyStore(in: dir, for: nil)

        XCTAssertFalse(FileManager.default.fileExists(atPath: legacy))
        XCTAssertEqual(try FileManager.default.contentsOfDirectory(atPath: dir.path), [])
    }

    func test_adoptLegacyStore_whenTheAccountAlreadyHasItsBase_neverOverwritesIt() throws {
        let dir = try makeDirectory()
        let legacy = dir.appendingPathComponent(MessageStoreAccountKey.legacyDatabaseFileName).path
        let target = dir.appendingPathComponent(key("alice").databaseFileName).path
        FileManager.default.createFile(atPath: legacy, contents: Data("legacy".utf8))
        FileManager.default.createFile(atPath: target, contents: Data("own".utf8))

        MessageStoreRouter.adoptLegacyStore(in: dir, for: key("alice"))

        XCTAssertFalse(FileManager.default.fileExists(atPath: legacy))
        XCTAssertEqual(FileManager.default.contents(atPath: target), Data("own".utf8))
    }

    func test_sweepDormantAccountStores_removesClosedAccountBasesOnly() throws {
        let dir = try makeDirectory()
        let open = key("alice").databaseFileName
        let dormant = key("bob").databaseFileName
        for name in [open, dormant, dormant + "-wal", "meeshy.sqlite"] {
            FileManager.default.createFile(atPath: dir.appendingPathComponent(name).path, contents: Data())
        }

        MessageStoreRouter.sweepDormantAccountStores(in: dir, keeping: [open])

        let left = Set(try FileManager.default.contentsOfDirectory(atPath: dir.path))
        XCTAssertEqual(left, [open, "meeshy.sqlite"])
    }

    // MARK: - La table de vérité de la bascule

    func test_messageStoreTarget_followsTheSessionResolution() {
        let alice = key("alice")
        XCTAssertEqual(MessageStoreTarget.resolve(sessionResolved: false, isAuthenticated: false, activeKey: alice), .unchanged,
                       "personne n'a encore regardé : la base du démarrage reste servie, cache-first")
        XCTAssertEqual(MessageStoreTarget.resolve(sessionResolved: false, isAuthenticated: true, activeKey: alice), .account(alice))
        XCTAssertEqual(MessageStoreTarget.resolve(sessionResolved: true, isAuthenticated: true, activeKey: alice), .account(alice))
        XCTAssertEqual(MessageStoreTarget.resolve(sessionResolved: true, isAuthenticated: false, activeKey: alice), .account(nil),
                       "fin de session : plus aucune base de compte n'est lue")
    }

    // MARK: - À côté : les brouillons de commentaire

    func test_commentDraftStore_clearAll_forgetsEveryDraftIncludingThoseInFlight() throws {
        let defaults = try XCTUnwrap(UserDefaults(suiteName: "test.commentDrafts.\(UUID().uuidString)"))
        let store = CommentDraftStore(defaults: defaults, debounceMilliseconds: 10_000)
        store.save(postId: "p-1", text: "brouillon en vol")
        defaults.set("brouillon écrit", forKey: "meeshy.commentDraft.v1.p-2")

        store.clearAll()

        XCTAssertNil(store.load(postId: "p-1"))
        XCTAssertNil(store.load(postId: "p-2"))
        XCTAssertTrue(store.pendingSaves.isEmpty)
    }
}
