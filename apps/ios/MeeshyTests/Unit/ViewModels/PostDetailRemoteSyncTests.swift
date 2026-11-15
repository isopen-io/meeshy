import XCTest
import Combine
@testable import Meeshy
import MeeshySDK

/// `PostDetailViewModel` — ce qui arrive À DISTANCE : réécriture des clés de
/// cache sur mutation reçue, traductions de commentaires poussées par socket.
@MainActor
final class PostDetailRemoteSyncTests: PostDetailViewModelTestCase {

    // MARK: - L2c/F1 — une mutation reçue À DISTANCE doit réécrire sa clé de cache

    /// `comment:deleted` d'un autre appareil ne muait que la mémoire : la
    /// version cachée ressuscitait le commentaire supprimé à la ré-ouverture
    /// (feuille, détail et overlay story lisent la MÊME clé).
    func test_commentDeleted_socketEcho_rewritesTheCachedTopLevelPage() async {
        let postId = "pDeletedSink"
        await CacheCoordinator.shared.comments.invalidate(for: "post-\(postId)")
        let socket = MockSocialSocket()
        let (sut, _) = makeSUT(socialSocket: socket)
        sut.comments = [
            FeedComment(id: "c1", author: "alice", authorId: "a1", content: "Reste"),
            FeedComment(id: "c2", author: "bob", authorId: "a2", content: "Part")
        ]
        try? await CacheCoordinator.shared.comments.save(sut.comments, for: "post-\(postId)")
        sut.subscribeToSocket(postId)

        socket.commentDeleted.send(Self.makeCommentDeleted(postId: postId, commentId: "c2", commentCount: 1))

        let cached = await cachedComments("post-\(postId)") { page in page.allSatisfy { $0.id != "c2" } }
        XCTAssertEqual(cached.map(\.id), ["c1"],
                       "sans réécriture, le commentaire supprimé revient de la clé cachée")
        await CacheCoordinator.shared.comments.invalidate(for: "post-\(postId)")
    }

    /// Une RÉPONSE supprimée touche DEUX clés : son fil, et la page top-level
    /// dont le compteur de réponses du parent vient de bouger.
    func test_commentDeleted_ofAReply_rewritesBothTheThreadAndTheTopLevelKeys() async {
        let postId = "pDeletedReplySink"
        let parentId = "cReplySink"
        await CacheCoordinator.shared.comments.invalidate(for: "post-\(postId)")
        await CacheCoordinator.shared.comments.invalidate(for: "replies-\(parentId)")
        let socket = MockSocialSocket()
        let (sut, _) = makeSUT(socialSocket: socket)
        let parent = FeedComment(id: parentId, author: "alice", authorId: "a1", content: "Top", replies: 1)
        let reply = FeedComment(id: "r1", author: "bob", authorId: "a2", content: "Reply", parentId: parentId)
        sut.comments = [parent]
        sut.repliesMap = [parentId: [reply]]
        try? await CacheCoordinator.shared.comments.save(sut.comments, for: "post-\(postId)")
        try? await CacheCoordinator.shared.comments.save([reply], for: "replies-\(parentId)")
        sut.subscribeToSocket(postId)

        socket.commentDeleted.send(Self.makeCommentDeleted(postId: postId, commentId: "r1", commentCount: 1))

        let thread = await cachedComments("replies-\(parentId)") { $0.isEmpty }
        XCTAssertTrue(thread.isEmpty, "la réponse supprimée sort de son fil en cache")
        let page = await cachedComments("post-\(postId)") { page in page.first?.replies == 0 }
        XCTAssertEqual(page.first?.replies, 0,
                       "le compteur du parent a bougé : `post-` est la SECONDE clé touchée")
        await CacheCoordinator.shared.comments.invalidate(for: "post-\(postId)")
        await CacheCoordinator.shared.comments.invalidate(for: "replies-\(parentId)")
    }

    /// `comment:media-updated` porte la transcription et les variantes TTS —
    /// elles ne vivaient qu'en mémoire, et l'écran suivant reservait le média NU.
    func test_commentMediaUpdated_socketEcho_rewritesTheCachedTopLevelPage() async {
        let postId = "pMediaSink"
        await CacheCoordinator.shared.comments.invalidate(for: "post-\(postId)")
        let socket = MockSocialSocket()
        let (sut, _) = makeSUT(socialSocket: socket)
        sut.comments = [FeedComment(id: "cAudio", author: "alice", authorId: "a1", content: "")]
        try? await CacheCoordinator.shared.comments.save(sut.comments, for: "post-\(postId)")
        sut.subscribeToSocket(postId)

        socket.commentMediaUpdated.send(Self.makeCommentMediaUpdated(postId: postId, commentId: "cAudio"))

        let cached = await cachedComments("post-\(postId)") { page in page.first?.media.isEmpty == false }
        XCTAssertEqual(cached.first?.media.count, 1,
                       "le média enrichi doit atterrir en cache, pas seulement en mémoire")
        await CacheCoordinator.shared.comments.invalidate(for: "post-\(postId)")
    }

    /// Garde NÉGATIVE : un sink qui tire avant le premier chargement écrirait
    /// une page VIDE par-dessus la page déjà cachée sous la même clé.
    func test_commentDeleted_beforeAnythingIsLoaded_neverOverwritesTheCachedPage() async {
        let postId = "pDeletedNoopSink"
        await CacheCoordinator.shared.comments.invalidate(for: "post-\(postId)")
        let socket = MockSocialSocket()
        let (sut, _) = makeSUT(socialSocket: socket)
        let seeded = (0..<20).map { FeedComment(id: "cached-\($0)", author: "alice", authorId: "a1", content: "c\($0)") }
        try? await CacheCoordinator.shared.comments.save(seeded, for: "post-\(postId)")
        sut.subscribeToSocket(postId)

        socket.commentDeleted.send(Self.makeCommentDeleted(postId: postId, commentId: "absent", commentCount: 20))
        try? await Task.sleep(nanoseconds: 300_000_000)

        let cached = await CacheCoordinator.shared.comments.load(for: "post-\(postId)").snapshot() ?? []
        XCTAssertEqual(cached.count, 20,
                       "rien n'a bougé en mémoire : rien ne doit être écrit")
        await CacheCoordinator.shared.comments.invalidate(for: "post-\(postId)")
    }

    // MARK: - L2c/F1 — `CommentsSheetView.commentCacheWrites` (la feuille n'est pas instrumentable)

    func test_commentCacheWrites_topLevelPageNotLoaded_neverWritesThePostKey() {
        let writes = CommentsSheetView.commentCacheWrites(
            postId: "p1",
            liveComments: nil,
            repliesMap: ["c1": [FeedComment(id: "r1", author: "bob", content: "Reply", parentId: "c1")]],
            touchedThreadIds: ["c1"]
        )

        XCTAssertEqual(writes.map(\.key), ["replies-c1"],
                       "écrire le repli `post.comments` écraserait la page complète déjà cachée")
    }

    func test_commentCacheWrites_threadNotMounted_skipsTheOrphanKey() {
        let writes = CommentsSheetView.commentCacheWrites(
            postId: "p1",
            liveComments: [FeedComment(id: "c1", author: "alice", content: "Top")],
            repliesMap: [:],
            touchedThreadIds: ["c1"]
        )

        XCTAssertEqual(writes.map(\.key), ["post-p1"],
                       "la clé orpheline d'un top-level supprimé n'est jamais écrite : plus rien ne la relira")
    }

    func test_commentCacheWrites_deletedReply_writesBothTheThreadAndThePostKeys() {
        let writes = CommentsSheetView.commentCacheWrites(
            postId: "p1",
            liveComments: [FeedComment(id: "c1", author: "alice", content: "Top")],
            repliesMap: ["c1": []],
            touchedThreadIds: ["c1"]
        )

        XCTAssertEqual(writes.map(\.key), ["replies-c1", "post-p1"])
    }

    func test_commentCacheWrites_dropsUnconfirmedOptimisticRows() {
        let writes = CommentsSheetView.commentCacheWrites(
            postId: "p1",
            liveComments: [
                FeedComment(id: "cmid_pending", author: "moi", content: "En vol"),
                FeedComment(id: "c1", author: "alice", content: "Top")
            ],
            repliesMap: [:],
            touchedThreadIds: []
        )

        XCTAssertEqual(writes.first?.comments.map(\.id), ["c1"],
                       "une ligne optimiste persistée resterait en cache pour toujours : le serveur ne la renverra jamais")
    }

    // MARK: - applyCommentTranslationUpdate (#6531 — jumelle de FeedViewModel.applyCommentTranslation)

    func test_applyCommentTranslationUpdate_originalLanguageAtHigherRank_isNotOverwritten() {
        let (sut, _) = makeSUT(preferredLanguages: ["fr", "en"])
        sut.comments = [FeedComment(id: "c1", author: "bob", content: "Salut", originalLanguage: "fr")]

        sut.applyCommentTranslationUpdate(commentId: "c1", language: "en", text: "Hi")

        XCTAssertNil(sut.comments.first?.translatedContent,
                      "le français (rang 1, langue d'origine) doit primer sur l'anglais reçu")
    }

    func test_applyCommentTranslationUpdate_translationRankedAboveOriginal_isApplied() {
        let (sut, _) = makeSUT(preferredLanguages: ["en", "fr"])
        sut.comments = [FeedComment(id: "c1", author: "bob", content: "Salut", originalLanguage: "fr")]

        sut.applyCommentTranslationUpdate(commentId: "c1", language: "en", text: "Hi")

        XCTAssertEqual(sut.comments.first?.translatedContent, "Hi")
    }

    func test_applyCommentTranslationUpdate_appliesToAReply_whenOriginalDoesNotOutrankIt() {
        let (sut, _) = makeSUT(preferredLanguages: ["en", "fr"])
        sut.comments = [FeedComment(id: "root", author: "alice", content: "Top")]
        sut.repliesMap = ["root": [FeedComment(id: "r1", author: "bob", content: "Salut", parentId: "root", originalLanguage: "fr")]]

        sut.applyCommentTranslationUpdate(commentId: "r1", language: "en", text: "Hi")

        XCTAssertEqual(sut.repliesMap["root"]?.first?.translatedContent, "Hi")
    }

    /// Cycle 4 — la traduction d'une langue non préférée est gardée : un
    /// changement de langue la sert sans re-fetch.
    func test_applyCommentTranslationUpdate_nonPreferredLanguage_isKeptForALanguageChange() {
        let (sut, _) = makeSUT(preferredLanguages: ["en"])
        sut.comments = [FeedComment(id: "c1", author: "bob", content: "Salut", originalLanguage: "fr")]

        sut.applyCommentTranslationUpdate(commentId: "c1", language: "es", text: "Hola")

        XCTAssertNil(sut.comments.first?.translatedContent)
        XCTAssertEqual(sut.comments.first?.resolved(preferredLanguages: ["es"]).displayContent, "Hola")
    }

    // MARK: - subscribeToSocket → post:translation-updated (#6531)

    /// Deuxième reproduction de l'issue : l'écran de DÉTAIL a son propre sink
    /// `post:translation-updated` dans `subscribeToSocket`, indépendant de
    /// `FeedViewModel`. Même défaut (la première traduction dont la langue
    /// figure dans le Prisme devenait le texte affiché, sans tenir compte du
    /// rang), même correctif : re-résoudre via `FeedPost.resolved`.
    func test_subscribeToSocket_postTranslationUpdated_originalLanguageAtItsRank_winsOverLowerRankTranslation() async {
        let mock = MockPostService()
        let apiPost: APIPost = JSONStub.decode("""
        {"id":"p1","type":"POST","content":"Bonjour","originalLanguage":"fr","createdAt":"2026-01-01T00:00:00.000Z","author":{"id":"a1","username":"alice"}}
        """)
        mock.getPostResult = .success(apiPost)
        let socket = MockSocialSocket()
        let (sut, _) = makeSUT(postService: mock, preferredLanguages: ["fr", "pt"], socialSocket: socket)
        await sut.loadPost("p1")
        sut.subscribeToSocket("p1")

        let translationData: SocketPostTranslationUpdatedData = JSONStub.decode("""
        {"postId":"p1","language":"pt","translation":{"text":"Olá","translationModel":"nllb-200","confidenceScore":0.9,"createdAt":"2026-01-15T12:00:00.000Z"}}
        """)
        socket.postTranslationUpdated.send(translationData)
        await Task.yield()
        try? await Task.sleep(nanoseconds: 50_000_000)

        XCTAssertNil(sut.post?.translatedContent,
                      "le français (rang 1, langue d'origine) doit primer sur le portugais reçu")
        XCTAssertEqual(sut.post?.translations?["pt"]?.text, "Olá")
    }
}
