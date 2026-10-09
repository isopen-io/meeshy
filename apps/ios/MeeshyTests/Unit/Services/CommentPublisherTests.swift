import XCTest
import MeeshySDK
@testable import Meeshy

// MARK: - Outils de test

/// Un jeton de session de test : la forme d'un JWT, dont la charge porte la
/// revendication `userId` — celle que `CommentOwnership` lit.
enum TestSessionToken {
    static func make(userId: String?) -> String {
        var claims: [String: Any] = ["exp": Date().addingTimeInterval(3600).timeIntervalSince1970]
        if let userId { claims["userId"] = userId }
        let payload = (try? JSONSerialization.data(withJSONObject: claims)) ?? Data()
        let encoded = payload.base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
        return "e30.\(encoded).signature"
    }
}

/// Un `CommentPublisher` dont le réseau est remplacé par un journal : chaque
/// téléversement et chaque création y laissent le JETON sous lequel ils
/// seraient partis.
@MainActor
final class CommentPublisherSpy {
    nonisolated deinit {}

    /// Le jeton de la session « courante » — modifiable EN COURS d'envoi.
    var token: String?
    private(set) var created: [CreateCommentPayload] = []
    private(set) var createTokens: [String] = []
    private(set) var createAttachmentIds: [[String]] = []
    private(set) var uploadTokens: [String] = []
    var createFailure: Error?
    var uploadFailureAtIndex: Int?
    /// Joué juste APRÈS chaque téléversement — pour faire changer le compte
    /// entre la montée et la création.
    var afterUpload: (@MainActor () -> Void)?

    init(token: String?) {
        self.token = token
    }

    var publisher: CommentPublisher {
        CommentPublisher(
            prepare: {},
            token: { [weak self] in self?.token },
            upload: { [weak self] piece, token in
                guard let self else { throw TestFailure.gone }
                if self.uploadFailureAtIndex == piece.sourceIndex { throw TestFailure.upload }
                self.uploadTokens.append(token)
                self.afterUpload?()
                return "media\(piece.sourceIndex)"
            },
            create: { [weak self] payload, attachmentIds, token in
                guard let self else { throw TestFailure.gone }
                if let failure = self.createFailure { throw failure }
                self.created.append(payload)
                self.createTokens.append(token)
                self.createAttachmentIds.append(attachmentIds)
                return nil
            }
        )
    }

    enum TestFailure: Error { case gone, upload }
}

// MARK: - Le seul chemin réseau d'un commentaire

/// **Le jeton qui signe une requête est celui qu'on vient de vérifier**
/// (#9743). Ces témoins font changer le compte PENDANT l'envoi.
@MainActor
final class CommentPublisherTests: XCTestCase {

    private let alice = "66f0a1b2c3d4e5f6000000a1"
    private let bob = "66f0a1b2c3d4e5f6000000b0"

    private func payload(author: String?) -> CreateCommentPayload {
        CreateCommentPayload(clientMutationId: "cmid_00000000-0000-4000-8000-000000000a11", postId: "post-1",
                             parentCommentId: nil, content: "regarde", originalLanguage: "fr", authorId: author)
    }

    private func pieces(_ count: Int) -> [CommentPublisher.Piece] {
        (0..<count).map { CommentPublisher.Piece(sourceIndex: $0, fileURL: URL(fileURLWithPath: "/tmp/\($0).jpg"), mimeType: "image/jpeg") }
    }

    private func refusal(_ body: () async throws -> Void) async -> CommentOwnership.Refusal? {
        do { try await body(); return nil } catch { return error as? CommentOwnership.Refusal }
    }

    // MARK: Le cas nominal

    func test_publish_uploadsTwoPieces_thenCreatesOnce_underTheAuthorsToken() async throws {
        let aliceToken = TestSessionToken.make(userId: alice)
        let spy = CommentPublisherSpy(token: aliceToken)

        try await spy.publisher.publish(payload(author: alice), pieces: pieces(2))

        XCTAssertEqual(spy.uploadTokens, [aliceToken, aliceToken])
        XCTAssertEqual(spy.created.count, 1, "Un commentaire, une création.")
        XCTAssertEqual(spy.createTokens, [aliceToken])
        XCTAssertEqual(spy.createAttachmentIds, [["media0", "media1"]])
    }

    func test_publish_doesNotReuploadWhatIsAcquired() async throws {
        let spy = CommentPublisherSpy(token: TestSessionToken.make(userId: alice))
        let done = UploadedCommentMedia(sourceIndex: 0, id: "déjà", uploadedAt: Date().timeIntervalSince1970)

        try await spy.publisher.publish(payload(author: alice), pieces: pieces(2), acquired: [done])

        XCTAssertEqual(spy.uploadTokens.count, 1)
        XCTAssertEqual(spy.createAttachmentIds, [["déjà", "media1"]])
    }

    // MARK: Le compte change PENDANT l'envoi

    func test_theAccountChangesBetweenUploadAndCreation_nothingIsCreatedUnderTheOtherAccount() async {
        let spy = CommentPublisherSpy(token: TestSessionToken.make(userId: alice))
        let bobToken = TestSessionToken.make(userId: bob)
        spy.afterUpload = { spy.token = bobToken }

        let refused = await refusal { try await spy.publisher.publish(self.payload(author: self.alice), pieces: self.pieces(1)) }

        XCTAssertEqual(refused, .notTheAuthor)
        XCTAssertTrue(spy.created.isEmpty, "Le commentaire d'Alice ne se crée pas sous le jeton de Bob.")
        XCTAssertFalse(spy.createTokens.contains(bobToken))
    }

    func test_theAccountChangesBetweenTwoUploads_theSecondPieceIsNotSentUnderTheOtherAccount() async {
        let aliceToken = TestSessionToken.make(userId: alice)
        let spy = CommentPublisherSpy(token: aliceToken)
        spy.afterUpload = { spy.token = TestSessionToken.make(userId: self.bob) }

        let refused = await refusal { try await spy.publisher.publish(self.payload(author: self.alice), pieces: self.pieces(2)) }

        XCTAssertEqual(refused, .notTheAuthor)
        XCTAssertEqual(spy.uploadTokens, [aliceToken], "Seule la pièce montée sous Alice est partie.")
        XCTAssertTrue(spy.created.isEmpty)
    }

    func test_theSessionEndsDuringTheSend_nothingIsCreated() async {
        let spy = CommentPublisherSpy(token: TestSessionToken.make(userId: alice))
        spy.afterUpload = { spy.token = nil }

        let refused = await refusal { try await spy.publisher.publish(self.payload(author: self.alice), pieces: self.pieces(1)) }

        XCTAssertEqual(refused, .notTheAuthor)
        XCTAssertTrue(spy.created.isEmpty)
    }

    // MARK: Fermé par défaut

    func test_nothingIsSent_whenTheAuthorCannotBeDecided() async {
        let aliceToken = TestSessionToken.make(userId: alice)
        let cases: [(author: String?, token: String?, why: String)] = [
            (nil, aliceToken, "entrée sans propriétaire (gravée avant le champ)"),
            ("", aliceToken, "propriétaire vide"),
            ("   ", aliceToken, "propriétaire blanc"),
            (alice, nil, "identité courante absente"),
            (alice, "", "jeton vide"),
            (alice, "pas-un-jeton", "jeton illisible"),
            (alice, TestSessionToken.make(userId: nil), "jeton sans compte"),
            (alice, TestSessionToken.make(userId: ""), "jeton au compte vide"),
            ("", TestSessionToken.make(userId: ""), "deux identités vides ne sont pas le même compte"),
            (alice, TestSessionToken.make(userId: bob), "un autre compte"),
        ]
        for testCase in cases {
            let spy = CommentPublisherSpy(token: testCase.token)
            let refused = await refusal {
                try await spy.publisher.publish(self.payload(author: testCase.author), pieces: self.pieces(1))
            }
            XCTAssertEqual(refused, .notTheAuthor, testCase.why)
            XCTAssertTrue(spy.uploadTokens.isEmpty, "\(testCase.why) : aucune pièce ne part")
            XCTAssertTrue(spy.created.isEmpty, "\(testCase.why) : aucun commentaire ne part")
        }
    }

    // MARK: Ce qu'un envoi interrompu lègue

    func test_anInterruptedUpload_reportsWhatWasAcquired() async {
        let spy = CommentPublisherSpy(token: TestSessionToken.make(userId: alice))
        spy.uploadFailureAtIndex = 1
        do {
            try await spy.publisher.publish(payload(author: alice), pieces: pieces(2))
            XCTFail("la seconde pièce échoue")
        } catch {
            XCTAssertEqual(CommentMediaDelivery.acquired(from: error).map(\.id), ["media0"])
        }
        XCTAssertTrue(spy.created.isEmpty, "Un commentaire ne part pas amputé d'une pièce.")
    }

    func test_aFailedCreation_keepsEveryUploadedPiece() async {
        let spy = CommentPublisherSpy(token: TestSessionToken.make(userId: alice))
        spy.createFailure = URLError(.timedOut)
        do {
            try await spy.publisher.publish(payload(author: alice), pieces: pieces(2))
            XCTFail("la création échoue")
        } catch {
            XCTAssertEqual(CommentMediaDelivery.acquired(from: error).map(\.id), ["media0", "media1"])
        }
    }
}

// MARK: - Aucune autre porte

/// **Tout envoi de commentaire passe par `CommentPublisher`** (#9743). Un
/// chemin qui n'y passe pas lit le jeton courant au moment de sa requête —
/// c'est le défaut. Une porte par témoin, puis l'interdiction générale.
final class CommentPublisherIsTheOnlyDoorGuardTests: XCTestCase {

    private static let appRoot = URL(fileURLWithPath: #filePath)
        .deletingLastPathComponent().deletingLastPathComponent()
        .deletingLastPathComponent().deletingLastPathComponent()
        .appendingPathComponent("Meeshy")

    private func source(_ relative: String) throws -> String {
        AppSourceGuard.stripComments(try String(
            contentsOf: Self.appRoot.appendingPathComponent(relative), encoding: .utf8))
    }

    func test_theFeedAndReelsSheet_sendsThroughThePublisher() throws {
        XCTAssertTrue(try source("Features/Main/Views/FeedCommentsSheet.swift")
            .contains("CommentPublisher.live.publish(payload, pieces: CommentPublisher.pieces(media))"))
    }

    func test_thePostDetail_sendsThroughThePublisher() throws {
        XCTAssertTrue(try source("Features/Main/ViewModels/PostDetailViewModel+CommentSend.swift")
            .contains("CommentPublisher.live.publish(payload, pieces: CommentPublisher.pieces(pendingMedia))"))
    }

    func test_theStory_sendsThroughThePublisher() throws {
        XCTAssertTrue(try source("Features/Main/Views/StoryViewerView+Content.swift")
            .contains("CommentPublisher.live.publish(payload, pieces: CommentPublisher.pieces(medias))"))
    }

    func test_theNotificationReply_sendsThroughThePublisher() throws {
        XCTAssertTrue(try source("Features/Main/Services/NotificationActionHandler.swift")
            .contains("commentPublisher.publish(comment, pieces: [])"))
    }

    /// Retour du réseau, reprise au lancement, relance manuelle, retour au
    /// premier plan : le flusher n'a qu'UNE porte par nature de ligne.
    func test_everyReplay_goesThroughTheDispatcher_whichSendsThroughThePublisher() throws {
        let dispatcher = try source("Features/Main/Services/OutboxDispatcher.swift")
        XCTAssertEqual(dispatcher.components(separatedBy: "case .createComment:").count - 1, 1)
        XCTAssertTrue(dispatcher.contains("try await dispatchCreateComment(record)"))
        let comments = try source("Features/Main/Services/OutboxDispatcher+Comments.swift")
        XCTAssertTrue(comments.contains("try await publisher.publish(payload, pieces: pieces, acquired: plan.acquired)"))
        XCTAssertFalse(comments.contains("requestWithHeaders("), "Le dispatcher n'envoie plus rien lui-même.")
        XCTAssertFalse(comments.contains("uploadFile("), "Le dispatcher ne téléverse plus rien lui-même.")
        XCTAssertFalse(comments.contains("authToken"), "Le dispatcher ne lit aucun jeton : le publieur le lie.")
    }

    func test_thePublisher_bindsTheVerifiedTokenToEveryRequest() throws {
        let code = try source("Features/Main/Services/CommentPublisher.swift")
        XCTAssertEqual(code.components(separatedBy: "try await boundToken(for: payload)").count - 1, 2,
                       "Un jeton vérifié par requête : chaque téléversement, et la création.")
        XCTAssertTrue(code.contains("return try CommentOwnership.tokenBound(to: payload, token: token())"))
        XCTAssertTrue(code.contains("APIClient.shared.requestPinned("),
                      "La création part sous le jeton remis, sans rafraîchissement ni rejeu sous un autre.")
        XCTAssertTrue(code.contains("bearerToken: token"))
        XCTAssertTrue(code.contains("credential: .bearer(token)"))
        XCTAssertTrue(code.contains("refreshAuthSession: { _ in"),
                      "Un 401 ne fait pas reprendre la montée sous le jeton de la session du moment.")
    }

    /// **L'interdiction.** Dans toute l'application, seule `CommentPublisher`
    /// a le droit de créer un commentaire sur le réseau ou d'en téléverser
    /// une pièce.
    func test_noOtherFile_createsACommentOrUploadsItsMedia() throws {
        let forbidden = [
            ".addComment(",                      // PostService — jeton courant
            ".postComment(",                     // l'ancien envoi de story
            "PostsEndpoint.byPostIdComments(",   // la route de création
            "uploadContext: \"comment\"",        // une pièce de commentaire
        ]
        /// Les LECTURES de la même route (liste paginée) ne créent rien.
        let readers: Set<String> = []
        let files = (FileManager.default.enumerator(at: Self.appRoot, includingPropertiesForKeys: nil)?
            .compactMap { $0 as? URL } ?? []).filter { $0.pathExtension == "swift" }
        XCTAssertGreaterThan(files.count, 500, "l'arbre de l'application est introuvable — ce témoin ne mesurerait rien")
        var offenders: [String] = []
        for file in files where file.lastPathComponent != "CommentPublisher.swift" && !readers.contains(file.lastPathComponent) {
            let code = AppSourceGuard.stripComments(try String(contentsOf: file, encoding: .utf8))
            for needle in forbidden where code.contains(needle) {
                offenders.append("\(file.lastPathComponent) : \(needle)")
            }
        }
        XCTAssertEqual(offenders, [], "Un envoi de commentaire hors de CommentPublisher lit le jeton courant au moment de sa requête : le compte peut avoir changé depuis la vérification.")
    }
}
