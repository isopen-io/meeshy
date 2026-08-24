import Foundation
import MeeshySDK
import XCTest

nonisolated(unsafe) private let emptyPaginatedPosts: PaginatedAPIResponse<[APIPost]> = JSONStub.decode("""
{"success":true,"data":[],"pagination":null,"error":null}
""")

private let stubPost: APIPost = JSONStub.decode("""
{"id":"post-stub","type":"POST","content":"stub","createdAt":"2026-01-01T00:00:00.000Z","author":{"id":"a1","username":"stub"}}
""")

private let stubComment: APIPostComment = JSONStub.decode("""
{"id":"comment-stub","content":"stub","createdAt":"2026-01-01T00:00:00.000Z","author":{"id":"a1","username":"stub"}}
""")

final class MockPostService: PostServiceProviding, @unchecked Sendable {

    // MARK: - Stubbing

    var getFeedResult: Result<PaginatedAPIResponse<[APIPost]>, Error> = .success(emptyPaginatedPosts)
    var getReelsResult: Result<PaginatedAPIResponse<[APIPost]>, Error>? = nil
    var getPostsByHashtagResult: Result<PaginatedAPIResponse<[APIPost]>, Error> = .success(emptyPaginatedPosts)
    var getTrendingHashtagsResult: Result<[APIHashtag], Error> = .success([])
    var createResult: Result<APIPost, Error> = .success(stubPost)
    var deleteResult: Result<Void, Error> = .success(())
    var likeResult: Result<Void, Error> = .success(())
    var unlikeResult: Result<Void, Error> = .success(())
    var bookmarkResult: Result<Void, Error> = .success(())
    var addCommentResult: Result<APIPostComment, Error> = .success(stubComment)
    var likeCommentResult: Result<Void, Error> = .success(())
    var unlikeCommentResult: Result<Void, Error> = .success(())
    var deleteCommentResult: Result<Void, Error> = .success(())
    var repostResult: Result<APIPost, Error> = .success(stubPost)
    var shareResult: Result<Void, Error> = .success(())
    var createStoryResult: Result<APIPost, Error> = .success(stubPost)
    /// File de résultats pour les scénarios multi-slides (une story = un
    /// `createStory` par slide) : consommée en priorité, une entrée par appel.
    /// Même pattern que `getCommentsResultsQueue`.
    var createStoryResultsQueue: [Result<APIPost, Error>] = []
    /// Maintient `createStory` EN VOL tant qu'il est levé : indispensable pour
    /// tester ce qui n'arrive qu'à un upload en cours (annuler la story qui
    /// monte). L'attente honore l'annulation de tâche — `uploadTask.cancel()`
    /// en sort par un `CancellationError`, comme un TUS interrompu.
    var createStoryHangs = false
    var createWithTypeResult: Result<APIPost, Error> = .success(stubPost)

    // MARK: - Call Tracking

    var getFeedCallCount = 0
    var getPostsByHashtagCallCount = 0
    var getTrendingHashtagsCallCount = 0
    var lastGetFeedCursor: String?
    var lastGetFeedLimit: Int?

    var getReelsCallCount = 0
    var lastGetReelsSeedId: String?
    var lastGetReelsCursor: String?
    var lastGetReelsLimit: Int?

    var createCallCount = 0
    var lastCreateContent: String?
    var lastCreateType: String?
    var lastCreateVisibility: String?
    var lastCreateVisibilityUserIds: [String]?
    var lastCreateRepostOfId: String?
    /// Références DÉCLARÉES du dernier post créé. `nil` = aucune déclaration,
    /// ce qui n'est PAS `[]` : le serveur relit alors le texte lui-même.
    var lastCreateMentions: [PostMentionInput]?
    var lastCreateLocation: SharedPlace?
    /// Le SECOND opt-in de position (spec du 2026-08-02 §2). Observable ici
    /// SEULEMENT si la surcharge complète est implémentée ci-dessous : le
    /// défaut du protocole rabat sinon l'appel sur une signature plus pauvre
    /// et laisse tomber le champ en silence — un test comptant les appels
    /// resterait vert pendant que le consentement disparaît.
    var lastCreateDiscoverabilityPrecision: DiscoverabilityPrecision?

    var deleteCallCount = 0
    var lastDeletePostId: String?

    var likeCallCount = 0
    var lastLikePostId: String?

    var unlikeCallCount = 0
    var lastUnlikePostId: String?

    var bookmarkCallCount = 0
    var lastBookmarkPostId: String?

    var addCommentCallCount = 0
    var lastAddCommentPostId: String?
    var lastAddCommentContent: String?
    var lastAddCommentParentId: String?
    var lastAddCommentClientMutationId: String?
    var lastAddCommentAttachmentIds: [String]?

    var likeCommentCallCount = 0
    var lastLikeCommentPostId: String?
    var lastLikeCommentCommentId: String?
    var unlikeCommentCallCount = 0
    var lastUnlikeCommentPostId: String?
    var lastUnlikeCommentCommentId: String?
    var deleteCommentCallCount = 0
    var lastDeleteCommentPostId: String?
    var lastDeleteCommentCommentId: String?

    var repostCallCount = 0
    var lastRepostPostId: String?
    var lastRepostTargetType: PostType?
    var lastRepostContent: String?
    var lastRepostIsQuote: Bool?
    var lastRepostVisibility: String?

    var shareCallCount = 0
    var lastSharePostId: String?
    var lastShareGenerateLink: Bool?
    var lastSharePlatform: String?

    var createStoryCallCount = 0
    var lastCreateStoryContent: String?
    var lastCreateStoryRepostOfId: String?
    var lastCreateStoryOriginalLanguage: String?
    /// Effets de la DERNIÈRE slide envoyée au serveur — sert à prouver que les
    /// thumbHashes calculés en aval du hand-off arrivent bien avant le TUS.
    var lastCreateStoryEffects: StoryEffects?
    /// Références DÉCLARÉES de la dernière slide envoyée. `nil` = aucune, ce
    /// qui n'est PAS la même chose qu'une liste vide : le serveur relit alors
    /// le texte lui-même.
    var lastCreateStoryMentions: [PostMentionInput]?
    /// Le FORMAT sous lequel la dernière publication par canevas est partie
    /// (V3-3). `nil` tant qu'aucune publication n'a eu lieu — jamais `.story`
    /// par défaut, sans quoi « le format n'est pas parti » et « il est parti en
    /// story » se confondraient.
    var lastCreateCanvasPostType: PostType?

    var createWithTypeCallCount = 0
    var lastCreateWithTypeType: PostType?

    var updateCallCount = 0
    var lastUpdatePostId: String?
    var lastUpdateContent: String?
    var lastUpdateVisibility: String?
    var lastUpdateVisibilityUserIds: [String]?
    var lastUpdateOriginalLanguage: String?
    var lastUpdateType: String?
    var lastUpdateRemoveMediaIds: [String]?
    var lastUpdateStoryEffects: StoryEffects?
    var lastUpdateMediaIds: [String]?
    var lastUpdateLocation: PostLocationUpdate?
    /// Références DÉCLARÉES de la dernière édition. TROIS états observables :
    /// `nil` (clé absente — le serveur préserve), `[]` (effacement explicite),
    /// une liste (remplacement).
    var lastUpdateMentions: [PostMentionInput]?

    var viewPostCallCount = 0
    var lastViewPostId: String?

    var getPostViewsCallCount = 0
    var getUserPostsCallCount = 0
    /// Curseur reçu par le dernier `getUserPosts` — vérifie la reprise au
    /// curseur persisté (pagination du profil).
    var lastGetUserPostsCursor: String?
    /// File de résultats page-par-page pour `getUserPosts` ; vide → repli sur
    /// `getFeedResult` (comportement historique).
    var getUserPostsResultsQueue: [Result<PaginatedAPIResponse<[APIPost]>, Error>] = []
    var getCommentRepliesCallCount = 0
    var lastGetCommentRepliesPostId: String?
    var lastGetCommentRepliesCommentId: String?
    var lastGetCommentRepliesCursor: String?
    var getCommentRepliesResult: Result<PaginatedAPIResponse<[APIPostComment]>, Error> = {
        let empty: PaginatedAPIResponse<[APIPostComment]> = JSONStub.decode("""
        {"success":true,"data":[],"pagination":null,"error":null}
        """)
        return .success(empty)
    }()
    /// File de pages pour les tests multi-pages (pagination / chasse paginée
    /// d'une réponse notifiée) : consommée en priorité, une entrée par appel.
    /// Même pattern que `getCommentsResultsQueue`.
    var getCommentRepliesResultsQueue: [Result<PaginatedAPIResponse<[APIPostComment]>, Error>] = []
    var getCommunityPostsCallCount = 0

    var getBookmarksResult: Result<PaginatedAPIResponse<[APIPost]>, Error> = .success(emptyPaginatedPosts)
    var getBookmarksCallCount = 0
    var lastGetBookmarksCursor: String?

    var removeBookmarkResult: Result<Void, Error> = .success(())
    var removeBookmarkCallCount = 0
    var lastRemoveBookmarkPostId: String?

    var getPostResult: Result<APIPost, Error> = .success(stubPost)
    var getPostCallCount = 0
    var lastGetPostId: String?

    var getCommentsResult: Result<PaginatedAPIResponse<[APIPostComment]>, Error> = {
        let empty: PaginatedAPIResponse<[APIPostComment]> = JSONStub.decode("""
        {"success":true,"data":[],"pagination":null,"error":null}
        """)
        return .success(empty)
    }()
    var getCommentsCallCount = 0
    var lastGetCommentsPostId: String?
    /// File de pages pour les tests multi-pages (chasse paginée d'un
    /// commentaire notifié) : consommée en priorité, une entrée par appel.
    var getCommentsResultsQueue: [Result<PaginatedAPIResponse<[APIPostComment]>, Error>] = []

    var recordImpressionsResult: Result<Void, Error> = .success(())
    var recordImpressionsCallCount = 0
    var lastRecordImpressionPostIds: [String]?
    var lastRecordImpressionsSource: String?

    var recordImpressionCallCount = 0
    var lastRecordImpressionPostId: String?
    var lastRecordImpressionSource: String?

    var recordEngagementCallCount = 0
    var lastRecordEngagementSessions: [EngagementSession]?

    // MARK: - Protocol Conformance

    func getFeed(cursor: String?, limit: Int) async throws -> PaginatedAPIResponse<[APIPost]> {
        getFeedCallCount += 1
        lastGetFeedCursor = cursor
        lastGetFeedLimit = limit
        return try getFeedResult.get()
    }

    func getReels(seedReelId: String?, cursor: String?, limit: Int) async throws -> PaginatedAPIResponse<[APIPost]> {
        getReelsCallCount += 1
        lastGetReelsSeedId = seedReelId
        lastGetReelsCursor = cursor
        lastGetReelsLimit = limit
        // Falls through to `getFeedResult` when no dedicated reels stub is set, so
        // existing tests that only stub the feed keep working unchanged.
        return try (getReelsResult ?? getFeedResult).get()
    }

    func getPostsByHashtag(tag: String, cursor: String?, limit: Int) async throws -> PaginatedAPIResponse<[APIPost]> {
        getPostsByHashtagCallCount += 1
        return try getPostsByHashtagResult.get()
    }

    func getTrendingHashtags(limit: Int) async throws -> [APIHashtag] {
        getTrendingHashtagsCallCount += 1
        return try getTrendingHashtagsResult.get()
    }

    func create(content: String?, type: String, visibility: String, moodEmoji: String?,
                mediaIds: [String]?, audioUrl: String?, audioDuration: Int?,
                originalLanguage: String?,
                mobileTranscription: MobileTranscriptionPayload?,
                repostOfId: String?) async throws -> APIPost {
        createCallCount += 1
        lastCreateContent = content
        lastCreateType = type
        lastCreateRepostOfId = repostOfId
        return try createResult.get()
    }

    /// Surcharge COMPLÈTE du terminal réel : c'est elle que `PostService`
    /// implémente et que `FeedViewModel.createPost` appelle. Sans elle, le
    /// défaut du protocole rabat l'appel sur la signature `visibilityUserIds`
    /// et `discoverabilityPrecision` s'évapore — un test vert prouverait
    /// l'inverse de ce qu'il croit.
    func create(content: String?, type: String, visibility: String, visibilityUserIds: [String]?,
                moodEmoji: String?, mediaIds: [String]?, audioUrl: String?, audioDuration: Int?,
                originalLanguage: String?,
                mobileTranscription: MobileTranscriptionPayload?,
                repostOfId: String?, location: SharedPlace?,
                mentions: [PostMentionInput]?,
                allowSoundExtraction: Bool?, mediaAlt: [String: String]?,
                discoverabilityPrecision: DiscoverabilityPrecision?) async throws -> APIPost {
        lastCreateDiscoverabilityPrecision = discoverabilityPrecision
        return try await create(content: content, type: type, visibility: visibility,
                                visibilityUserIds: visibilityUserIds, moodEmoji: moodEmoji,
                                mediaIds: mediaIds, audioUrl: audioUrl, audioDuration: audioDuration,
                                originalLanguage: originalLanguage, mobileTranscription: mobileTranscription,
                                repostOfId: repostOfId, location: location, mentions: mentions)
    }

    /// Surcharge de l'audience NOMMÉE : même raison que ci-dessous — sans
    /// elle, le défaut du protocole rabat l'appel sur la signature sans liste
    /// et `visibilityUserIds` deviendrait inobservable.
    func create(content: String?, type: String, visibility: String, visibilityUserIds: [String]?,
                moodEmoji: String?, mediaIds: [String]?, audioUrl: String?, audioDuration: Int?,
                originalLanguage: String?,
                mobileTranscription: MobileTranscriptionPayload?,
                repostOfId: String?, location: SharedPlace?,
                mentions: [PostMentionInput]?) async throws -> APIPost {
        lastCreateVisibility = visibility
        lastCreateVisibilityUserIds = visibilityUserIds
        return try await create(content: content, type: type, visibility: visibility, moodEmoji: moodEmoji,
                                mediaIds: mediaIds, audioUrl: audioUrl, audioDuration: audioDuration,
                                originalLanguage: originalLanguage, mobileTranscription: mobileTranscription,
                                repostOfId: repostOfId, location: location, mentions: mentions)
    }

    /// Surcharge COMPLÈTE : sans elle, le défaut du protocole rabat l'appel sur
    /// la signature courte et les références déclarées disparaissent avant
    /// d'être observables — un test vert prouverait l'inverse de ce qu'il croit.
    func create(content: String?, type: String, visibility: String, moodEmoji: String?,
                mediaIds: [String]?, audioUrl: String?, audioDuration: Int?,
                originalLanguage: String?,
                mobileTranscription: MobileTranscriptionPayload?,
                repostOfId: String?, location: SharedPlace?,
                mentions: [PostMentionInput]?) async throws -> APIPost {
        lastCreateMentions = mentions
        lastCreateLocation = location
        return try await create(content: content, type: type, visibility: visibility, moodEmoji: moodEmoji,
                                mediaIds: mediaIds, audioUrl: audioUrl, audioDuration: audioDuration,
                                originalLanguage: originalLanguage, mobileTranscription: mobileTranscription,
                                repostOfId: repostOfId)
    }

    func delete(postId: String) async throws {
        deleteCallCount += 1
        lastDeletePostId = postId
        try deleteResult.get()
    }

    func like(postId: String) async throws {
        likeCallCount += 1
        lastLikePostId = postId
        try likeResult.get()
    }

    func unlike(postId: String) async throws {
        unlikeCallCount += 1
        lastUnlikePostId = postId
        try unlikeResult.get()
    }

    func bookmark(postId: String) async throws {
        bookmarkCallCount += 1
        lastBookmarkPostId = postId
        try bookmarkResult.get()
    }

    func addComment(postId: String, content: String, parentId: String?, effectFlags: Int?,
                    attachmentIds: [String]?, mobileTranscription: MobileTranscriptionPayload?,
                    originalLanguage: String?) async throws -> APIPostComment {
        addCommentCallCount += 1
        lastAddCommentPostId = postId
        lastAddCommentContent = content
        lastAddCommentParentId = parentId
        lastAddCommentAttachmentIds = attachmentIds
        return try addCommentResult.get()
    }

    func addComment(postId: String, content: String, parentId: String?, effectFlags: Int?, clientMutationId: String?) async throws -> APIPostComment {
        lastAddCommentClientMutationId = clientMutationId
        return try await addComment(postId: postId, content: content, parentId: parentId, effectFlags: effectFlags)
    }

    func likeComment(postId: String, commentId: String) async throws {
        likeCommentCallCount += 1
        lastLikeCommentPostId = postId
        lastLikeCommentCommentId = commentId
        try likeCommentResult.get()
    }

    func unlikeComment(postId: String, commentId: String) async throws {
        unlikeCommentCallCount += 1
        lastUnlikeCommentPostId = postId
        lastUnlikeCommentCommentId = commentId
        try unlikeCommentResult.get()
    }

    func deleteComment(postId: String, commentId: String) async throws {
        deleteCommentCallCount += 1
        lastDeleteCommentPostId = postId
        lastDeleteCommentCommentId = commentId
        try deleteCommentResult.get()
    }

    /// Defaults mirror `PostService.repost`, which defaults every parameter.
    /// Without them a caller that omits an argument compiles against the real
    /// service and fails against this mock — which is exactly how `visibility`
    /// broke the test target when it was added.
    func repost(
        postId: String,
        targetType: PostType? = nil,
        content: String? = nil,
        isQuote: Bool = false,
        visibility: String? = nil
    ) async throws -> APIPost {
        repostCallCount += 1
        lastRepostPostId = postId
        lastRepostTargetType = targetType
        lastRepostContent = content
        lastRepostIsQuote = isQuote
        lastRepostVisibility = visibility
        return try repostResult.get()
    }

    func share(postId: String) async throws {
        shareCallCount += 1
        lastSharePostId = postId
        try shareResult.get()
    }

    func share(postId: String, platform: String?, generateLink: Bool) async throws -> PostShareResult {
        shareCallCount += 1
        lastSharePostId = postId
        lastSharePlatform = platform
        lastShareGenerateLink = generateLink
        try shareResult.get()
        return PostShareResult(
            shared: true,
            shareCount: 1,
            shortUrl: generateLink ? "https://meeshy.me/l/mock123" : nil,
            token: generateLink ? "mock123" : nil
        )
    }

    func createStory(content: String?, storyEffects: StoryEffects?, visibility: String,
                     visibilityUserIds: [String]?, originalLanguage: String?, mediaIds: [String]?,
                     repostOfId: String?) async throws -> APIPost {
        createStoryCallCount += 1
        lastCreateStoryContent = content
        lastCreateStoryRepostOfId = repostOfId
        lastCreateStoryOriginalLanguage = originalLanguage
        lastCreateStoryEffects = storyEffects
        while createStoryHangs {
            try Task.checkCancellation()
            try await Task.sleep(nanoseconds: 20_000_000)
        }
        if !createStoryResultsQueue.isEmpty {
            return try createStoryResultsQueue.removeFirst().get()
        }
        return try createStoryResult.get()
    }

    /// Surcharge PORTEUSE des modes déclarés. Sans elle, le défaut du protocole
    /// retomberait sur la signature sans `mentions` et le double ne verrait
    /// jamais ce que la publication déclare.
    func createStory(content: String?, storyEffects: StoryEffects?, visibility: String,
                     visibilityUserIds: [String]?, originalLanguage: String?, mediaIds: [String]?,
                     repostOfId: String?, mentions: [PostMentionInput]?) async throws -> APIPost {
        lastCreateStoryMentions = mentions
        return try await createStory(content: content, storyEffects: storyEffects, visibility: visibility,
                                     visibilityUserIds: visibilityUserIds, originalLanguage: originalLanguage,
                                     mediaIds: mediaIds, repostOfId: repostOfId)
    }

    /// Surcharge PORTEUSE du format (V3-3). Sans elle, le défaut du protocole
    /// retomberait sur `createStory` et le double ne verrait jamais sous quel
    /// type la publication est réellement partie — la chaîne aurait l'air
    /// recousue.
    func createCanvasPost(type: PostType, content: String?, storyEffects: StoryEffects?,
                          visibility: String, visibilityUserIds: [String]?, originalLanguage: String?,
                          mediaIds: [String]?, repostOfId: String?, mentions: [PostMentionInput]?,
                          allowSoundExtraction: Bool?, mediaAlt: [String: String]?) async throws -> APIPost {
        lastCreateCanvasPostType = type
        return try await createStory(content: content, storyEffects: storyEffects, visibility: visibility,
                                     visibilityUserIds: visibilityUserIds, originalLanguage: originalLanguage,
                                     mediaIds: mediaIds, repostOfId: repostOfId, mentions: mentions)
    }

    func createWithType(_ type: PostType, content: String, visibility: String,
                        moodEmoji: String?, storyEffects: StoryEffects?) async throws -> APIPost {
        createWithTypeCallCount += 1
        lastCreateWithTypeType = type
        return try createWithTypeResult.get()
    }

    func requestTranslation(postId: String, targetLanguage: String) async throws {}

    func pinPost(postId: String) async throws {}

    func unpinPost(postId: String) async throws {}

    func update(postId: String, content: String?, visibility: String?, visibilityUserIds: [String]?, moodEmoji: String?, originalLanguage: String?, type: String?, removeMediaIds: [String]?, storyEffects: StoryEffects?, mediaIds: [String]?, location: PostLocationUpdate?) async throws -> APIPost {
        updateCallCount += 1
        lastUpdatePostId = postId
        lastUpdateContent = content
        lastUpdateVisibility = visibility
        lastUpdateVisibilityUserIds = visibilityUserIds
        lastUpdateOriginalLanguage = originalLanguage
        lastUpdateType = type
        lastUpdateRemoveMediaIds = removeMediaIds
        lastUpdateStoryEffects = storyEffects
        lastUpdateMediaIds = mediaIds
        lastUpdateLocation = location
        return try createResult.get()
    }

    /// Surcharge COMPLÈTE : sans elle, le défaut du protocole rabat l'appel sur
    /// la signature sans mentions et le tri-état devient inobservable — un test
    /// vert prouverait l'inverse de ce qu'il croit.
    func update(postId: String, content: String?, visibility: String?, visibilityUserIds: [String]?, moodEmoji: String?, originalLanguage: String?, type: String?, removeMediaIds: [String]?, storyEffects: StoryEffects?, mediaIds: [String]?, location: PostLocationUpdate?, mentions: [PostMentionInput]?) async throws -> APIPost {
        lastUpdateMentions = mentions
        return try await update(postId: postId, content: content, visibility: visibility,
                                visibilityUserIds: visibilityUserIds, moodEmoji: moodEmoji,
                                originalLanguage: originalLanguage, type: type,
                                removeMediaIds: removeMediaIds, storyEffects: storyEffects,
                                mediaIds: mediaIds, location: location)
    }

    func viewPost(postId: String, duration: Int?) async throws {
        viewPostCallCount += 1
        lastViewPostId = postId
    }

    func getPostViews(postId: String, limit: Int, offset: Int) async throws -> PostViewersResponse {
        getPostViewsCallCount += 1
        return JSONStub.decode("""
        {"items":[],"pagination":{"total":0,"offset":0,"limit":\(limit),"hasMore":false}}
        """)
    }

    var updateCommentResult: Result<APIPostComment, Error> = .failure(NSError(domain: "MockPostService", code: 0))
    var updateCommentCallCount = 0
    var lastUpdateCommentId: String?
    var lastUpdateCommentContent: String?
    var lastUpdateCommentEffectFlags: Int?

    func updateComment(postId: String, commentId: String, content: String?, effectFlags: Int?) async throws -> APIPostComment {
        updateCommentCallCount += 1
        lastUpdateCommentId = commentId
        lastUpdateCommentContent = content
        lastUpdateCommentEffectFlags = effectFlags
        return try updateCommentResult.get()
    }

    func getUserPosts(userId: String, cursor: String?, limit: Int) async throws -> PaginatedAPIResponse<[APIPost]> {
        getUserPostsCallCount += 1
        lastGetUserPostsCursor = cursor
        if !getUserPostsResultsQueue.isEmpty {
            return try getUserPostsResultsQueue.removeFirst().get()
        }
        return try getFeedResult.get()
    }

    func getCommentReplies(postId: String, commentId: String, cursor: String?, limit: Int) async throws -> PaginatedAPIResponse<[APIPostComment]> {
        getCommentRepliesCallCount += 1
        lastGetCommentRepliesPostId = postId
        lastGetCommentRepliesCommentId = commentId
        lastGetCommentRepliesCursor = cursor
        if !getCommentRepliesResultsQueue.isEmpty {
            return try getCommentRepliesResultsQueue.removeFirst().get()
        }
        return try getCommentRepliesResult.get()
    }

    func getCommunityPosts(communityId: String, cursor: String?, limit: Int) async throws -> PaginatedAPIResponse<[APIPost]> {
        getCommunityPostsCallCount += 1
        return try getFeedResult.get()
    }

    func getBookmarks(cursor: String?, limit: Int) async throws -> PaginatedAPIResponse<[APIPost]> {
        getBookmarksCallCount += 1
        lastGetBookmarksCursor = cursor
        return try getBookmarksResult.get()
    }

    func removeBookmark(postId: String) async throws {
        removeBookmarkCallCount += 1
        lastRemoveBookmarkPostId = postId
        try removeBookmarkResult.get()
    }

    func getPost(postId: String) async throws -> APIPost {
        getPostCallCount += 1
        lastGetPostId = postId
        return try getPostResult.get()
    }

    func getComments(postId: String, cursor: String?, limit: Int) async throws -> PaginatedAPIResponse<[APIPostComment]> {
        getCommentsCallCount += 1
        lastGetCommentsPostId = postId
        if !getCommentsResultsQueue.isEmpty {
            return try getCommentsResultsQueue.removeFirst().get()
        }
        return try getCommentsResult.get()
    }

    func recordImpressions(postIds: [String], source: String) async throws {
        recordImpressionsCallCount += 1
        lastRecordImpressionPostIds = postIds
        lastRecordImpressionsSource = source
        try recordImpressionsResult.get()
    }

    func recordImpression(postId: String, source: String) async throws {
        recordImpressionCallCount += 1
        lastRecordImpressionPostId = postId
        lastRecordImpressionSource = source
    }

    func recordEngagement(_ sessions: [EngagementSession]) async throws {
        recordEngagementCallCount += 1
        lastRecordEngagementSessions = sessions
    }

    // MARK: - Reset

    func reset() {
        getFeedResult = .success(emptyPaginatedPosts)
        getFeedCallCount = 0
        lastGetFeedCursor = nil
        lastGetFeedLimit = nil
        getPostsByHashtagResult = .success(emptyPaginatedPosts)
        getPostsByHashtagCallCount = 0
        getTrendingHashtagsResult = .success([])
        getTrendingHashtagsCallCount = 0

        getReelsResult = nil
        getReelsCallCount = 0
        lastGetReelsSeedId = nil
        lastGetReelsCursor = nil
        lastGetReelsLimit = nil

        createResult = .success(stubPost)
        createCallCount = 0
        lastCreateContent = nil
        lastCreateType = nil
        lastCreateRepostOfId = nil

        deleteResult = .success(())
        deleteCallCount = 0
        lastDeletePostId = nil

        likeResult = .success(())
        likeCallCount = 0
        lastLikePostId = nil

        unlikeResult = .success(())
        unlikeCallCount = 0
        lastUnlikePostId = nil

        bookmarkResult = .success(())
        bookmarkCallCount = 0
        lastBookmarkPostId = nil

        addCommentResult = .success(stubComment)
        addCommentCallCount = 0
        lastAddCommentPostId = nil
        lastAddCommentContent = nil
        lastAddCommentParentId = nil
        lastAddCommentClientMutationId = nil
        lastAddCommentAttachmentIds = nil

        likeCommentResult = .success(())
        likeCommentCallCount = 0
        lastLikeCommentPostId = nil
        lastLikeCommentCommentId = nil
        unlikeCommentResult = .success(())
        unlikeCommentCallCount = 0
        lastUnlikeCommentPostId = nil
        lastUnlikeCommentCommentId = nil
        deleteCommentResult = .success(())
        deleteCommentCallCount = 0
        lastDeleteCommentPostId = nil
        lastDeleteCommentCommentId = nil

        repostResult = .success(stubPost)
        repostCallCount = 0
        lastRepostPostId = nil
        lastRepostTargetType = nil
        lastRepostContent = nil
        lastRepostIsQuote = nil
        lastRepostVisibility = nil

        shareResult = .success(())
        shareCallCount = 0
        lastSharePostId = nil
        lastShareGenerateLink = nil
        lastSharePlatform = nil

        createStoryResult = .success(stubPost)
        createStoryResultsQueue = []
        createStoryHangs = false
        createStoryCallCount = 0
        lastCreateCanvasPostType = nil
        lastCreateStoryContent = nil
        lastCreateStoryRepostOfId = nil
        lastCreateStoryOriginalLanguage = nil
        lastCreateStoryEffects = nil
        lastCreateStoryMentions = nil

        createWithTypeResult = .success(stubPost)
        createWithTypeCallCount = 0
        lastCreateWithTypeType = nil

        updateCallCount = 0
        lastUpdatePostId = nil
        lastUpdateContent = nil
        lastUpdateOriginalLanguage = nil
        lastUpdateType = nil
        lastUpdateStoryEffects = nil
        lastUpdateMediaIds = nil
        lastUpdateLocation = nil
        viewPostCallCount = 0
        lastViewPostId = nil
        getPostViewsCallCount = 0
        getUserPostsCallCount = 0
        lastGetUserPostsCursor = nil
        getUserPostsResultsQueue = []
        getCommentRepliesCallCount = 0
        lastGetCommentRepliesPostId = nil
        lastGetCommentRepliesCommentId = nil
        lastGetCommentRepliesCursor = nil
        getCommentRepliesResult = {
            let empty: PaginatedAPIResponse<[APIPostComment]> = JSONStub.decode("""
            {"success":true,"data":[],"pagination":null,"error":null}
            """)
            return .success(empty)
        }()
        getCommentRepliesResultsQueue = []
        getCommunityPostsCallCount = 0

        getBookmarksResult = .success(emptyPaginatedPosts)
        getBookmarksCallCount = 0
        lastGetBookmarksCursor = nil

        removeBookmarkResult = .success(())
        removeBookmarkCallCount = 0
        lastRemoveBookmarkPostId = nil

        getPostResult = .success(stubPost)
        getPostCallCount = 0
        lastGetPostId = nil

        getCommentsCallCount = 0
        lastGetCommentsPostId = nil

        recordImpressionsCallCount = 0
        lastRecordImpressionsSource = nil
        recordImpressionsResult = .success(())
        lastRecordImpressionPostIds = nil

        recordImpressionCallCount = 0
        lastRecordImpressionPostId = nil
        lastRecordImpressionSource = nil

        recordEngagementCallCount = 0
        lastRecordEngagementSessions = nil
    }
}
