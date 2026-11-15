import XCTest
import GRDB
import Combine
@testable import MeeshySDK
@testable import Meeshy

/// W4 lots 2 & 4 — le pont de persistance du feed doit vivre indépendamment de
/// tout écran monté, et `comment:media-updated` doit enfin atterrir en base.
@MainActor
final class FeedSocketPersistenceScopeTests: XCTestCase {

    private var dbQueue: DatabaseQueue!
    private var feedActor: FeedPersistenceActor!

    override func setUp() async throws {
        dbQueue = try DatabaseQueue()
        try FeedDatabaseMigrations.runAll(on: dbQueue)
        feedActor = FeedPersistenceActor(dbWriter: dbQueue)
    }

    private func makeCommentMediaEvent(commentId: String, postId: String, transcription: String) throws
        -> SocketCommentMediaUpdatedData {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return try decoder.decode(SocketCommentMediaUpdatedData.self, from: Data("""
        {
            "postId": "\(postId)",
            "commentId": "\(commentId)",
            "comment": {
                "id": "\(commentId)",
                "content": "",
                "createdAt": "2026-01-01T00:00:00Z",
                "author": { "id": "u1", "username": "auteur" },
                "media": [{
                    "id": "media_1",
                    "fileUrl": "https://cdn/audio.m4a",
                    "mimeType": "audio/m4a",
                    "transcription": { "text": "\(transcription)", "language": "fr" }
                }]
            }
        }
        """.utf8))
    }

    // MARK: - lot 4 : comment:media-updated persisté

    func test_commentMediaUpdated_persistsEnrichedMediaBlob() async throws {
        let socket = MockSocialSocket()
        let handler = FeedSocketHandler(persistence: feedActor, socialSocket: socket)
        handler.arm()
        defer { handler.disarm() }

        try await feedActor.insertComment(
            CommentRecordFactory.make(id: "c_audio", postId: "p_audio")
        )

        socket.commentMediaUpdated.send(
            try makeCommentMediaEvent(commentId: "c_audio", postId: "p_audio",
                                      transcription: "salut la compagnie")
        )

        try await Task.sleep(for: .milliseconds(150))
        let comment = try feedActor.comments(forPostId: "p_audio", limit: 10)
            .first { $0.id == "c_audio" }
        XCTAssertEqual(comment?.media.first?.transcription?.resolvedText, "salut la compagnie")
    }

    // MARK: - lot 2 : le pont ne dépend d'aucun écran

    /// `arm()` est appelé une fois au niveau app puis potentiellement re-appelé
    /// par le setup de `FeedView`. Sans garde d'idempotence, chaque montage
    /// dupliquerait tous les sinks — et chaque événement serait persisté N fois.
    func test_arm_isIdempotent_soARemountNeverDuplicatesSinks() async throws {
        let socket = MockSocialSocket()
        let handler = FeedSocketHandler(persistence: feedActor, socialSocket: socket)
        handler.arm()
        handler.arm()
        handler.arm()
        defer { handler.disarm() }

        try await feedActor.insertComment(
            CommentRecordFactory.make(id: "c_once", postId: "p_once")
        )
        socket.commentMediaUpdated.send(
            try makeCommentMediaEvent(commentId: "c_once", postId: "p_once", transcription: "un")
        )

        try await Task.sleep(for: .milliseconds(150))
        let comment = try feedActor.comments(forPostId: "p_once", limit: 10)
            .first { $0.id == "c_once" }
        XCTAssertEqual(comment?.changeVersion, 1, "trois arm() ne doivent produire qu'UNE écriture")
    }

    /// Le désarmement n'est plus câblé sur le cycle de vie de `FeedView` :
    /// `unsubscribeFromSocketEvents` coupe les sinks d'UI du ViewModel et laisse
    /// le pont de persistance vivant.
    func test_unsubscribeFromSocketEvents_leavesThePersistenceBridgeArmed() async throws {
        let socket = MockSocialSocket()
        let handler = FeedSocketHandler(persistence: feedActor, socialSocket: socket)
        handler.arm()
        defer { handler.disarm() }

        let viewModel = FeedViewModel(socialSocket: socket)
        viewModel.setupPersistence(
            store: FeedStore(persistence: feedActor),
            socketHandler: handler,
            persistence: feedActor
        )
        viewModel.subscribeToSocketEvents()
        viewModel.unsubscribeFromSocketEvents()

        try await feedActor.insertComment(
            CommentRecordFactory.make(id: "c_offscreen", postId: "p_offscreen")
        )
        socket.commentMediaUpdated.send(
            try makeCommentMediaEvent(commentId: "c_offscreen", postId: "p_offscreen",
                                      transcription: "hors écran")
        )

        try await Task.sleep(for: .milliseconds(150))
        let comment = try feedActor.comments(forPostId: "p_offscreen", limit: 10)
            .first { $0.id == "c_offscreen" }
        XCTAssertEqual(
            comment?.media.first?.transcription?.resolvedText, "hors écran",
            "quitter le feed ne doit plus arrêter la persistance disque"
        )
    }

    // MARK: - L2c/F3 : un repost de type TRAY n'entre pas dans la table du fil

    private static func repostEvent(id: String, type: String) -> SocketPostRepostedData {
        JSONStub.decode("""
        {"originalPostId":"original-1","repost":{"id":"\(id)","type":"\(type)","content":"","createdAt":"2026-01-01T00:00:00.000Z","author":{"id":"u1","username":"auteur"}}}
        """)
    }

    /// `post:reposted` n'est pas typé : le serveur y pousse le repost quel que
    /// soit son type. Une story repostée s'insérait donc dans `feed_posts` — la
    /// table que le secours de pagination HORS-LIGNE de `FeedViewModel` mappe
    /// telle quelle en `FeedPost`, sans le filtre `belongsToStoryTray` que le
    /// chemin en direct applique déjà. Le tray reparaissait dans le fil dès que
    /// le réseau tombait.
    ///
    /// Les lignes STORY DÉJÀ persistées ne sont pas purgées par cette garde :
    /// un résidu observé après mise à jour n'est pas un échec du filtre.
    func test_postReposted_ofATrayType_neverReachesTheFeedTable() async throws {
        let socket = MockSocialSocket()
        let handler = FeedSocketHandler(persistence: feedActor, socialSocket: socket)
        handler.arm()
        defer { handler.disarm() }

        socket.postReposted.send(Self.repostEvent(id: "repost-story", type: "STORY"))
        socket.postReposted.send(Self.repostEvent(id: "repost-status", type: "STATUS"))
        socket.postReposted.send(Self.repostEvent(id: "repost-post", type: "POST"))

        try await Task.sleep(for: .milliseconds(150))
        let ids = try feedActor.posts(cursor: nil, limit: 20).map(\.id)
        XCTAssertFalse(ids.contains("repost-story"),
                       "une story repostée vit dans le tray, jamais dans la table du fil")
        XCTAssertFalse(ids.contains("repost-status"),
                       "même partage par EXCLUSION que `belongsToStoryTray` : STATUS aussi")
        XCTAssertTrue(ids.contains("repost-post"),
                       "le repost nominal continue d'être persisté")
    }

}
