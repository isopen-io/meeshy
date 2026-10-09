import XCTest
import GRDB
@_spi(AccountStore) @testable import MeeshySDK

/// **Un commentaire hors ligne garde ses pièces** (#9743).
///
/// `CreateCommentPayload` n'emportait ni fichier ni identifiant de média : un
/// commentaire avec pièce dont l'envoi échouait rejoignait la file en texte
/// seul. Ces témoins verrouillent la file : les fichiers vont dans un dossier
/// durable, la ligne les référence, les acquis s'y gravent, un échec reste
/// relançable avec ses pièces, et tout se relit après un redémarrage.
final class OfflineQueueCommentMediaTests: XCTestCase {

    private var queue: OfflineQueue { OfflineQueue.shared }
    private var pool: DatabaseQueue!
    private var scratch: URL!

    /// La base ouverte est celle d'ALICE : son fichier porte l'empreinte de
    /// son compte, comme en production. C'est ce que la file exige de prouver
    /// avant de montrer ou d'adopter quoi que ce soit.
    override func setUp() async throws {
        scratch = FileManager.default.temporaryDirectory
            .appendingPathComponent("comment-media-\(UUID().uuidString)", isDirectory: true)
        try FileManager.default.createDirectory(at: scratch, withIntermediateDirectories: true)
        let key = try XCTUnwrap(MessageStoreAccountKey(
            userId: alice, serverOrigin: MeeshyConfig.shared.persistedServerOrigin))
        pool = try DatabaseQueue(path: scratch.appendingPathComponent(key.databaseFileName).path)
        try MessageDatabaseMigrations.runAll(on: pool)
        await OfflineQueue.shared.configure(pool: pool)
        await queue.clearAll()
    }

    override func tearDown() async throws {
        await queue.clearAll()
        try? FileManager.default.removeItem(at: scratch)
        pool = nil
    }

    private func source(_ name: String, _ contents: String) throws -> URL {
        let url = scratch.appendingPathComponent(name)
        try Data(contents.utf8).write(to: url)
        return url
    }

    private let alice = "66f0a1b2c3d4e5f6000000a1"
    private let bob = "66f0a1b2c3d4e5f6000000b0"

    private func comment(_ cmid: String, post: String = "post-1", content: String = "regarde",
                         author: String? = "66f0a1b2c3d4e5f6000000a1") -> CreateCommentPayload {
        CreateCommentPayload(clientMutationId: cmid, postId: post, parentCommentId: nil,
                             content: content, originalLanguage: "fr", authorId: author)
    }

    private func payload(_ outboxId: String) throws -> CreateCommentPayload {
        let record = try pool.read { db in try OutboxRecord.fetchOne(db, key: outboxId) }
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return try decoder.decode(CreateCommentPayload.self, from: XCTUnwrap(record).payload)
    }

    private func enqueueTwoPieces(_ cmid: String,
                                  acquired: [UploadedCommentMedia] = []) async throws -> OfflineQueue.EnqueueMediaResult {
        try await queue.enqueueCommentMedia(
            comment(cmid),
            sourceMediaURLs: [try source("a.jpg", "photo"), try source("b.m4a", "voix")],
            sourceMediaMimeTypes: ["image/jpeg", "audio/mp4"],
            acquired: acquired,
            ownerId: alice
        )
    }

    private func cleanup(_ cmid: String) async {
        await queue.cancelCreateComment(clientMutationId: cmid, ownerId: alice)
    }

    // MARK: - La ligne emporte les deux pièces, dans un dossier durable

    func test_enqueueCommentMedia_copiesBothPiecesOutOfTmp_andTheRowReferencesThem() async throws {
        let cmid = "cmid_comment_media_1"
        let result = try await enqueueTwoPieces(cmid)

        let stored = try payload(result.outboxId)
        let folder = "pending-media/comments-\(alice)/\(cmid)"
        XCTAssertEqual(stored.localMediaPaths, ["\(folder)/0.jpg", "\(folder)/1.m4a"],
                       "Les pièces en attente sont rangées sous le compte qui les a écrites.")
        XCTAssertEqual(stored.authorId, alice)
        XCTAssertEqual(stored.localMediaMimeTypes, ["image/jpeg", "audio/mp4"])
        XCTAssertEqual(stored.content, "regarde")
        for relative in try XCTUnwrap(stored.localMediaPaths) {
            let path = OfflineQueue.absoluteMediaPath(forStored: relative)
            XCTAssertTrue(FileManager.default.fileExists(atPath: path), "\(relative) n'est pas sur le disque")
            XCTAssertFalse(path.hasPrefix(FileManager.default.temporaryDirectory.path),
                           "Une pièce en attente ne vit pas dans tmp, qu'iOS balaie.")
        }
        await cleanup(cmid)
    }

    func test_enqueueCommentMedia_sameClientId_doesNotCreateASecondRow() async throws {
        let cmid = "cmid_comment_media_2"
        let first = try await enqueueTwoPieces(cmid)
        let second = try await enqueueTwoPieces(cmid)
        XCTAssertEqual(second.outboxId, first.outboxId)
        XCTAssertTrue(first.localMediaPaths.allSatisfy {
            FileManager.default.fileExists(atPath: OfflineQueue.absoluteMediaPath(forStored: $0))
        }, "Un second enfilement ne retire pas les pièces du premier.")
        let rows = try await pool.read { db in
            try OutboxRecord.filter(Column("kind") == OutboxKind.createComment.rawValue).fetchCount(db)
        }
        XCTAssertEqual(rows, 1, "Un même identifiant client ne produit qu'un commentaire.")
        await cleanup(cmid)
    }

    func test_enqueueCommentMedia_keepsWhatTheDirectAttemptAlreadyUploaded() async throws {
        let cmid = "cmid_comment_media_3"
        let done = UploadedCommentMedia(sourceIndex: 0, id: "media0", uploadedAt: Date().timeIntervalSince1970)
        let result = try await enqueueTwoPieces(cmid, acquired: [done])
        XCTAssertEqual(try payload(result.outboxId).uploadedMedia, [done])
        await cleanup(cmid)
    }

    // MARK: - Ce qui est monté reste monté

    func test_recordUploadedCommentMedia_accumulates_andIsIdempotentByIndex() async throws {
        let cmid = "cmid_comment_media_4"
        let result = try await enqueueTwoPieces(cmid)
        let now = Date().timeIntervalSince1970

        await queue.recordUploadedCommentMedia(outboxId: result.outboxId,
                                               UploadedCommentMedia(sourceIndex: 1, id: "media1", uploadedAt: now))
        await queue.recordUploadedCommentMedia(outboxId: result.outboxId,
                                               UploadedCommentMedia(sourceIndex: 0, id: "media0", uploadedAt: now))
        await queue.recordUploadedCommentMedia(outboxId: result.outboxId,
                                               UploadedCommentMedia(sourceIndex: 0, id: "media0-bis", uploadedAt: now))

        let stored = try payload(result.outboxId)
        XCTAssertEqual(stored.uploadedMedia?.map(\.sourceIndex), [0, 1])
        XCTAssertEqual(CommentMediaReplay.attachmentIds(stored.uploadedMedia ?? []), ["media0-bis", "media1"])
        XCTAssertEqual(stored.localMediaPaths?.count, 2, "Graver un acquis ne retire aucune pièce de la ligne.")
        await cleanup(cmid)
    }

    // MARK: - Le plan d'un rejeu

    func test_plan_uploadsOnlyWhatIsNotAcquired() {
        let now = Date()
        let done = UploadedCommentMedia(sourceIndex: 0, id: "media0", uploadedAt: now.timeIntervalSince1970 - 60)
        let payload = comment("cmid_plan_1").withMedia(
            localMediaPaths: ["p/0.jpg", "p/1.m4a"], localMediaMimeTypes: nil, uploadedMedia: [done])
        let plan = CommentMediaReplay.plan(for: payload, now: now, fileExists: { _ in true })
        XCTAssertEqual(plan.acquired, [done])
        XCTAssertEqual(plan.toUpload, [1])
        XCTAssertTrue(plan.missing.isEmpty)
    }

    func test_plan_reuploadsAPieceTheServerHasSweptByNow() {
        let now = Date()
        let stale = UploadedCommentMedia(sourceIndex: 0, id: "media0",
                                         uploadedAt: now.timeIntervalSince1970 - 21 * 60 * 60)
        let payload = comment("cmid_plan_2").withMedia(
            localMediaPaths: ["p/0.jpg"], localMediaMimeTypes: nil, uploadedMedia: [stale])
        let plan = CommentMediaReplay.plan(for: payload, now: now, fileExists: { _ in true })
        XCTAssertTrue(plan.acquired.isEmpty, "Un média pré-téléversé non réclamé est balayé à 24 h.")
        XCTAssertEqual(plan.toUpload, [0])
    }

    func test_plan_namesAPieceWhoseFileIsGone() {
        let payload = comment("cmid_plan_3").withMedia(
            localMediaPaths: ["p/0.jpg", "p/1.jpg"], localMediaMimeTypes: nil, uploadedMedia: nil)
        let plan = CommentMediaReplay.plan(for: payload, now: Date(), fileExists: { $0 == 1 })
        XCTAssertEqual(plan.toUpload, [1])
        XCTAssertEqual(plan.missing, [0])
    }

    // MARK: - L'échec reste relançable, avec ses pièces

    func test_anExhaustedComment_isListedAsFailed_keepsItsFiles_andRetryRearmsIt() async throws {
        let cmid = "cmid_comment_media_5"
        let result = try await enqueueTwoPieces(cmid)
        try await pool.write { db in
            try db.execute(sql: "UPDATE outbox SET status = ?, attempts = 5, lastError = ? WHERE id = ?",
                           arguments: [OutboxStatus.exhausted.rawValue, "hors ligne", result.outboxId])
        }

        let failedList = await queue.unsentComments(postId: "post-1", ownerId: alice)
        let failed = try XCTUnwrap(failedList.first)
        XCTAssertTrue(failed.isFailed)
        XCTAssertEqual(failed.clientMutationId, cmid)
        XCTAssertEqual(failed.localMediaURLs.count, 2)
        XCTAssertTrue(failed.localMediaURLs.allSatisfy { FileManager.default.fileExists(atPath: $0.path) },
                      "Un commentaire abandonné par la file garde ses pièces.")

        try await queue.retryItem(result.outboxId)

        let rearmedList = await queue.unsentComments(postId: "post-1", ownerId: alice)
        let rearmed = try XCTUnwrap(rearmedList.first)
        XCTAssertFalse(rearmed.isFailed)
        XCTAssertEqual(rearmed.payload.localMediaPaths?.count, 2)
        await cleanup(cmid)
    }

    func test_unsentComments_areScopedToTheirPost() async throws {
        let cmid = "cmid_comment_media_6"
        _ = try await enqueueTwoPieces(cmid)
        let other = await queue.unsentComments(postId: "post-2", ownerId: alice)
        XCTAssertTrue(other.isEmpty)
        await cleanup(cmid)
    }

    // MARK: - La reprise après un redémarrage

    func test_afterARelaunch_theRowAndItsFilesAreStillThere() async throws {
        let cmid = "cmid_comment_media_7"
        _ = try await enqueueTwoPieces(cmid)

        // Un redémarrage ne garde que la base et le disque : on rebranche la
        // file sur la même base, sans rien lui redonner d'autre.
        await OfflineQueue.shared.configure(pool: pool)

        let survivorList = await queue.unsentComments(postId: "post-1", ownerId: alice)
        let survivor = try XCTUnwrap(survivorList.first)
        XCTAssertEqual(survivor.payload.content, "regarde")
        XCTAssertEqual(survivor.localMediaURLs.map(\.lastPathComponent), ["0.jpg", "1.m4a"])
        XCTAssertEqual(try String(contentsOf: survivor.localMediaURLs[1], encoding: .utf8), "voix")
        await cleanup(cmid)
    }

    func test_cancelCreateComment_removesTheRowAndItsFiles() async throws {
        let cmid = "cmid_comment_media_8"
        let result = try await enqueueTwoPieces(cmid)
        let paths = try XCTUnwrap(try payload(result.outboxId).localMediaPaths)

        let removed = await queue.cancelCreateComment(clientMutationId: cmid, ownerId: alice)
        XCTAssertTrue(removed)

        let remaining = await queue.unsentComments(postId: "post-1", ownerId: alice)
        XCTAssertTrue(remaining.isEmpty)
        XCTAssertTrue(paths.allSatisfy { !FileManager.default.fileExists(atPath: OfflineQueue.absoluteMediaPath(forStored: $0)) })
    }

    // MARK: - Un commentaire en attente appartient à son auteur

    func test_enqueueCommentMedia_isRefused_whenTheCurrentAccountIsNotTheAuthor() async throws {
        let cmid = "cmid_comment_owner_1"
        do {
            _ = try await queue.enqueueCommentMedia(
                comment(cmid), sourceMediaURLs: [try source("a.jpg", "photo")],
                sourceMediaMimeTypes: nil, ownerId: bob)
            XCTFail("Un commentaire écrit par A ne s'enfile pas sous B.")
        } catch {
            XCTAssertEqual(error as? CommentOwnership.Refusal, .notTheAuthor)
        }
        let rows = try await pool.read { db in try OutboxRecord.fetchCount(db) }
        XCTAssertEqual(rows, 0)
        let folder = OfflineQueue.absoluteMediaPath(forStored: "pending-media/comments-\(bob)/\(cmid)")
        XCTAssertFalse(FileManager.default.fileExists(atPath: folder + "/0.jpg"), "Rien n'est copié pour un autre compte.")
    }

    func test_enqueueCommentMedia_isRefused_withoutADeclaredAuthor_orWithoutAnAccount() async throws {
        for (payload, owner) in [(comment("cmid_comment_owner_2", author: nil), Optional(alice)),
                                 (comment("cmid_comment_owner_3"), String?.none),
                                 (comment("cmid_comment_owner_4", author: ""), Optional(""))] {
            do {
                _ = try await queue.enqueueCommentMedia(payload, sourceMediaURLs: [try source("a.jpg", "photo")],
                                                        sourceMediaMimeTypes: nil, ownerId: owner)
                XCTFail("Sans auteur lisible, on n'enfile pas.")
            } catch {
                XCTAssertEqual(error as? CommentOwnership.Refusal, .notTheAuthor)
            }
        }
    }

    func test_aCommentWrittenByA_isNeverShownUnderB_andComesBackForA() async throws {
        let cmid = "cmid_comment_owner_5"
        _ = try await enqueueTwoPieces(cmid)

        let underBob = await queue.unsentComments(postId: "post-1", ownerId: bob)
        XCTAssertTrue(underBob.isEmpty)
        let oneUnderBob = await queue.unsentComment(clientMutationId: cmid, ownerId: bob)
        XCTAssertNil(oneUnderBob)
        let signedOut = await queue.unsentComments(postId: "post-1", ownerId: nil)
        XCTAssertTrue(signedOut.isEmpty)

        let underAlice = await queue.unsentComments(postId: "post-1", ownerId: alice)
        XCTAssertEqual(underAlice.map(\.clientMutationId), [cmid])
        await cleanup(cmid)
    }

    // MARK: - Fermé par défaut : ce qui ne permet pas de décider vaut NON

    func test_owns_isFalseWheneverTheAuthorCannotBeDecided() {
        XCTAssertTrue(CommentOwnership.owns(comment("c"), currentUserId: alice))
        XCTAssertFalse(CommentOwnership.owns(comment("c"), currentUserId: bob), "Une entrée écrite par A n'est pas celle de B.")
        XCTAssertFalse(CommentOwnership.owns(comment("c"), currentUserId: nil), "identité courante absente")
        XCTAssertFalse(CommentOwnership.owns(comment("c"), currentUserId: ""), "identité courante vide")
        XCTAssertFalse(CommentOwnership.owns(comment("c", author: nil), currentUserId: alice), "entrée sans propriétaire")
        XCTAssertFalse(CommentOwnership.owns(comment("c", author: ""), currentUserId: alice), "propriétaire vide")
        XCTAssertFalse(CommentOwnership.owns(comment("c", author: ""), currentUserId: ""), "deux vides ne sont pas le même compte")
        XCTAssertFalse(CommentOwnership.owns(comment("c", author: nil), currentUserId: nil), "deux absents non plus")
        XCTAssertFalse(CommentOwnership.owns(comment("c", author: "  "), currentUserId: "  "), "deux blancs non plus")
    }

    private func token(userId: Any?) -> String {
        var claims: [String: Any] = ["exp": 4_000_000_000]
        if let userId { claims["userId"] = userId }
        let body = try! JSONSerialization.data(withJSONObject: claims).base64EncodedString()
            .replacingOccurrences(of: "+", with: "-").replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
        return "e30.\(body).sig"
    }

    func test_tokenBound_returnsTheVeryTokenItVerified_orRefuses() throws {
        let aliceToken = token(userId: alice)
        XCTAssertEqual(try CommentOwnership.tokenBound(to: comment("c"), token: aliceToken), aliceToken)
        let refused: [(CreateCommentPayload, String?)] = [
            (comment("c"), token(userId: bob)),
            (comment("c"), nil),
            (comment("c"), ""),
            (comment("c"), "pas-un-jeton"),
            (comment("c"), "a.b"),
            (comment("c"), token(userId: nil)),
            (comment("c"), token(userId: "")),
            (comment("c"), token(userId: 42)),
            (comment("c", author: nil), aliceToken),
            (comment("c", author: ""), aliceToken),
            (comment("c", author: ""), token(userId: "")),
        ]
        for (payload, candidate) in refused {
            XCTAssertThrowsError(try CommentOwnership.tokenBound(to: payload, token: candidate)) { error in
                XCTAssertEqual(error as? CommentOwnership.Refusal, .notTheAuthor)
            }
        }
    }

    func test_ownedMediaPaths_refusesAnyPathOutsideTheAuthorsFolder() {
        let folder = "pending-media/comments-\(alice)/cmid_x"
        let mine = comment("c").withMedia(localMediaPaths: ["\(folder)/0.jpg"], localMediaMimeTypes: nil, uploadedMedia: nil)
        XCTAssertEqual(CommentOwnership.ownedMediaPaths(mine), ["\(folder)/0.jpg"])
        XCTAssertEqual(CommentOwnership.ownedMediaPaths(comment("c")), [], "Un commentaire de texte n'a aucune pièce à prouver.")
        for foreign in ["pending-media/comments-\(bob)/cmid_x/0.jpg",
                        "/etc/passwd",
                        "pending-media/comments-\(alice)/../comments-\(bob)/cmid_x/0.jpg",
                        "pending-media/cmid_x/0.jpg"] {
            let tampered = comment("c").withMedia(localMediaPaths: [foreign], localMediaMimeTypes: nil, uploadedMedia: nil)
            XCTAssertNil(CommentOwnership.ownedMediaPaths(tampered), foreign)
        }
        let orphan = comment("c", author: nil).withMedia(localMediaPaths: ["\(folder)/0.jpg"], localMediaMimeTypes: nil, uploadedMedia: nil)
        XCTAssertNil(CommentOwnership.ownedMediaPaths(orphan), "Des pièces sans propriétaire lisible ne se lisent pas.")
    }

    // MARK: - Une ligne de texte héritée ne se perd pas, et ne s'envoie jamais

    /// Une ligne gravée AVANT le champ « auteur », telle qu'une version
    /// antérieure l'a laissée dans la base de son compte — écrite par l'entrée
    /// générique d'alors.
    ///
    /// L'identifiant client doit avoir sa forme réelle (`cmid_<uuid>`) : l'entrée
    /// générique en frappe un autre quand il est mal formé, et la ligne ne se
    /// retrouverait plus par celui que porte sa charge.
    private func enqueueInheritedText(_ cmid: String) async throws -> String {
        try await queue.enqueue(.createComment, payload: comment(cmid, content: "écrit avant", author: nil),
                                conversationId: "post-1")
    }

    private func rowCount() throws -> Int {
        try pool.read { db in try OutboxRecord.fetchCount(db) }
    }

    func test_anInheritedTextRow_isShownUnsent_toTheAccountWhoseBaseItIs_andToNoOneElse() async throws {
        let cmid = ClientMutationId.generate()
        _ = try await enqueueInheritedText(cmid)

        let shown = await queue.unsentComments(postId: "post-1", ownerId: alice)
        XCTAssertEqual(shown.map(\.clientMutationId), [cmid], "Elle reste visible pour le compte dont la base la contient.")
        XCTAssertEqual(shown.first?.isFailed, true, "« Non envoyée » : elle ne partira jamais.")
        XCTAssertEqual(shown.first?.isInherited, true)
        XCTAssertEqual(shown.first?.payload.content, "écrit avant")

        let signedOut = await queue.unsentComments(postId: "post-1", ownerId: nil)
        XCTAssertTrue(signedOut.isEmpty, "Sans compte connecté, elle n'est attribuable à personne.")
        let blank = await queue.unsentComments(postId: "post-1", ownerId: "")
        XCTAssertTrue(blank.isEmpty)
    }

    /// **Aucun geste ne l'envoie** : « Réessayer » la refuse, et rien n'écrit
    /// un auteur sur la ligne.
    func test_anInheritedRow_isNeverRearmed_andNeverGivenAnAuthor() async throws {
        let cmid = ClientMutationId.generate()
        let outboxId = try await enqueueInheritedText(cmid)
        try await pool.write { db in
            try db.execute(sql: "UPDATE outbox SET status = ?, attempts = 5 WHERE id = ?",
                           arguments: [OutboxStatus.exhausted.rawValue, outboxId])
        }
        for owner in [Optional(alice), Optional(bob), String?.none, Optional("")] {
            do {
                try await queue.retryCreateComment(clientMutationId: cmid, ownerId: owner)
                XCTFail("Une ligne sans auteur ne se relance pas.")
            } catch {
                XCTAssertEqual(error as? CommentOwnership.Refusal, .notTheAuthor)
            }
        }
        XCTAssertNil(try payload(outboxId).authorId, "Aucun auteur n'est jamais écrit sur une ligne existante.")
        let status = try await pool.read { db in try OutboxRecord.fetchOne(db, key: outboxId)?.status }
        XCTAssertEqual(status, .exhausted, "Elle n'a pas été réarmée : aucune requête ne partira.")
    }

    /// **« Reprendre »** rend le texte — pour le brouillon du composeur — et
    /// supprime la ligne. L'envoi qui suit est un commentaire NEUF.
    func test_resume_returnsTheText_andRemovesTheInheritedRow() async throws {
        let cmid = ClientMutationId.generate()
        _ = try await enqueueInheritedText(cmid)

        let text = await queue.resumeInheritedComment(clientMutationId: cmid, ownerId: alice)

        XCTAssertEqual(text, "écrit avant")
        XCTAssertEqual(try rowCount(), 0, "La ligne héritée a quitté la file.")
        let again = await queue.resumeInheritedComment(clientMutationId: cmid, ownerId: alice)
        XCTAssertNil(again)
    }

    func test_theCommentSentAfterAResume_carriesTheAccountAsItsAuthor() async throws {
        let inherited = ClientMutationId.generate()
        _ = try await enqueueInheritedText(inherited)
        let resumed = await queue.resumeInheritedComment(clientMutationId: inherited, ownerId: alice)
        let text = try XCTUnwrap(resumed)

        let outboxId = try await queue.enqueueComment(comment("cmid_fresh_1", content: text), ownerId: alice)

        let sent = try payload(outboxId)
        XCTAssertEqual(sent.content, "écrit avant")
        XCTAssertEqual(sent.authorId, alice, "Le commentaire repris part par le chemin normal, avec son auteur.")
        XCTAssertEqual(try rowCount(), 1)
    }

    func test_resume_isClosedWithoutTheProof_andForAnythingButInheritedText() async throws {
        let inherited = ClientMutationId.generate()
        _ = try await enqueueInheritedText(inherited)
        for owner in [Optional(bob), String?.none, Optional("")] {   // base d'Alice, autre compte ou personne
            let text = await queue.resumeInheritedComment(clientMutationId: inherited, ownerId: owner)
            XCTAssertNil(text)
        }
        XCTAssertEqual(try rowCount(), 1, "Rien n'a été supprimé.")

        let mine = "cmid_inherited_6"
        _ = try await enqueueTwoPieces(mine)
        let owned = await queue.resumeInheritedComment(clientMutationId: mine, ownerId: alice)
        XCTAssertNil(owned, "Une ligne qui a un auteur se relance, elle ne se « reprend » pas.")
        XCTAssertEqual(try rowCount(), 2)
        await cleanup(mine)
    }

    func test_onlyTextIsInherited_neverPiecesWithoutAnOwner() {
        let text = comment("c", author: nil)
        XCTAssertTrue(CommentOwnership.isUnattributedText(text))
        XCTAssertTrue(CommentOwnership.mayHandle(text, ownerId: alice, baseIsHis: true))
        XCTAssertFalse(CommentOwnership.mayHandle(text, ownerId: nil, baseIsHis: true))
        let withPieces = text.withMedia(localMediaPaths: ["pending-media/x/0.jpg"], localMediaMimeTypes: nil, uploadedMedia: nil)
        XCTAssertFalse(CommentOwnership.isUnattributedText(withPieces))
        XCTAssertFalse(CommentOwnership.mayHandle(withPieces, ownerId: alice, baseIsHis: true),
                       "Des pièces sans propriétaire ne se montrent ni ne se reprennent : elles partent à la purge.")
        XCTAssertFalse(CommentOwnership.mayHandle(comment("c"), ownerId: bob, baseIsHis: true), "La ligne d'Alice n'est pas à Bob.")
    }

    func test_anInheritedRow_canBeDiscardedByTheAccountWhoseBaseItIs() async throws {
        let cmid = ClientMutationId.generate()
        _ = try await enqueueInheritedText(cmid)
        let refused = await queue.cancelCreateComment(clientMutationId: cmid, ownerId: nil)
        XCTAssertFalse(refused)
        let removed = await queue.cancelCreateComment(clientMutationId: cmid, ownerId: alice)
        XCTAssertTrue(removed)
    }

    /// **Garde de source** : aucun code n'écrit un auteur sur une ligne déjà
    /// persistée. La seule écriture de `authorId` hors d'une construction
    /// neuve est la recopie à l'identique de `withMedia`.
    func test_noCodeWritesAnAuthorOntoAPersistedRow() throws {
        let file = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("Sources/MeeshySDK/Persistence/OfflineQueue+CommentMedia.swift")
        let source = try String(contentsOf: file, encoding: .utf8)
        let code = source.components(separatedBy: "\n")
            .filter { !$0.trimmingCharacters(in: .whitespaces).hasPrefix("//") }.joined(separator: "\n")
        XCTAssertFalse(code.contains("adopting("), "Le code d'adoption est revenu.")
        XCTAssertFalse(code.contains("needsAdoption"))
        let writes = code.components(separatedBy: "authorId: ").dropFirst().map { String($0.prefix(8)) }
        XCTAssertEqual(writes, ["authorId"], "Une écriture de `authorId` autre que la recopie à l'identique de `withMedia`.")
    }

    // MARK: - La base d'A ouverte, le jeton de B

    /// **La fenêtre de bascule** : B est connecté, la file lit encore la base
    /// de A. « Un compte est connecté » ne suffit pas — il faut la PREUVE que
    /// la base est la sienne, faite sur la connexion même qui lit ou écrit.
    func test_baseOfA_tokenOfB_theInheritedRowIsNeitherListed_norResumable_norDiscardable() async throws {
        let cmid = ClientMutationId.generate()
        let outboxId = try await enqueueInheritedText(cmid)

        let listed = await queue.unsentComments(postId: "post-1", ownerId: bob)
        XCTAssertTrue(listed.isEmpty, "La ligne de la base d'Alice ne se montre pas à Bob.")
        let one = await queue.unsentComment(clientMutationId: cmid, ownerId: bob)
        XCTAssertNil(one)
        let resumed = await queue.resumeInheritedComment(clientMutationId: cmid, ownerId: bob)
        XCTAssertNil(resumed, "Bob ne reprend pas le texte d'une ligne de la base d'Alice.")
        let discarded = await queue.cancelCreateComment(clientMutationId: cmid, ownerId: bob)
        XCTAssertFalse(discarded)
        let stillThere = try await pool.read { db in try OutboxRecord.fetchOne(db, key: outboxId) }
        XCTAssertNotNil(stillThere)
        XCTAssertNil(try payload(outboxId).authorId)
    }

    func test_baseOfA_tokenOfB_bobsOwnCommentIsNotWrittenIntoAlicesBase() async throws {
        do {
            _ = try await queue.enqueueCommentMedia(
                comment("cmid_window_2", author: bob), sourceMediaURLs: [try source("a.jpg", "photo")],
                sourceMediaMimeTypes: nil, ownerId: bob)
            XCTFail("La ligne et ses pièces ne s'écrivent que dans la base de leur auteur.")
        } catch {
            XCTAssertEqual(error as? CommentOwnership.Refusal, .notTheAuthor)
        }
        XCTAssertEqual(try rowCount(), 0)
    }

    // MARK: - La file est rebranchée ENTRE la saisie et la transaction

    /// La base de Bob, ouverte à côté de celle d'Alice.
    private func openBobsBase() throws -> DatabaseQueue {
        let key = try XCTUnwrap(MessageStoreAccountKey(userId: bob, serverOrigin: MeeshyConfig.shared.persistedServerOrigin))
        let other = try DatabaseQueue(path: scratch.appendingPathComponent(key.databaseFileName).path)
        try MessageDatabaseMigrations.runAll(on: other)
        return other
    }

    /// Alice enfile ; pendant l'opération, la file est rebranchée sur la base
    /// de Bob. L'opération n'agit que sur ce qu'elle a saisi : la ligne
    /// d'Alice ne tombe JAMAIS dans la base de Bob.
    func test_rebindDuringAnEnqueue_neverWritesIntoTheOtherAccountsBase() async throws {
        let bobsBase = try openBobsBase()
        await queue.setCommentTransactionHook { await OfflineQueue.shared.configure(pool: bobsBase) }

        _ = try? await queue.enqueueComment(comment("cmid_rebind_1"), ownerId: alice)

        await queue.setCommentTransactionHook(nil)
        let inBobs = try await bobsBase.read { db in try OutboxRecord.fetchCount(db) }
        XCTAssertEqual(inBobs, 0, "Rien n'est écrit dans la base du compte arrivé.")
        let inAlices = try rowCount()
        XCTAssertEqual(inAlices, 1, "La ligne d'Alice est dans SA base, prouvée dans la transaction qui l'écrit.")
        await OfflineQueue.shared.configure(pool: pool)
    }

    /// Le compte a changé (jeton de Bob) et la file tient encore la base
    /// d'Alice au moment de la transaction : la preuve, faite sur la
    /// connexion utilisée, refuse — rien n'est écrit, rien n'est listé.
    func test_tokenChangedAndBaseNotYetRebound_writesNothing_listsNothing() async throws {
        _ = try await enqueueInheritedText("cmid_rebind_2")
        let bobsBase = try openBobsBase()
        // Bob démarre sur SA base ; la file est ramenée sur celle d'Alice
        // entre la saisie de son triplet et la transaction.
        await OfflineQueue.shared.configure(pool: bobsBase)
        let alicesBase: DatabaseQueue = pool
        await queue.setCommentTransactionHook { await OfflineQueue.shared.configure(pool: alicesBase) }

        let outboxId = try? await queue.enqueueComment(comment("cmid_rebind_3", author: bob), ownerId: bob)
        let listed = await queue.unsentComments(postId: "post-1", ownerId: bob)

        await queue.setCommentTransactionHook(nil)
        XCTAssertNotNil(outboxId, "Bob écrit dans la base qu'il a saisie — la sienne.")
        XCTAssertTrue(listed.allSatisfy { $0.payload.authorId == bob }, "Bob ne voit aucune ligne de la base d'Alice.")
        XCTAssertEqual(try rowCount(), 1, "La base d'Alice n'a reçu aucune ligne de Bob.")
        let bobsRows = try await bobsBase.read { db in try OutboxRecord.fetchCount(db) }
        XCTAssertEqual(bobsRows, 1)
        await OfflineQueue.shared.configure(pool: pool)
    }

    /// La saisie elle-même porte sur la base d'un autre : la preuve dans la
    /// transaction est la dernière ligne de défense.
    func test_theInTransactionProof_refusesAContextBuiltOnAnotherAccountsBase() async throws {
        let context = OfflineQueue.CommentContext(ownerId: bob, serverOrigin: MeeshyConfig.shared.persistedServerOrigin, pool: pool)
        let proven = try await pool.read { db in try context.proves(db) }
        XCTAssertFalse(proven, "La connexion ouverte est la base d'Alice : Bob n'y prouve rien.")
        let mine = OfflineQueue.CommentContext(ownerId: alice, serverOrigin: MeeshyConfig.shared.persistedServerOrigin, pool: pool)
        let alices = try await pool.read { db in try mine.proves(db) }
        XCTAssertTrue(alices)
    }

    func test_enqueueComment_writesATextCommentOnlyIntoItsAuthorsBase() async throws {
        let outboxId = try await queue.enqueueComment(comment("cmid_text_1"), ownerId: alice)
        XCTAssertEqual(try payload(outboxId).authorId, alice)
        for (payload, owner) in [(comment("cmid_text_2", author: bob), Optional(bob)),   // base de A, compte B
                                 (comment("cmid_text_3"), Optional(bob)),
                                 (comment("cmid_text_4", author: nil), Optional(alice)),
                                 (comment("cmid_text_5"), String?.none)] {
            do {
                _ = try await queue.enqueueComment(payload, ownerId: owner)
                XCTFail("refus attendu")
            } catch {
                XCTAssertEqual(error as? CommentOwnership.Refusal, .notTheAuthor)
            }
        }
        XCTAssertEqual(try rowCount(), 1)
    }

    func test_baseBelongs_needsTheAccountsOwnFile() throws {
        let origin = "https://gate.meeshy.me"
        let aliceFile = try XCTUnwrap(MessageStoreAccountKey(userId: alice, serverOrigin: origin)).databaseFileName
        XCTAssertTrue(CommentOwnership.baseBelongs(toOwner: alice, databasePath: "/x/\(aliceFile)", serverOrigin: origin))
        XCTAssertFalse(CommentOwnership.baseBelongs(toOwner: bob, databasePath: "/x/\(aliceFile)", serverOrigin: origin),
                       "base de A, compte B")
        XCTAssertFalse(CommentOwnership.baseBelongs(toOwner: alice, databasePath: "/x/\(aliceFile)",
                                                    serverOrigin: "https://staging.meeshy.me"), "même compte, autre environnement")
        XCTAssertFalse(CommentOwnership.baseBelongs(toOwner: alice, databasePath: nil, serverOrigin: origin), "base sans fichier")
        XCTAssertFalse(CommentOwnership.baseBelongs(toOwner: alice, databasePath: "", serverOrigin: origin))
        XCTAssertFalse(CommentOwnership.baseBelongs(toOwner: alice, databasePath: "/x/meeshy_messages.sqlite", serverOrigin: origin),
                       "base héritée non cloisonnée")
        XCTAssertFalse(CommentOwnership.baseBelongs(toOwner: nil, databasePath: "/x/\(aliceFile)", serverOrigin: origin))
        XCTAssertFalse(CommentOwnership.baseBelongs(toOwner: "", databasePath: "/x/\(aliceFile)", serverOrigin: origin))
    }

    // MARK: - Le registre refuse

    /// Le fichier porte l'empreinte d'Alice, mais il a été OUVERT pour Bob :
    /// le registre fait foi, la base n'est pas celle d'Alice.
    func test_theRegistryRefuses_whenTheFileWasOpenedForAnotherAccount() throws {
        let origin = "https://gate.meeshy.me"
        let aliceFile = try XCTUnwrap(MessageStoreAccountKey(userId: alice, serverOrigin: origin)).databaseFileName
        let path = "/registre-\(UUID().uuidString)/\(aliceFile)"
        AccountStoreRegistry.register(databasePath: path, key: try XCTUnwrap(MessageStoreAccountKey(userId: bob, serverOrigin: origin)))
        XCTAssertFalse(CommentOwnership.baseBelongs(toOwner: alice, databasePath: path, serverOrigin: origin))
    }

    func test_theRegistryRefuses_anotherAccountOnABaseOpenedForAlice() throws {
        let path = "/registre-\(UUID().uuidString)/quelconque.sqlite"
        AccountStoreRegistry.register(databasePath: path,
                                      key: try XCTUnwrap(MessageStoreAccountKey(userId: alice, serverOrigin: "https://ancien.example")))
        XCTAssertFalse(CommentOwnership.baseBelongs(toOwner: bob, databasePath: path, serverOrigin: "https://gate.meeshy.me"))
        XCTAssertTrue(CommentOwnership.baseBelongs(toOwner: alice, databasePath: path, serverOrigin: "https://gate.meeshy.me"),
                      "La base ouverte pour Alice reste la sienne si l'environnement a changé depuis.")
    }

    func test_mayHandle_withoutTheProof_handlesNothing_notEvenOnesOwnRow() {
        XCTAssertFalse(CommentOwnership.mayHandle(comment("c", author: nil), ownerId: alice, baseIsHis: false))
        XCTAssertFalse(CommentOwnership.mayHandle(comment("c"), ownerId: alice, baseIsHis: false))
        XCTAssertTrue(CommentOwnership.mayHandle(comment("c"), ownerId: alice, baseIsHis: true))
    }

    func test_anInMemoryBase_provesNothing() async throws {
        let memory = try DatabaseQueue()
        try MessageDatabaseMigrations.runAll(on: memory)
        await OfflineQueue.shared.configure(pool: memory)
        _ = try await queue.enqueue(.createComment, payload: comment("cmid_memory_1", author: nil), conversationId: "post-1")
        let listed = await queue.unsentComments(postId: "post-1", ownerId: alice)
        XCTAssertTrue(listed.isEmpty, "Sans fichier, rien ne prouve à qui est la base.")
        await OfflineQueue.shared.configure(pool: pool)
    }

    // MARK: - Annuler et relancer : l'auteur seul

    func test_cancelAndRetry_areClosedToAnotherAccount() async throws {
        let cmid = "cmid_comment_owner_7"
        let result = try await enqueueTwoPieces(cmid)

        let cancelledByBob = await queue.cancelCreateComment(clientMutationId: cmid, ownerId: bob)
        XCTAssertFalse(cancelledByBob)
        let cancelledByNobody = await queue.cancelCreateComment(clientMutationId: cmid, ownerId: nil)
        XCTAssertFalse(cancelledByNobody)
        XCTAssertTrue(result.localMediaPaths.allSatisfy {
            FileManager.default.fileExists(atPath: OfflineQueue.absoluteMediaPath(forStored: $0))
        }, "Une ligne ne se supprime que sous son auteur — les pièces d'Alice sont intactes.")

        do {
            try await queue.retryCreateComment(clientMutationId: cmid, ownerId: bob)
            XCTFail("Bob ne relance pas le commentaire d'Alice.")
        } catch {
            XCTAssertEqual(error as? CommentOwnership.Refusal, .notTheAuthor)
        }
        try await queue.retryCreateComment(clientMutationId: cmid, ownerId: alice)
        await cleanup(cmid)
    }

    // MARK: - Rien ne reste sur le disque sans une ligne

    func test_sweepOrphanCommentMedia_removesAFolderWithoutARow_andKeepsTheLivingOne() async throws {
        let living = "cmid_comment_sweep_1"
        let result = try await enqueueTwoPieces(living)
        let orphan = URL(fileURLWithPath: OfflineQueue.absoluteMediaPath(
            forStored: "pending-media/comments-\(alice)/cmid_comment_sweep_orphan"), isDirectory: true)
        try FileManager.default.createDirectory(at: orphan, withIntermediateDirectories: true)
        try Data("x".utf8).write(to: orphan.appendingPathComponent("0.jpg"))

        await OfflineQueue.sweepOrphanCommentMedia(ownerId: alice, reader: pool)

        XCTAssertFalse(FileManager.default.fileExists(atPath: orphan.path), "Un dossier sans ligne quitte le disque.")
        XCTAssertTrue(result.localMediaPaths.allSatisfy {
            FileManager.default.fileExists(atPath: OfflineQueue.absoluteMediaPath(forStored: $0))
        }, "Les pièces d'une ligne vivante restent.")
        await cleanup(living)
    }

    func test_purgePendingCommentMedia_keepingOwners_dropsEveryOtherAccount() async throws {
        let mine = "cmid_comment_sweep_2"
        let result = try await enqueueTwoPieces(mine)
        let bobFolder = URL(fileURLWithPath: OfflineQueue.absoluteMediaPath(
            forStored: "pending-media/comments-\(bob)/cmid_b"), isDirectory: true)
        try FileManager.default.createDirectory(at: bobFolder, withIntermediateDirectories: true)

        OfflineQueue.purgePendingCommentMedia(keepingOwners: [alice])

        XCTAssertFalse(FileManager.default.fileExists(atPath: bobFolder.path))
        XCTAssertTrue(FileManager.default.fileExists(
            atPath: OfflineQueue.absoluteMediaPath(forStored: try XCTUnwrap(result.localMediaPaths.first))))
        await cleanup(mine)
    }

    // MARK: - Le plafond du disque

    func test_quota_refusesWhatWouldExceedTheCeiling() {
        XCTAssertTrue(CommentMediaQuota.admits(incoming: 10, alreadyStored: 80, ceiling: 100))
        XCTAssertTrue(CommentMediaQuota.admits(incoming: 20, alreadyStored: 80, ceiling: 100))
        XCTAssertFalse(CommentMediaQuota.admits(incoming: 21, alreadyStored: 80, ceiling: 100))
        XCTAssertFalse(CommentMediaQuota.admits(incoming: 1, alreadyStored: 500, ceiling: 100))
        XCTAssertFalse(CommentMediaQuota.admits(incoming: -1, alreadyStored: 0, ceiling: 100))
    }

    func test_purgePendingCommentMedia_removesOnlyThatAccountsPieces() async throws {
        let mine = "cmid_comment_owner_6"
        let result = try await enqueueTwoPieces(mine)
        let aliceFile = OfflineQueue.absoluteMediaPath(forStored: try XCTUnwrap(result.localMediaPaths.first))
        let bobFolder = URL(fileURLWithPath: OfflineQueue.absoluteMediaPath(
            forStored: "pending-media/comments-\(bob)/cmid_b"), isDirectory: true)
        try FileManager.default.createDirectory(at: bobFolder, withIntermediateDirectories: true)
        let bobFile = bobFolder.appendingPathComponent("0.jpg")
        try Data("b".utf8).write(to: bobFile)

        OfflineQueue.purgePendingCommentMedia(ownerId: alice)

        XCTAssertFalse(FileManager.default.fileExists(atPath: aliceFile), "À la déconnexion, les pièces du compte quittent le disque.")
        XCTAssertTrue(FileManager.default.fileExists(atPath: bobFile.path), "Celles d'un autre compte ne sont pas touchées.")
        OfflineQueue.purgePendingCommentMedia(ownerId: bob)
        await cleanup(mine)
    }

    func test_mediaDirectoryName_cannotEscapeItsFolder_andNeedsAnOwner() {
        XCTAssertEqual(CommentOwnership.mediaDirectoryName(ownerId: "../../etc"), "comments-etc")
        XCTAssertNil(CommentOwnership.mediaDirectoryName(ownerId: nil))
        XCTAssertNil(CommentOwnership.mediaDirectoryName(ownerId: ""))
        XCTAssertNil(CommentOwnership.mediaDirectoryName(ownerId: "../.."))
    }

    // MARK: - Une file gravée avant ce lot se relit

    func test_aRowWrittenBeforeTheFields_stillDecodes() throws {
        let legacy = Data(#"{"clientMutationId":"cmid_x","postId":"p","content":"salut"}"#.utf8)
        let decoded = try JSONDecoder().decode(CreateCommentPayload.self, from: legacy)
        XCTAssertNil(decoded.localMediaPaths)
        XCTAssertNil(decoded.uploadedMedia)
        XCTAssertNil(decoded.authorId)
    }
}
