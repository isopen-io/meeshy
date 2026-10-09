import XCTest
import MeeshySDK
@testable import Meeshy

/// **Le rejeu d'un commentaire avec pièces, EXÉCUTÉ** (#9743, audit constat 6).
///
/// Les gardes de ce lot étaient prouvées par du texte (`code.contains`) : aucun
/// témoin n'exécutait `dispatchCreateComment`. Ceux-ci le font, avec un
/// publieur dont le réseau est un journal — ce qui part, sous quel jeton, et
/// ce qu'il advient des fichiers.
@MainActor
final class CommentReplayDispatchTests: XCTestCase {

    private let alice = "66f0a1b2c3d4e5f6000000a1"
    private let bob = "66f0a1b2c3d4e5f6000000b0"
    private var created: [String] = []

    override func tearDown() async throws {
        for path in created { try? FileManager.default.removeItem(atPath: path) }
        created = []
        OfflineQueue.purgePendingCommentMedia(ownerId: alice)
    }

    /// Une ligne de la file d'Alice, avec `pieces` fichiers RÉELS sous son
    /// dossier durable.
    private func makeRow(pieces: Int, author: String? = "66f0a1b2c3d4e5f6000000a1",
                         missingIndex: Int? = nil,
                         acquired: [UploadedCommentMedia]? = nil) throws -> (record: OutboxRecord, files: [String]) {
        let cmid = "cmid_" + UUID().uuidString.lowercased()
        let folder = "pending-media/comments-\(alice)/\(cmid)"
        let directory = OfflineQueue.absoluteMediaPath(forStored: folder)
        try FileManager.default.createDirectory(atPath: directory, withIntermediateDirectories: true)
        created.append(directory)
        let relative = (0..<pieces).map { "\(folder)/\($0).jpg" }
        for (index, path) in relative.enumerated() where index != missingIndex {
            try Data("octets-\(index)".utf8).write(to: URL(fileURLWithPath: OfflineQueue.absoluteMediaPath(forStored: path)))
        }
        let payload = CreateCommentPayload(
            clientMutationId: cmid, postId: "post-1", parentCommentId: nil, content: "regarde",
            originalLanguage: "fr", authorId: author,
            localMediaPaths: relative.isEmpty ? nil : relative, uploadedMedia: acquired)
        let record = OutboxRecord(id: "ofqm_\(cmid)", kind: .createComment, conversationId: "post-1",
                                  clientMessageId: cmid, payload: try JSONEncoder().encode(payload))
        return (record, relative.map { OfflineQueue.absoluteMediaPath(forStored: $0) })
    }

    private func exists(_ paths: [String]) -> [Bool] { paths.map { FileManager.default.fileExists(atPath: $0) } }

    private func outcome(_ record: OutboxRecord, _ spy: CommentPublisherSpy) async -> Error? {
        do {
            try await OutboxDispatcher().dispatchCreateComment(record, publisher: spy.publisher)
            return nil
        } catch {
            return error
        }
    }

    private func isDeferral(_ error: Error?) -> Bool {
        if case MeeshyError.auth? = error { return true }
        return false
    }

    // MARK: - La file rejoue un commentaire avec deux pièces

    func test_replay_uploadsBothPieces_createsOnce_thenRemovesTheFiles() async throws {
        let row = try makeRow(pieces: 2)
        let aliceToken = TestSessionToken.make(userId: alice)
        let spy = CommentPublisherSpy(token: aliceToken)

        let error = await outcome(row.record, spy)

        XCTAssertNil(error)
        XCTAssertEqual(spy.uploadTokens, [aliceToken, aliceToken])
        XCTAssertEqual(spy.created.count, 1, "Pas de doublon : une ligne, une création.")
        XCTAssertEqual(spy.created.first?.clientMutationId, row.record.clientMessageId)
        XCTAssertEqual(spy.createAttachmentIds, [["media0", "media1"]])
        XCTAssertEqual(exists(row.files), [false, false], "Le commentaire est créé : ses fichiers ne servent plus.")
    }

    func test_replay_doesNotReuploadAnAcquiredPiece() async throws {
        let done = UploadedCommentMedia(sourceIndex: 0, id: "acquis", uploadedAt: Date().timeIntervalSince1970)
        let row = try makeRow(pieces: 2, acquired: [done])
        let spy = CommentPublisherSpy(token: TestSessionToken.make(userId: alice))

        let error = await outcome(row.record, spy)

        XCTAssertNil(error)
        XCTAssertEqual(spy.uploadTokens.count, 1)
        XCTAssertEqual(spy.createAttachmentIds, [["acquis", "media1"]])
    }

    func test_replay_reuploadsAPieceTheServerHasSweptByNow() async throws {
        let stale = UploadedCommentMedia(sourceIndex: 0, id: "balayé",
                                         uploadedAt: Date().timeIntervalSince1970 - 21 * 60 * 60)
        let row = try makeRow(pieces: 1, acquired: [stale])
        let spy = CommentPublisherSpy(token: TestSessionToken.make(userId: alice))

        _ = await outcome(row.record, spy)

        XCTAssertEqual(spy.createAttachmentIds, [["media0"]], "Un id que le serveur n'a plus ne se présente pas.")
    }

    // MARK: - Le compte change PENDANT la montée ⇒ aucun POST

    func test_accountSwitchDuringTheUpload_sendsNoCreation_andKeepsTheRowsFiles() async throws {
        let row = try makeRow(pieces: 2)
        let spy = CommentPublisherSpy(token: TestSessionToken.make(userId: alice))
        let bobToken = TestSessionToken.make(userId: bob)
        spy.afterUpload = { spy.token = bobToken }

        let error = await outcome(row.record, spy)

        XCTAssertTrue(spy.created.isEmpty, "Aucune création ne part sous l'autre compte.")
        XCTAssertFalse(spy.uploadTokens.contains(bobToken), "Aucune pièce ne part sous l'autre compte.")
        XCTAssertTrue(isDeferral(error), "Un refus REPORTE la ligne : il ne l'épuise pas et ne la détruit pas.")
        XCTAssertEqual(exists(row.files), [true, true], "Les pièces d'Alice restent pour son retour.")
    }

    // MARK: - Personne n'est connecté ⇒ la ligne reste intacte

    func test_noCurrentSession_sendsNothing_destroysNothing_andDefers() async throws {
        let row = try makeRow(pieces: 1)
        let spy = CommentPublisherSpy(token: nil)

        let error = await outcome(row.record, spy)

        XCTAssertTrue(spy.uploadTokens.isEmpty)
        XCTAssertTrue(spy.created.isEmpty)
        XCTAssertTrue(isDeferral(error), "Une session absente est transitoire : la ligne attend, sans consommer son budget.")
        XCTAssertEqual(exists(row.files), [true])
    }

    func test_anotherAccount_sendsNothing_andLeavesTheRowIntact() async throws {
        let row = try makeRow(pieces: 1)
        let spy = CommentPublisherSpy(token: TestSessionToken.make(userId: bob))

        let error = await outcome(row.record, spy)

        XCTAssertTrue(spy.uploadTokens.isEmpty)
        XCTAssertTrue(spy.created.isEmpty)
        XCTAssertTrue(isDeferral(error))
        XCTAssertEqual(exists(row.files), [true], "Un changement de compte n'efface pas les commentaires du compte légitime.")
    }

    // MARK: - Fermé par défaut

    /// **Une ligne héritée sans auteur : zéro rejeu automatique**, et la
    /// ligne s'ÉPUISE (elle devient visible « non envoyée ») au lieu d'attendre
    /// sans fin et sans se montrer.
    func test_aRowWithoutAuthor_isNeverReplayedAutomatically_evenAsText() async throws {
        for author in [String?.none, "", "  "] {
            let row = try makeRow(pieces: 0, author: author)
            let spy = CommentPublisherSpy(token: TestSessionToken.make(userId: alice))

            let error = await outcome(row.record, spy)

            XCTAssertTrue(spy.created.isEmpty, "Une entrée sans propriétaire lisible ne part jamais d'elle-même.")
            guard case MeeshyError.server(let status, _)? = error else { return XCTFail("échec permanent attendu") }
            XCTAssertEqual(status, 422, "La ligne s'épuise : elle se voit « non envoyée », relançable à la main.")
        }
    }

    /// La relance MANUELLE lui donne pour auteur le compte connecté
    /// (`OfflineQueue.retryCreateComment`, témoin du SDK) : le rejeu qui suit
    /// crée UNE fois, sous le jeton de ce compte.
    func test_onceAdoptedByItsAccount_theInheritedRow_isCreatedOnce_underThatAccount() async throws {
        let adopted = try makeRow(pieces: 0, author: alice)
        let aliceToken = TestSessionToken.make(userId: alice)
        let spy = CommentPublisherSpy(token: aliceToken)

        let error = await outcome(adopted.record, spy)

        XCTAssertNil(error)
        XCTAssertEqual(spy.created.count, 1)
        XCTAssertEqual(spy.createTokens, [aliceToken])
    }

    func test_aRowWhoseFilesAreNotInItsAuthorsFolder_isRefused() async throws {
        let row = try makeRow(pieces: 1, author: bob)   // fichiers d'Alice, ligne « de Bob »
        let spy = CommentPublisherSpy(token: TestSessionToken.make(userId: bob))

        let error = await outcome(row.record, spy)

        XCTAssertNotNil(error)
        XCTAssertTrue(spy.uploadTokens.isEmpty, "La ligne d'un compte ne lit pas les fichiers d'un autre.")
        XCTAssertTrue(spy.created.isEmpty)
        XCTAssertEqual(exists(row.files), [true])
    }

    // MARK: - Une pièce manquante ⇒ rien ne part

    func test_aMissingPiece_sendsNothing_notEvenTheRest() async throws {
        let row = try makeRow(pieces: 2, missingIndex: 1)
        let spy = CommentPublisherSpy(token: TestSessionToken.make(userId: alice))

        let error = await outcome(row.record, spy)

        XCTAssertTrue(spy.uploadTokens.isEmpty, "Un commentaire ne part pas amputé.")
        XCTAssertTrue(spy.created.isEmpty)
        guard case MeeshyError.server(let status, _)? = error else { return XCTFail("échec permanent attendu, reçu \(String(describing: error))") }
        XCTAssertEqual(status, 422)
        XCTAssertEqual(exists(row.files), [true, false], "Ce qui reste n'est pas supprimé : la ligne se voit « non envoyée ».")
    }

    func test_aFailedUpload_reportsTheRealCause_andKeepsEverything() async throws {
        let row = try makeRow(pieces: 2)
        let spy = CommentPublisherSpy(token: TestSessionToken.make(userId: alice))
        spy.uploadFailureAtIndex = 1

        let error = await outcome(row.record, spy)

        XCTAssertTrue(error is CommentPublisherSpy.TestFailure)
        XCTAssertTrue(spy.created.isEmpty)
        XCTAssertEqual(exists(row.files), [true, true])
    }

    // MARK: - 410 : déjà créé

    func test_aGoneAnswer_meansTheCommentAlreadyExists() async throws {
        let row = try makeRow(pieces: 1)
        let spy = CommentPublisherSpy(token: TestSessionToken.make(userId: alice))
        spy.createFailure = MeeshyError.server(statusCode: 410, message: "déjà appliqué")

        let error = await outcome(row.record, spy)

        XCTAssertNil(error, "Le serveur a déjà ce commentaire : la ligne se clôt, elle ne s'affiche pas en erreur.")
        XCTAssertEqual(exists(row.files), [false])
    }

    func test_aServerRefusal_staysAFailure() async throws {
        let row = try makeRow(pieces: 1)
        let spy = CommentPublisherSpy(token: TestSessionToken.make(userId: alice))
        spy.createFailure = MeeshyError.server(statusCode: 404, message: "publication retirée")

        let error = await outcome(row.record, spy)

        guard case MeeshyError.server(let status, _)? = error else { return XCTFail("refus attendu") }
        XCTAssertEqual(status, 404)
        XCTAssertEqual(exists(row.files), [true], "Un échec garde ses pièces : il reste relançable.")
    }
}

/// Le corps HTTP du rejeu, et la ligne « non envoyé » relue de la file.
@MainActor
final class CommentOfflineMediaTests: XCTestCase {

    private func payload(_ cmid: String = "cmid_00000000-0000-4000-8000-000000009743") -> CreateCommentPayload {
        CreateCommentPayload(clientMutationId: cmid, postId: "post-1", parentCommentId: "racine",
                             content: "regarde", originalLanguage: "fr", authorId: "user-1", effectFlags: 4)
    }

    private func json(_ data: Data) throws -> [String: Any] {
        try XCTUnwrap(try JSONSerialization.jsonObject(with: data) as? [String: Any])
    }

    func test_theReplayedBody_carriesBothPieces_inTheAuthorsOrder() throws {
        let uploaded = [
            UploadedCommentMedia(sourceIndex: 1, id: "media1", uploadedAt: 10),
            UploadedCommentMedia(sourceIndex: 0, id: "media0", uploadedAt: 20),
        ]
        let body = try json(CreateCommentBody.encoded(for: payload(),
                                                      attachmentIds: CommentMediaReplay.attachmentIds(uploaded)))
        XCTAssertEqual(body["attachmentIds"] as? [String], ["media0", "media1"])
        XCTAssertEqual(body["content"] as? String, "regarde")
        XCTAssertEqual(body["parentId"] as? String, "racine")
        XCTAssertNil(body["authorId"], "L'auteur ne voyage pas dans le corps : c'est le jeton qui le dit au serveur.")
    }

    func test_theReplayedBody_ofATextComment_hasNoAttachmentKey() throws {
        let body = try json(CreateCommentBody.encoded(for: payload()))
        XCTAssertNil(body["attachmentIds"], "Un commentaire sans pièce rejoue comme avant le champ.")
    }

    func test_row_keepsTheClientIdentifier_theText_andThePieces() {
        let cmid = "cmid_00000000-0000-4000-8000-000000000001"
        let unsent = UnsentComment(
            payload: payload(cmid), isFailed: true, lastError: "503",
            createdAt: Date(timeIntervalSince1970: 100),
            localMediaURLs: [URL(fileURLWithPath: "/tmp/0.jpg"), URL(fileURLWithPath: "/tmp/1.m4a")])
        let row = CommentUnsent.row(for: unsent, author: nil)
        XCTAssertEqual(row.id, cmid, "Le même identifiant que la ligne optimiste : l'écho du serveur la remplace en place.")
        XCTAssertEqual(row.content, "regarde")
        XCTAssertEqual(row.parentId, "racine")
        XCTAssertEqual(row.effectFlags, 4)
        XCTAssertEqual(row.media.map(\.type), [.image, .audio])
        XCTAssertEqual(row.media.first?.url, "file:///tmp/0.jpg")
        XCTAssertTrue(CommentUnsent.isLocal(row.id))
    }

    func test_merging_addsWhatTheListLacks_once() {
        let server = FeedComment(id: "c1", author: "a", content: "x")
        let unsent = FeedComment(id: "cmid_a", author: "moi", content: "y")
        let merged = CommentUnsent.merging([unsent], into: [server])
        XCTAssertEqual(merged.map(\.id), ["cmid_a", "c1"])
        XCTAssertEqual(CommentUnsent.merging([unsent], into: merged).map(\.id), ["cmid_a", "c1"])
    }

    func test_resuming_putsTheInheritedTextInTheDraft_withoutLosingWhatIsThere() {
        XCTAssertEqual(CommentUnsent.resuming("écrit avant", into: ""), "écrit avant")
        XCTAssertEqual(CommentUnsent.resuming("écrit avant", into: "  "), "écrit avant")
        XCTAssertEqual(CommentUnsent.resuming("écrit avant", into: "en cours"), "en cours\nécrit avant")
    }

    func test_isLocal_isFalseForAServerRow() {
        XCTAssertFalse(CommentUnsent.isLocal("66f0a1b2c3d4e5f601234567"))
    }
}

/// Le câblage que seul le texte peut tenir — ce que les témoins ci-dessus
/// n'exécutent pas : les hôtes SwiftUI, et la déconnexion.
final class CommentOfflineMediaWiringGuardTests: XCTestCase {

    private func source(_ relative: String) throws -> String {
        let root = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
        let text = try String(contentsOf: root.appendingPathComponent("Meeshy/\(relative)"), encoding: .utf8)
        return AppSourceGuard.stripComments(text)
    }

    func test_everyCommentHost_entrustsAFailedSendWithItsPieces() throws {
        for host in ["Features/Main/Views/FeedCommentsSheet.swift",
                     "Features/Main/ViewModels/PostDetailViewModel+CommentSend.swift",
                     "Features/Main/Views/StoryViewerView+Content.swift"] {
            let code = try source(host)
            XCTAssertTrue(code.contains("CommentMediaDelivery.entrust(payload, medias:"),
                          "\(host) n'emporte pas les pièces d'un commentaire dont l'envoi échoue.")
            XCTAssertTrue(code.contains("CommentMediaDelivery.acquired(from: error)"),
                          "\(host) re-téléverserait ce que l'envoi direct a déjà monté.")
            XCTAssertTrue(code.contains("authorId: "), "\(host) : la charge ne déclare pas son auteur.")
        }
    }

    func test_entrusting_recordsTheVerifiedAccount_once_forTheRowAndItsFolder() throws {
        let code = try source("Features/Main/Views/CommentComposerMedia.swift")
        let entrust = try XCTUnwrap(code.range(of: "static func entrust("))
        let enqueue = try XCTUnwrap(code.range(of: "OfflineQueue.shared.enqueueComment(payload, ownerId: owner)", range: entrust.upperBound..<code.endIndex))
        XCTAssertTrue(code[entrust.upperBound..<enqueue.lowerBound].contains("let owner = try confirmAuthor(payload)"),
                      "L'enfilement arrive après une attente réseau : le compte a pu changer.")
        XCTAssertTrue(code.contains("ownerId: owner"), "Le dossier des pièces doit être celui du compte vérifié, pas une seconde lecture.")
    }

    func test_anAbandonedComment_staysOnScreen_andOnlyItsAuthorActsOnIt() throws {
        XCTAssertTrue(try source("Features/Main/Views/CommentRowView.swift").contains("CommentUnsentBadge("),
                      "La ligne d'un commentaire non envoyé ne porte plus sa marque.")
        let badge = try source("Features/Main/Views/CommentUnsentBadge.swift")
        XCTAssertTrue(badge.contains("retryCreateComment(clientMutationId: commentId, ownerId: CommentPublisher.currentAccountId())"))
        XCTAssertTrue(badge.contains("clientMutationId: commentId, ownerId: CommentPublisher.currentAccountId())"))
        XCTAssertFalse(badge.contains("retryByClientMessageId("), "Une relance sans garde de propriétaire.")
        XCTAssertTrue(badge.contains("resumeInheritedComment("),
                      "Une ligne héritée ne se relance pas : son texte se REPREND dans le composeur.")
        XCTAssertTrue(badge.contains("\"story.mine.failed.resume\""))
        let sheet = try source("Features/Main/Views/FeedCommentsSheet.swift")
        XCTAssertFalse(sheet.contains("if case .exhausted = event"),
                       "La feuille retire de l'écran un commentaire que la file abandonne : il doit rester, relançable.")
        XCTAssertTrue(sheet.contains(".unsentComments(restore:"))
        XCTAssertTrue(try source("Features/Main/Views/FeedCommentsSheet+Attachments.swift")
            .contains("unsentComments(postId: post.id, ownerId: CommentPublisher.currentAccountId())"))
    }

    /// **Le fil, le détail et la story n'ont qu'UNE porte vers les lignes en
    /// attente** : la file, qui exige la preuve que la base ouverte est celle
    /// du compte du jeton (`OfflineQueueCommentMediaTests`, « base de A,
    /// jeton de B »). Aucun écran ne lit, ne relance ni ne supprime une ligne
    /// sans lui remettre le compte que le JETON désigne.
    func test_everyScreen_handsTheTokensAccount_toTheQueue_andReadsNoRowItself() throws {
        let root = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("Meeshy")
        let files = (FileManager.default.enumerator(at: root, includingPropertiesForKeys: nil)?
            .compactMap { $0 as? URL } ?? []).filter { $0.pathExtension == "swift" }
        XCTAssertGreaterThan(files.count, 500)
        let doors = ["unsentComments(postId:", "unsentComment(clientMutationId:",
                     "retryCreateComment(clientMutationId:", "cancelCreateComment("]
        var calls = 0
        var offenders: [String] = []
        for file in files {
            let code = AppSourceGuard.stripComments(try String(contentsOf: file, encoding: .utf8))
            for line in code.components(separatedBy: "\n") where doors.contains(where: { line.contains($0) }) {
                calls += 1
            }
            // Chaque appel tient sur deux lignes au plus : on juge la fenêtre.
            let lines = code.components(separatedBy: "\n")
            for (index, line) in lines.enumerated() where doors.contains(where: { line.contains($0) }) {
                let window = lines[index...min(index + 1, lines.count - 1)].joined(separator: " ")
                if !window.contains("ownerId: CommentPublisher.currentAccountId()") {
                    offenders.append("\(file.lastPathComponent):\(index + 1)")
                }
            }
        }
        XCTAssertGreaterThanOrEqual(calls, 4, "les portes de la file ne sont plus trouvées — ce témoin ne garderait rien")
        XCTAssertEqual(offenders, [], "Une ligne en attente se lit ou se relance sans le compte du jeton.")
    }

    // MARK: - Aucun enfilement de commentaire hors de `enqueueComment`

    /// **L'interdiction** : l'entrée générique de la file n'écrit plus jamais
    /// une ligne de commentaire. Elle n'exige aucune preuve de base — un
    /// commentaire de B y tombait dans la base de A pendant une bascule.
    func test_noFile_enqueuesACommentThroughTheGenericEntry() throws {
        let root = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("Meeshy")
        let files = (FileManager.default.enumerator(at: root, includingPropertiesForKeys: nil)?
            .compactMap { $0 as? URL } ?? []).filter { $0.pathExtension == "swift" }
        XCTAssertGreaterThan(files.count, 500)
        let offenders = try files.filter { file in
            AppSourceGuard.stripComments(try String(contentsOf: file, encoding: .utf8))
                .components(separatedBy: .whitespacesAndNewlines).joined()
                .contains("enqueue(.createComment")
        }.map(\.lastPathComponent)
        XCTAssertEqual(offenders, [], "Un commentaire s'enfile hors de `enqueueComment`, donc sans preuve de base.")
    }

    func test_thePostDetail_enqueuesItsCommentAndItsReply_throughTheProvenEntry() throws {
        let code = try source("Features/Main/ViewModels/PostDetailViewModel+CommentSend.swift")
        XCTAssertEqual(code.components(separatedBy: "offlineQueue.enqueueComment(payload, ownerId: CommentPublisher.currentAccountId())").count - 1, 2)
    }

    func test_theFeed_enqueuesItsComment_throughTheProvenEntry() throws {
        XCTAssertTrue(try source("Features/Main/ViewModels/FeedViewModel.swift")
            .contains("offlineQueue.enqueueComment(payload, ownerId: CommentPublisher.currentAccountId())"))
    }

    func test_theNotificationReply_enqueuesItsComment_throughTheProvenEntry() throws {
        XCTAssertTrue(try source("Features/Main/Services/NotificationActionHandler.swift")
            .contains("replyQueue.enqueueComment(comment, ownerId: currentUserId())"))
    }

    func test_theFailedSendFallback_enqueuesThroughTheProvenEntries() throws {
        let code = try source("Features/Main/Views/CommentComposerMedia.swift")
        XCTAssertTrue(code.contains("OfflineQueue.shared.enqueueComment(payload, ownerId: owner)"))
        XCTAssertTrue(code.contains("OfflineQueue.shared.enqueueCommentMedia("))
    }

    /// Refusé par la file (bascule de compte en cours), le commentaire n'est
    /// écrit nulle part ailleurs : il revient dans le composeur.
    func test_aRefusedComment_returnsToTheComposer_textPiecesAndPlace() throws {
        let sheet = try source("Features/Main/Views/FeedCommentsSheet.swift")
        XCTAssertTrue(sheet.contains("restoreRefusedComment(text: trimmed, attachments: staged, place: place)"))
        let detail = try source("Features/Main/Views/PostDetailView+CommentComposer.swift")
        XCTAssertTrue(detail.contains("guard !sent else { return }"))
        XCTAssertTrue(detail.contains("composerText = trimmed"))
        XCTAssertTrue(detail.contains("commentAttachments = staged"))
    }

    func test_removingAnAccount_removesItsPendingPieces() throws {
        let container = try source("Core/DependencyContainer.swift")
        XCTAssertEqual(container.components(separatedBy: "OfflineQueue.purgePendingCommentMedia(ownerId: session.key?.userId)").count - 1, 2,
                       "La déconnexion ET le retrait d'un compte emportent ses pièces en attente.")
        XCTAssertTrue(container.contains("OfflineQueue.purgePendingCommentMedia(keepingOwners:"),
                      "Les comptes que l'appareil ne garde plus laissent leurs pièces sur le disque.")
    }
}
