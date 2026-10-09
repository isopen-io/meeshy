import XCTest
import MeeshySDK
@testable import Meeshy

/// **Un commentaire avec média envoyé hors ligne garde son média** (#9743).
///
/// La file (témoins du SDK, `OfflineQueueCommentMediaTests`) garde les
/// fichiers et les acquis ; ces témoins-ci tiennent le dernier mètre côté
/// app : le corps HTTP du rejeu, ce que l'envoi direct lègue à la file, et la
/// ligne « non envoyé » relue après un redémarrage.
@MainActor
final class CommentOfflineMediaTests: XCTestCase {

    private func payload(_ cmid: String = "cmid_00000000-0000-4000-8000-000000009743") -> CreateCommentPayload {
        CreateCommentPayload(clientMutationId: cmid, postId: "post-1", parentCommentId: "racine",
                             content: "regarde", originalLanguage: "fr", effectFlags: 4,
                             localMediaPaths: ["pending-media/\(cmid)/0.jpg", "pending-media/\(cmid)/1.m4a"])
    }

    private func json(_ data: Data) throws -> [String: Any] {
        try XCTUnwrap(try JSONSerialization.jsonObject(with: data) as? [String: Any])
    }

    // MARK: - Le corps du rejeu

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
    }

    func test_theReplayedBody_ofATextComment_hasNoAttachmentKey() throws {
        let body = try json(CreateCommentBody.encoded(for: payload()))
        XCTAssertNil(body["attachmentIds"], "Un commentaire sans pièce rejoue comme avant le champ.")
    }

    // MARK: - Ce que l'envoi direct lègue à la file

    func test_acquired_readsWhatAnInterruptedUploadAlreadyGot() {
        let done = UploadedCommentMedia(sourceIndex: 0, id: "media0", uploadedAt: 1)
        let interrupted = CommentMediaUploader.Interrupted(acquired: [done], underlying: URLError(.notConnectedToInternet))
        XCTAssertEqual(CommentMediaDelivery.acquired(from: interrupted, known: []), [done])
    }

    func test_acquired_keepsEverything_whenOnlyTheCreationFailed() {
        let all = [UploadedCommentMedia(sourceIndex: 0, id: "media0", uploadedAt: 1),
                   UploadedCommentMedia(sourceIndex: 1, id: "media1", uploadedAt: 1)]
        XCTAssertEqual(CommentMediaDelivery.acquired(from: URLError(.timedOut), known: all), all)
    }

    func test_attachmentIds_isAbsentWithoutPieces() {
        XCTAssertNil(CommentMediaUploader.attachmentIds([]))
    }

    // MARK: - La ligne « non envoyé », relue de la file

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

    func test_isLocal_isFalseForAServerRow() {
        XCTAssertFalse(CommentUnsent.isLocal("66f0a1b2c3d4e5f601234567"))
    }
}

/// Le câblage — trois hôtes, un seul chemin vers la file.
final class CommentOfflineMediaWiringGuardTests: XCTestCase {

    private func source(_ relative: String) throws -> String {
        let root = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
        let text = try String(contentsOf: root.appendingPathComponent("Meeshy/Features/Main/\(relative)"), encoding: .utf8)
        return AppSourceGuard.stripComments(text)
    }

    func test_everyCommentHost_entrustsAFailedSendWithItsPieces() throws {
        for host in ["Views/FeedCommentsSheet.swift",
                     "ViewModels/PostDetailViewModel+CommentSend.swift",
                     "Views/StoryViewerView+Content.swift"] {
            let code = try source(host)
            XCTAssertTrue(code.contains("CommentMediaDelivery.entrust("),
                          "\(host) n'emporte pas les pièces d'un commentaire dont l'envoi échoue.")
            XCTAssertTrue(code.contains("CommentMediaDelivery.acquired(from: error"),
                          "\(host) re-téléverserait ce que l'envoi direct a déjà monté.")
        }
    }

    func test_theReplay_uploadsAsCommentMedia_recordsEachPiece_andKeepsTheClientId() throws {
        let code = try source("Services/OutboxDispatcher+Comments.swift")
        XCTAssertTrue(code.contains("uploadContext: \"comment\""),
                      "Sans ce contexte le serveur crée une pièce de MESSAGE, que le commentaire ne réclame pas.")
        XCTAssertTrue(code.contains("recordUploadedCommentMedia("),
                      "Un téléversement acquis doit être gravé sur la ligne, sinon chaque rejeu repart de zéro.")
        XCTAssertTrue(code.contains("\"X-Client-Mutation-Id\": payload.clientMutationId"),
                      "L'identifiant client dédoublonne un rejeu dont la première réponse s'est perdue.")
        XCTAssertTrue(code.contains("CommentMediaReplay.plan("))
    }

    /// **Contrôle d'accès** : une entrée écrite par A n'est ni rejouée, ni
    /// enfilée, ni montrée sous B. La règle est dans le SDK
    /// (`CommentOwnership`, témoins `OfflineQueueCommentMediaTests`) ; ces
    /// gardes tiennent ses QUATRE points de passage côté app.
    func test_theReplay_isClosedToAnyAccountButTheAuthor_beforeAnythingIsSent() throws {
        let code = try source("Services/OutboxDispatcher+Comments.swift")
        let gate = try XCTUnwrap(code.range(of: "guard CommentOwnership.mayReplay(payload, currentUserId: AuthManager.shared.currentUser?.id) else {"),
                                 "Le rejeu ne compare plus l'auteur de la ligne au compte courant.")
        let upload = try XCTUnwrap(code.range(of: "uploadedCommentMedia(for: payload"))
        let post = try XCTUnwrap(code.range(of: "requestWithHeaders("))
        XCTAssertLessThan(gate.lowerBound, upload.lowerBound, "La garde doit précéder le téléversement.")
        XCTAssertLessThan(gate.lowerBound, post.lowerBound, "La garde doit précéder la création.")
        XCTAssertTrue(code.contains("cancelCreateComment(clientMutationId: payload.clientMutationId)"),
                      "Une ligne étrangère doit quitter le disque avec ses pièces, pas attendre un autre rejeu.")
    }

    func test_entrusting_andUploading_recheckTheAuthorRecordedAtCompose() throws {
        let code = try source("Views/CommentComposerMedia.swift")
        let entrust = try XCTUnwrap(code.range(of: "static func entrust("))
        let enqueue = try XCTUnwrap(code.range(of: "OfflineQueue.shared.enqueue(", range: entrust.upperBound..<code.endIndex))
        XCTAssertTrue(code[entrust.upperBound..<enqueue.lowerBound].contains("try confirmAuthor(payload.authorId)"),
                      "L'enfilement arrive après une attente réseau : le compte a pu changer.")
        XCTAssertTrue(code.contains("ownerId: AuthManager.shared.currentUser?.id"))
        XCTAssertEqual(code.components(separatedBy: "try CommentMediaDelivery.confirmAuthor(authorId)").count - 1, 2,
                       "L'auteur se revérifie avant chaque montée ET avant de rendre la main à la création.")
    }

    func test_everyHost_declaresTheAuthorItRecordedBeforeAwaiting() throws {
        for (host, direct, queued) in [
            ("Views/FeedCommentsSheet.swift", "uploadAll(media, authorId: me?.id)", "mobileTranscription, authorId: me?.id"),
            ("ViewModels/PostDetailViewModel+CommentSend.swift", "uploadAll(pendingMedia, authorId: me?.id)", "mobileTranscription, authorId: me?.id"),
            ("Views/StoryViewerView+Content.swift", "uploadAll(medias, authorId: authorId)", "mobileTranscription, authorId: authorId"),
        ] {
            let code = try source(host)
            XCTAssertTrue(code.contains(direct), "\(host) : l'envoi direct ne revérifie pas l'auteur relevé à la composition.")
            XCTAssertTrue(code.contains(queued), "\(host) : la charge confiée à la file ne déclare pas son auteur.")
        }
    }

    func test_whatIsShown_andWhatIsPurged_followTheAccount() throws {
        XCTAssertTrue(try source("Views/CommentUnsentBadge.swift").contains("ownerId: AuthManager.shared.currentUser?.id"))
        XCTAssertTrue(try source("Views/FeedCommentsSheet+Attachments.swift")
            .contains("unsentComments(postId: post.id, ownerId: AuthManager.shared.currentUser?.id)"))
        let root = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
        let container = AppSourceGuard.stripComments(try String(
            contentsOf: root.appendingPathComponent("Meeshy/Core/DependencyContainer.swift"), encoding: .utf8))
        XCTAssertTrue(container.contains("OfflineQueue.purgePendingCommentMedia(ownerId: ownerId)"),
                      "La déconnexion laisse sur le disque des pièces que le compte suivant pourrait lire.")
    }

    func test_aDirectUpload_doesNotDeleteTheFileBeforeTheCommentExists() throws {
        let code = try source("Views/CommentComposerMedia.swift")
        let upload = try XCTUnwrap(code.range(of: "static func upload(_ media: PendingCommentMedia)"))
        let next = try XCTUnwrap(code.range(of: "static func uploadAll(", range: upload.upperBound..<code.endIndex))
        XCTAssertFalse(code[upload.upperBound..<next.lowerBound].contains("removeItem"),
                       "Le fichier doit survivre au téléversement : c'est lui que la file rejoue si la création échoue.")
    }

    func test_anAbandonedComment_staysOnScreen_andIsRetriable() throws {
        XCTAssertTrue(try source("Views/CommentRowView.swift").contains("CommentUnsentBadge("),
                      "La ligne d'un commentaire non envoyé ne porte plus sa marque.")
        let badge = try source("Views/CommentUnsentBadge.swift")
        XCTAssertTrue(badge.contains("retryByClientMessageId("))
        XCTAssertTrue(badge.contains("cancelCreateComment("))
        let sheet = try source("Views/FeedCommentsSheet.swift")
        XCTAssertFalse(sheet.contains("if case .exhausted = event"),
                       "La feuille retire de l'écran un commentaire que la file abandonne : il doit rester, relançable.")
        XCTAssertTrue(sheet.contains(".unsentComments(restore:"),
                      "La feuille ne relit plus de la file les commentaires qui ne sont pas partis.")
    }
}
