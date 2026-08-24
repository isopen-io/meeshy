import Foundation

// MARK: - Share Result

/// Server payload returned by `POST /posts/:postId/share`. The counter is
/// always populated; `shortUrl` and `token` are only present when the
/// caller asked the gateway to mint a TrackingLink alongside the share.
public struct PostShareResult: Decodable, Sendable {
    public let shared: Bool
    public let shareCount: Int
    public let shortUrl: String?
    public let token: String?

    public init(shared: Bool, shareCount: Int, shortUrl: String?, token: String?) {
        self.shared = shared
        self.shareCount = shareCount
        self.shortUrl = shortUrl
        self.token = token
    }
}

// MARK: - Protocol

public protocol PostServiceProviding: Sendable {
    func getFeed(cursor: String?, limit: Int) async throws -> PaginatedAPIResponse<[APIPost]>
    /// `GET /posts/hashtag/:tag` — posts+reels portant ce hashtag, plus
    /// récents en premier. `tag` est envoyé tel quel (le serveur normalise).
    func getPostsByHashtag(tag: String, cursor: String?, limit: Int) async throws -> PaginatedAPIResponse<[APIPost]>
    /// `GET /hashtags/trending` — top hashtags par usageCount décroissant.
    func getTrendingHashtags(limit: Int) async throws -> [APIHashtag]
    /// Thread de découverte de réels (`GET /posts/feed/reels`). `seedReelId` = le
    /// réel d'entrée touché dans le feed → le serveur classe par affinité à ce réel
    /// (et l'exclut, comme il exclut les réels de l'utilisateur). Sans seed → « Pour toi ».
    /// Contrairement à `getFeed`, la réponse est déjà filtrée `type: REEL` et porte
    /// `isBookmarkedByMe` (cf. `enrichReelsForViewer`).
    func getReels(seedReelId: String?, cursor: String?, limit: Int) async throws -> PaginatedAPIResponse<[APIPost]>
    func create(content: String?, type: String, visibility: String, moodEmoji: String?, mediaIds: [String]?, audioUrl: String?, audioDuration: Int?, originalLanguage: String?, mobileTranscription: MobileTranscriptionPayload?, repostOfId: String?) async throws -> APIPost
    /// Variante qui transporte un lieu partagé (`SharedPlace`) — même convention que
    /// `addComment` ci-dessous (Task 9 gateway). Requirement séparée (et non un
    /// paramètre par défaut sur la précédente) pour que les conformeurs existants
    /// (mocks) restent valides via le défaut ci-dessous, qui ignore simplement
    /// `location` s'il n'est pas surchargé.
    func create(content: String?, type: String, visibility: String, moodEmoji: String?, mediaIds: [String]?, audioUrl: String?, audioDuration: Int?, originalLanguage: String?, mobileTranscription: MobileTranscriptionPayload?, repostOfId: String?, location: SharedPlace?) async throws -> APIPost
    /// Même création, plus les personnes que le texte ne nomme pas (note sous
    /// le contenu, métadonnée silencieuse). Requirement SÉPARÉE et non un
    /// paramètre ajouté à la précédente : les protocoles Swift ne portent pas
    /// de valeur par défaut, et tout double de test aurait cessé de conformer
    /// d'un coup — même patron que `createStory(… mentions:)`.
    func create(content: String?, type: String, visibility: String, moodEmoji: String?, mediaIds: [String]?, audioUrl: String?, audioDuration: Int?, originalLanguage: String?, mobileTranscription: MobileTranscriptionPayload?, repostOfId: String?, location: SharedPlace?, mentions: [PostMentionInput]?) async throws -> APIPost
    /// Création porteuse d'une AUDIENCE NOMMÉE (`EXCEPT`/`ONLY`).
    func create(content: String?, type: String, visibility: String, visibilityUserIds: [String]?, moodEmoji: String?, mediaIds: [String]?, audioUrl: String?, audioDuration: Int?, originalLanguage: String?, mobileTranscription: MobileTranscriptionPayload?, repostOfId: String?, location: SharedPlace?, mentions: [PostMentionInput]?) async throws -> APIPost
    /// Même création, plus l'opt-in d'extraction de bande-son vidéo
    /// (`Post.allowSoundExtraction`) et le texte alternatif par média
    /// (`PostMedia.alt`, accessibilité — clé = un id de `mediaIds`).
    /// Requirement SÉPARÉE, même patron que `create(… mentions:)` ci-dessus :
    /// les conformeurs existants (mocks) restent valides via le défaut
    /// ci-dessous, qui ignore simplement les deux champs s'il n'est pas
    /// surchargé.
    func create(content: String?, type: String, visibility: String, moodEmoji: String?, mediaIds: [String]?, audioUrl: String?, audioDuration: Int?, originalLanguage: String?, mobileTranscription: MobileTranscriptionPayload?, repostOfId: String?, location: SharedPlace?, mentions: [PostMentionInput]?, allowSoundExtraction: Bool?, mediaAlt: [String: String]?) async throws -> APIPost
    func update(postId: String, content: String?, visibility: String?, visibilityUserIds: [String]?, moodEmoji: String?, originalLanguage: String?, type: String?, removeMediaIds: [String]?, storyEffects: StoryEffects?, mediaIds: [String]?, location: PostLocationUpdate?) async throws -> APIPost
    /// Même édition, plus le tri-état des références déclarées. Requirement
    /// SÉPARÉE et non un paramètre ajouté à la précédente : les protocoles
    /// Swift ne portent pas de valeur par défaut, et tout double de test aurait
    /// cessé de conformer d'un coup — même patron que `create(… mentions:)`.
    func update(postId: String, content: String?, visibility: String?, visibilityUserIds: [String]?, moodEmoji: String?, originalLanguage: String?, type: String?, removeMediaIds: [String]?, storyEffects: StoryEffects?, mediaIds: [String]?, location: PostLocationUpdate?, mentions: [PostMentionInput]?) async throws -> APIPost
    /// Même édition, plus l'opt-in d'extraction de bande-son vidéo et le texte
    /// alternatif par média — même patron que `create(… allowSoundExtraction:
    /// mediaAlt:)` ci-dessus.
    func update(postId: String, content: String?, visibility: String?, visibilityUserIds: [String]?, moodEmoji: String?, originalLanguage: String?, type: String?, removeMediaIds: [String]?, storyEffects: StoryEffects?, mediaIds: [String]?, location: PostLocationUpdate?, mentions: [PostMentionInput]?, allowSoundExtraction: Bool?, mediaAlt: [String: String]?) async throws -> APIPost
    func delete(postId: String) async throws
    func like(postId: String) async throws
    func unlike(postId: String) async throws
    func bookmark(postId: String) async throws
    func getBookmarks(cursor: String?, limit: Int) async throws -> PaginatedAPIResponse<[APIPost]>
    func removeBookmark(postId: String) async throws
    func getPost(postId: String) async throws -> APIPost
    func getComments(postId: String, cursor: String?, limit: Int) async throws -> PaginatedAPIResponse<[APIPostComment]>
    func addComment(postId: String, content: String, parentId: String?, effectFlags: Int?, attachmentIds: [String]?, mobileTranscription: MobileTranscriptionPayload?, originalLanguage: String?) async throws -> APIPostComment
    /// Variante qui transporte un lieu partagé (`SharedPlace`) — même contrat
    /// que le message et le post (Task 9 gateway). Requirement séparée (et non
    /// un paramètre par défaut sur la précédente) pour que les conformeurs
    /// existants (mocks) restent valides via le défaut ci-dessous, qui ignore
    /// simplement `location` s'il n'est pas surchargé.
    func addComment(postId: String, content: String, parentId: String?, effectFlags: Int?, attachmentIds: [String]?, mobileTranscription: MobileTranscriptionPayload?, originalLanguage: String?, location: SharedPlace?) async throws -> APIPostComment
    /// Variante complète ET idempotente — envoie `clientMutationId` en header
    /// `X-Client-Mutation-Id` pour que le gateway dédoublonne les rejeux et
    /// ré-émette le cmid dans l'écho `comment:added` (réconciliation de la
    /// ligne optimiste par l'émetteur). Requirement séparée pour que les
    /// conformeurs existants restent valides via le défaut ci-dessous.
    func addComment(postId: String, content: String, parentId: String?, effectFlags: Int?, attachmentIds: [String]?, mobileTranscription: MobileTranscriptionPayload?, originalLanguage: String?, location: SharedPlace?, clientMutationId: String?) async throws -> APIPostComment
    /// Idempotent text-only variant — sends `clientMutationId` as the
    /// `X-Client-Mutation-Id` header so the gateway `MutationLog` replays the
    /// recorded result instead of duplicating the comment on retry (offline
    /// outbox flush, notification quick-comment). A default implementation
    /// forwards to the full `addComment` so existing conformers stay
    /// source-compatible.
    func addComment(postId: String, content: String, parentId: String?, effectFlags: Int?, clientMutationId: String?) async throws -> APIPostComment
    func likeComment(postId: String, commentId: String) async throws
    func unlikeComment(postId: String, commentId: String) async throws
    func deleteComment(postId: String, commentId: String) async throws
    /// Édition d'un commentaire par son auteur : contenu et/ou effets visuels
    /// (`effectFlags`, même bitfield que la création — lueur/pulse/…). Une
    /// requirement séparée avec défaut ci-dessous pour garder les mocks valides.
    func updateComment(postId: String, commentId: String, content: String?, effectFlags: Int?) async throws -> APIPostComment
    func repost(postId: String, targetType: PostType?, content: String?, isQuote: Bool, visibility: String?) async throws -> APIPost
    func share(postId: String) async throws
    func share(postId: String, platform: String?, generateLink: Bool) async throws -> PostShareResult
    func createStory(content: String?, storyEffects: StoryEffects?, visibility: String, visibilityUserIds: [String]?, originalLanguage: String?, mediaIds: [String]?, repostOfId: String?) async throws -> APIPost
    /// Même publication, plus les nommés que `content` ne porte pas (pastilles
    /// du canevas). Signature SÉPARÉE et non un paramètre ajouté à la
    /// précédente : les protocoles Swift ne portent pas de valeur par défaut, et
    /// tout double de test aurait cessé de conformer d'un coup.
    func createStory(content: String?, storyEffects: StoryEffects?, visibility: String, visibilityUserIds: [String]?, originalLanguage: String?, mediaIds: [String]?, repostOfId: String?, mentions: [PostMentionInput]?) async throws -> APIPost
    /// Même publication, plus l'opt-in d'extraction de bande-son
    /// (`Post.allowSoundExtraction`) et le texte alternatif par média
    /// (`PostMedia.alt`, clé = un id de `mediaIds`). Requirement SÉPARÉE, même
    /// patron que `create(… allowSoundExtraction: mediaAlt:)` : les protocoles
    /// Swift ne portent pas de valeur par défaut, et tout double de test aurait
    /// cessé de conformer d'un coup.
    func createStory(content: String?, storyEffects: StoryEffects?, visibility: String, visibilityUserIds: [String]?, originalLanguage: String?, mediaIds: [String]?, repostOfId: String?, mentions: [PostMentionInput]?, allowSoundExtraction: Bool?, mediaAlt: [String: String]?) async throws -> APIPost
    /// Publication d'un CANEVAS dont le TYPE suit le format choisi dans le
    /// composer — l'entrée par laquelle « changer de format change ce qui est
    /// publié » (V3-3).
    ///
    /// Le canevas voyage avec le type, et c'est délibéré : `create(content:
    /// type:…)` ne porte aucun `storyEffects`, si bien qu'y router un post
    /// composé perdrait chaque objet texte, autocollant et dessin SANS erreur
    /// de compilation — et l'aperçu du composer, qui rend ce même canevas
    /// (loi 6), mentirait alors sur ce qui part. Le gateway modélise déjà la
    /// forme retenue : `CreatePostSchema` accepte `storyEffects` pour les
    /// quatre types, et `createPost` le persiste quel que soit le type.
    ///
    /// Requirement SÉPARÉE avec défaut ci-dessous, même patron que
    /// `createStory(… mentions:)` : les protocoles Swift ne portent pas de
    /// valeur par défaut, et tout double de test aurait cessé de conformer.
    func createCanvasPost(type: PostType, content: String?, storyEffects: StoryEffects?, visibility: String, visibilityUserIds: [String]?, originalLanguage: String?, mediaIds: [String]?, repostOfId: String?, mentions: [PostMentionInput]?, allowSoundExtraction: Bool?, mediaAlt: [String: String]?) async throws -> APIPost
    func createWithType(_ type: PostType, content: String, visibility: String, moodEmoji: String?, storyEffects: StoryEffects?) async throws -> APIPost
    func requestTranslation(postId: String, targetLanguage: String) async throws
    func pinPost(postId: String) async throws
    func unpinPost(postId: String) async throws
    func viewPost(postId: String, duration: Int?) async throws
    func getPostViews(postId: String, limit: Int, offset: Int) async throws -> PostViewersResponse
    func getUserPosts(userId: String, cursor: String?, limit: Int) async throws -> PaginatedAPIResponse<[APIPost]>
    func getCommentReplies(postId: String, commentId: String, cursor: String?, limit: Int) async throws -> PaginatedAPIResponse<[APIPostComment]>
    func getCommunityPosts(communityId: String, cursor: String?, limit: Int) async throws -> PaginatedAPIResponse<[APIPost]>
    func recordImpressions(postIds: [String], source: String) async throws
    func recordImpression(postId: String, source: String) async throws
    func recordEngagement(_ sessions: [EngagementSession]) async throws
    /// `POST /posts/from-attachment` — publie une pièce jointe DÉJÀ reçue en
    /// conversation, sans la retélécharger ni la réenvoyer : le fichier est
    /// déjà sur le stockage, le serveur le duplique côté post.
    ///
    /// `target` absent laisse la règle partagée choisir d'après le type MIME
    /// (image → POST, vidéo/son → REEL) ; une STORY se demande toujours
    /// explicitement. `capturedInApp` est REDÉCLARÉ ici parce que le serveur ne
    /// l'infère pas : il le journalise pour que « publié depuis une capture »
    /// reste lisible après coup.
    ///
    /// Requirement SÉPARÉE avec défaut ci-dessous — même convention que le
    /// reste de ce protocole : un double de test qui ne la surcharge pas reste
    /// conforme.
    func publishAttachment(attachmentId: String, target: PublicationTarget?, content: String?, capturedInApp: Bool) async throws -> APIPost
}

public extension PostServiceProviding {
    /// Défaut : un conformeur qui ne publie pas depuis une pièce jointe (tous
    /// les doubles de test existants) reste valide. Il ÉCHOUE plutôt que de
    /// rendre un post fabriqué — un défaut silencieux ferait passer un témoin
    /// qui croit avoir publié.
    func publishAttachment(attachmentId: String, target: PublicationTarget?, content: String?, capturedInApp: Bool) async throws -> APIPost {
        throw APIError.serverError(501, "publishAttachment not implemented by \(Self.self)")
    }

    /// Défaut : un conformeur qui n'implémente que la signature SANS mentions
    /// (mocks existants) reste valide — les pastilles sont simplement ignorées
    /// tant que le type ne surcharge pas cette méthode. `PostService` la
    /// surcharge réellement.
    func createStory(content: String?, storyEffects: StoryEffects?, visibility: String, visibilityUserIds: [String]?, originalLanguage: String?, mediaIds: [String]?, repostOfId: String?, mentions: [PostMentionInput]?) async throws -> APIPost {
        try await createStory(content: content, storyEffects: storyEffects, visibility: visibility,
                              visibilityUserIds: visibilityUserIds, originalLanguage: originalLanguage,
                              mediaIds: mediaIds, repostOfId: repostOfId)
    }

    /// Défaut : un conformeur qui n'implémente que la signature SANS
    /// `allowSoundExtraction`/`mediaAlt` (mocks existants) reste valide — les
    /// deux champs sont simplement ignorés tant que le type ne surcharge pas
    /// cette méthode. `PostService` la surcharge réellement.
    func createStory(content: String?, storyEffects: StoryEffects?, visibility: String, visibilityUserIds: [String]?, originalLanguage: String?, mediaIds: [String]?, repostOfId: String?, mentions: [PostMentionInput]?, allowSoundExtraction: Bool?, mediaAlt: [String: String]?) async throws -> APIPost {
        try await createStory(content: content, storyEffects: storyEffects, visibility: visibility,
                              visibilityUserIds: visibilityUserIds, originalLanguage: originalLanguage,
                              mediaIds: mediaIds, repostOfId: repostOfId, mentions: mentions)
    }

    /// Défaut : un conformeur qui ne sait pas porter le format (doubles de
    /// test) retombe sur la publication de story. Il perd alors le TYPE, et
    /// c'est assumé — un double ne parle à aucun serveur. La garantie qui
    /// compte porte sur le corps réellement remis à `POST /posts`, que
    /// `PostService` surcharge plus bas et que `CanvasPostTypeTests` mesure.
    func createCanvasPost(type: PostType, content: String?, storyEffects: StoryEffects?, visibility: String, visibilityUserIds: [String]?, originalLanguage: String?, mediaIds: [String]?, repostOfId: String?, mentions: [PostMentionInput]?, allowSoundExtraction: Bool?, mediaAlt: [String: String]?) async throws -> APIPost {
        try await createStory(content: content, storyEffects: storyEffects, visibility: visibility,
                              visibilityUserIds: visibilityUserIds, originalLanguage: originalLanguage,
                              mediaIds: mediaIds, repostOfId: repostOfId, mentions: mentions,
                              allowSoundExtraction: allowSoundExtraction, mediaAlt: mediaAlt)
    }

    /// Défaut : un conformeur qui n'implémente que la signature SANS mentions
    /// (mocks existants) reste valide. Le tri-état retombe alors sur « je n'en
    /// parle pas » — jamais sur `[]`, qui révoquerait.
    func update(postId: String, content: String?, visibility: String?, visibilityUserIds: [String]?, moodEmoji: String?, originalLanguage: String?, type: String?, removeMediaIds: [String]?, storyEffects: StoryEffects?, mediaIds: [String]?, location: PostLocationUpdate?, mentions: [PostMentionInput]?) async throws -> APIPost {
        try await update(postId: postId, content: content, visibility: visibility, visibilityUserIds: visibilityUserIds,
                         moodEmoji: moodEmoji, originalLanguage: originalLanguage, type: type,
                         removeMediaIds: removeMediaIds, storyEffects: storyEffects, mediaIds: mediaIds,
                         location: location)
    }

    /// Défaut : un conformeur qui n'implémente que la signature SANS
    /// `allowSoundExtraction`/`mediaAlt` (mocks existants) reste valide — les
    /// deux champs sont simplement ignorés tant que le type ne surcharge pas
    /// cette méthode. `PostService` la surcharge réellement plus bas.
    func update(postId: String, content: String?, visibility: String?, visibilityUserIds: [String]?, moodEmoji: String?, originalLanguage: String?, type: String?, removeMediaIds: [String]?, storyEffects: StoryEffects?, mediaIds: [String]?, location: PostLocationUpdate?, mentions: [PostMentionInput]?, allowSoundExtraction: Bool?, mediaAlt: [String: String]?) async throws -> APIPost {
        try await update(postId: postId, content: content, visibility: visibility, visibilityUserIds: visibilityUserIds,
                         moodEmoji: moodEmoji, originalLanguage: originalLanguage, type: type,
                         removeMediaIds: removeMediaIds, storyEffects: storyEffects, mediaIds: mediaIds,
                         location: location, mentions: mentions)
    }

    /// Compat : la signature historique 8-params reste disponible pour les
    /// call sites existants — les protocoles Swift ne portent pas de valeurs
    /// par défaut. `storyEffects` / `mediaIds` (édition de story) partent à nil.
    func update(postId: String, content: String?, visibility: String?, visibilityUserIds: [String]?, moodEmoji: String?, originalLanguage: String?, type: String?, removeMediaIds: [String]?) async throws -> APIPost {
        try await update(postId: postId, content: content, visibility: visibility, visibilityUserIds: visibilityUserIds,
                         moodEmoji: moodEmoji, originalLanguage: originalLanguage, type: type,
                         removeMediaIds: removeMediaIds, storyEffects: nil, mediaIds: nil, location: nil)
    }

    /// Défaut : un conformeur qui n'implémente que la signature sans `location`
    /// (mocks existants) reste valide — la position est simplement ignorée tant
    /// que le type ne surcharge pas cette méthode. `PostService` la surcharge
    /// réellement plus bas.
    func create(content: String?, type: String, visibility: String, moodEmoji: String?, mediaIds: [String]?, audioUrl: String?, audioDuration: Int?, originalLanguage: String?, mobileTranscription: MobileTranscriptionPayload?, repostOfId: String?, location: SharedPlace?) async throws -> APIPost {
        try await create(content: content, type: type, visibility: visibility, moodEmoji: moodEmoji, mediaIds: mediaIds, audioUrl: audioUrl, audioDuration: audioDuration, originalLanguage: originalLanguage, mobileTranscription: mobileTranscription, repostOfId: repostOfId)
    }

    /// Défaut : un conformeur qui n'implémente que la signature SANS mentions
    /// (mocks existants) reste valide — les modes déclarés sont simplement
    /// ignorés tant que le type ne surcharge pas cette méthode. `PostService`
    /// la surcharge réellement.
    func create(content: String?, type: String, visibility: String, moodEmoji: String?, mediaIds: [String]?, audioUrl: String?, audioDuration: Int?, originalLanguage: String?, mobileTranscription: MobileTranscriptionPayload?, repostOfId: String?, location: SharedPlace?, mentions: [PostMentionInput]?) async throws -> APIPost {
        try await create(content: content, type: type, visibility: visibility, moodEmoji: moodEmoji, mediaIds: mediaIds, audioUrl: audioUrl, audioDuration: audioDuration, originalLanguage: originalLanguage, mobileTranscription: mobileTranscription, repostOfId: repostOfId, location: location)
    }

    /// Défaut : un conformeur qui ne sait pas porter d'audience nommée
    /// (mocks) retombe sur la signature sans liste — la visibilité part,
    /// la liste est ignorée. `PostService` la surcharge réellement.
    func create(content: String?, type: String, visibility: String, visibilityUserIds: [String]?, moodEmoji: String?, mediaIds: [String]?, audioUrl: String?, audioDuration: Int?, originalLanguage: String?, mobileTranscription: MobileTranscriptionPayload?, repostOfId: String?, location: SharedPlace?, mentions: [PostMentionInput]?) async throws -> APIPost {
        try await create(content: content, type: type, visibility: visibility, moodEmoji: moodEmoji, mediaIds: mediaIds, audioUrl: audioUrl, audioDuration: audioDuration, originalLanguage: originalLanguage, mobileTranscription: mobileTranscription, repostOfId: repostOfId, location: location, mentions: mentions)
    }

    /// Défaut : un conformeur qui n'implémente que la signature SANS
    /// `allowSoundExtraction`/`mediaAlt` (mocks existants) reste valide — les
    /// deux champs sont simplement ignorés tant que le type ne surcharge pas
    /// cette méthode. `PostService` la surcharge réellement plus bas.
    func create(content: String?, type: String, visibility: String, moodEmoji: String?, mediaIds: [String]?, audioUrl: String?, audioDuration: Int?, originalLanguage: String?, mobileTranscription: MobileTranscriptionPayload?, repostOfId: String?, location: SharedPlace?, mentions: [PostMentionInput]?, allowSoundExtraction: Bool?, mediaAlt: [String: String]?) async throws -> APIPost {
        try await create(content: content, type: type, visibility: visibility, moodEmoji: moodEmoji, mediaIds: mediaIds, audioUrl: audioUrl, audioDuration: audioDuration, originalLanguage: originalLanguage, mobileTranscription: mobileTranscription, repostOfId: repostOfId, location: location, mentions: mentions)
    }

    /// Convenience texte-seul (attachements = nil). Préserve les appels existants
    /// depuis que `addComment` porte `attachmentIds` / `mobileTranscription` /
    /// `originalLanguage` (les protocoles Swift ne supportent pas les valeurs par défaut).
    func addComment(postId: String, content: String, parentId: String? = nil, effectFlags: Int? = nil) async throws -> APIPostComment {
        try await addComment(postId: postId, content: content, parentId: parentId, effectFlags: effectFlags,
                             attachmentIds: nil, mobileTranscription: nil, originalLanguage: nil)
    }

    /// Défaut : un conformeur qui n'implémente que la signature sans
    /// `location` (mocks existants) reste valide — la position est
    /// simplement ignorée tant que le type ne surcharge pas cette méthode.
    /// `PostService` la surcharge réellement plus bas.
    func addComment(postId: String, content: String, parentId: String?, effectFlags: Int?,
                    attachmentIds: [String]?, mobileTranscription: MobileTranscriptionPayload?,
                    originalLanguage: String?, location: SharedPlace?) async throws -> APIPostComment {
        try await addComment(postId: postId, content: content, parentId: parentId, effectFlags: effectFlags,
                             attachmentIds: attachmentIds, mobileTranscription: mobileTranscription,
                             originalLanguage: originalLanguage)
    }

    /// Default for the idempotent variant: drop the mutation id and fall
    /// through to the full `addComment`. `PostService` overrides this to send
    /// the `X-Client-Mutation-Id` header; mocks may override to record it.
    func addComment(
        postId: String,
        content: String,
        parentId: String?,
        effectFlags: Int?,
        clientMutationId: String?
    ) async throws -> APIPostComment {
        try await addComment(postId: postId, content: content, parentId: parentId, effectFlags: effectFlags,
                             attachmentIds: nil, mobileTranscription: nil, originalLanguage: nil)
    }

    /// Défaut : les conformeurs existants (mocks) restent valides — un mock qui
    /// n'observe pas l'édition n'a pas à l'implémenter, et un test qui
    /// l'exercerait sans surcharge échoue explicitement.
    func updateComment(postId: String, commentId: String, content: String?, effectFlags: Int?) async throws -> APIPostComment {
        throw NSError(domain: "PostServiceProviding", code: -1,
                      userInfo: [NSLocalizedDescriptionKey: "updateComment not implemented by this conformer"])
    }

    /// Défaut de la variante complète idempotente : ignore le cmid et retombe
    /// sur la variante complète — les mocks existants restent valides tant
    /// qu'ils n'ont pas besoin d'observer le cmid.
    func addComment(postId: String, content: String, parentId: String?, effectFlags: Int?,
                    attachmentIds: [String]?, mobileTranscription: MobileTranscriptionPayload?,
                    originalLanguage: String?, location: SharedPlace?, clientMutationId: String?) async throws -> APIPostComment {
        try await addComment(postId: postId, content: content, parentId: parentId, effectFlags: effectFlags,
                             attachmentIds: attachmentIds, mobileTranscription: mobileTranscription,
                             originalLanguage: originalLanguage, location: location)
    }
}

public final class PostService: PostServiceProviding, @unchecked Sendable {
    public static let shared = PostService()
    private let api: APIClientProviding

    init(api: APIClientProviding = APIClient.shared) {
        self.api = api
    }

    public func getFeed(cursor: String? = nil, limit: Int = 20) async throws -> PaginatedAPIResponse<[APIPost]> {
        try await api.paginatedRequest(endpoint: "/posts/feed", cursor: cursor, limit: limit)
    }

    public func getPostsByHashtag(tag: String, cursor: String? = nil, limit: Int = 20) async throws -> PaginatedAPIResponse<[APIPost]> {
        try await api.paginatedRequest(endpoint: "/posts/hashtag/\(tag)", cursor: cursor, limit: limit)
    }

    public func getTrendingHashtags(limit: Int = 20) async throws -> [APIHashtag] {
        try await api.request(endpoint: "/hashtags/trending?limit=\(limit)")
    }

    public func getReels(seedReelId: String? = nil, cursor: String? = nil, limit: Int = 20) async throws -> PaginatedAPIResponse<[APIPost]> {
        var queryItems = [URLQueryItem(name: "limit", value: "\(limit)")]
        if let cursor { queryItems.append(URLQueryItem(name: "cursor", value: cursor)) }
        if let seedReelId { queryItems.append(URLQueryItem(name: "seed", value: seedReelId)) }
        return try await api.request(endpoint: "/posts/feed/reels", queryItems: queryItems)
    }

    public func create(content: String? = nil, type: String = "POST", visibility: String = "PUBLIC", moodEmoji: String? = nil, mediaIds: [String]? = nil, audioUrl: String? = nil, audioDuration: Int? = nil, originalLanguage: String? = nil, mobileTranscription: MobileTranscriptionPayload? = nil, repostOfId: String? = nil) async throws -> APIPost {
        try await create(content: content, type: type, visibility: visibility, moodEmoji: moodEmoji, mediaIds: mediaIds, audioUrl: audioUrl, audioDuration: audioDuration, originalLanguage: originalLanguage, mobileTranscription: mobileTranscription, repostOfId: repostOfId, location: nil)
    }

    public func create(content: String?, type: String, visibility: String, moodEmoji: String?, mediaIds: [String]?, audioUrl: String?, audioDuration: Int?, originalLanguage: String?, mobileTranscription: MobileTranscriptionPayload?, repostOfId: String?, location: SharedPlace?) async throws -> APIPost {
        try await create(content: content, type: type, visibility: visibility, moodEmoji: moodEmoji, mediaIds: mediaIds, audioUrl: audioUrl, audioDuration: audioDuration, originalLanguage: originalLanguage, mobileTranscription: mobileTranscription, repostOfId: repostOfId, location: location, mentions: nil)
    }

    /// Seule surcharge qui envoie réellement `location` ET les références
    /// déclarées au gateway — même convention que l'`addComment` porteur de
    /// lieu plus bas.
    public func create(content: String?, type: String, visibility: String, moodEmoji: String?, mediaIds: [String]?, audioUrl: String?, audioDuration: Int?, originalLanguage: String?, mobileTranscription: MobileTranscriptionPayload?, repostOfId: String?, location: SharedPlace?, mentions: [PostMentionInput]?) async throws -> APIPost {
        try await create(content: content, type: type, visibility: visibility, moodEmoji: moodEmoji, mediaIds: mediaIds, audioUrl: audioUrl, audioDuration: audioDuration, originalLanguage: originalLanguage, mobileTranscription: mobileTranscription, repostOfId: repostOfId, location: location, mentions: mentions, allowSoundExtraction: nil, mediaAlt: nil)
    }

    /// Seule surcharge qui envoie réellement `allowSoundExtraction` ET
    /// `mediaAlt` au gateway — le composer vidéo (opt-in extraction de son) et
    /// l'inspecteur d'accessibilité (texte alternatif par média) passent par
    /// ici.
    public func create(content: String?, type: String, visibility: String, moodEmoji: String?, mediaIds: [String]?, audioUrl: String?, audioDuration: Int?, originalLanguage: String?, mobileTranscription: MobileTranscriptionPayload?, repostOfId: String?, location: SharedPlace?, mentions: [PostMentionInput]?, allowSoundExtraction: Bool?, mediaAlt: [String: String]?) async throws -> APIPost {
        let body = CreatePostRequest(content: content, type: type, visibility: visibility, moodEmoji: moodEmoji, mediaIds: mediaIds, audioUrl: audioUrl, audioDuration: audioDuration, originalLanguage: originalLanguage, mobileTranscription: mobileTranscription, repostOfId: repostOfId, location: location, allowSoundExtraction: allowSoundExtraction, mentions: mentions, mediaAlt: mediaAlt)
        let response: APIResponse<APIPost> = try await api.post(endpoint: "/posts", body: body)
        return response.data
    }

    /// Création porteuse d'une AUDIENCE NOMMÉE (`EXCEPT`/`ONLY`).
    ///
    /// `CreatePostRequest` portait déjà le champ ; aucune surcharge ne le
    /// remplissait. Un post ne pouvait donc naître qu'en PUBLIC, FRIENDS,
    /// COMMUNITY ou PRIVATE — les deux visibilités à liste étaient offertes
    /// au composer story et hors d'atteinte du composer post, sans que rien
    /// ne le dise. Le gateway, lui, les valide depuis toujours
    /// (`CreatePostSchema` rejette un EXCEPT/ONLY sans destinataire).
    public func create(content: String?, type: String, visibility: String, visibilityUserIds: [String]?, moodEmoji: String?, mediaIds: [String]?, audioUrl: String?, audioDuration: Int?, originalLanguage: String?, mobileTranscription: MobileTranscriptionPayload?, repostOfId: String?, location: SharedPlace?, mentions: [PostMentionInput]?) async throws -> APIPost {
        let body = CreatePostRequest(content: content, type: type, visibility: visibility, moodEmoji: moodEmoji, visibilityUserIds: visibilityUserIds, mediaIds: mediaIds, audioUrl: audioUrl, audioDuration: audioDuration, originalLanguage: originalLanguage, mobileTranscription: mobileTranscription, repostOfId: repostOfId, location: location, mentions: mentions)
        let response: APIResponse<APIPost> = try await api.post(endpoint: "/posts", body: body)
        return response.data
    }

    public func delete(postId: String) async throws {
        let _: APIResponse<[String: Bool]> = try await api.delete(endpoint: "/posts/\(postId)")
    }

    public func like(postId: String) async throws {
        let _: APIResponse<[String: String]> = try await api.request(endpoint: "/posts/\(postId)/like", method: "POST")
    }

    public func unlike(postId: String) async throws {
        let _: APIResponse<[String: Bool]> = try await api.delete(endpoint: "/posts/\(postId)/like")
    }

    public func bookmark(postId: String) async throws {
        let _: APIResponse<[String: String]> = try await api.request(endpoint: "/posts/\(postId)/bookmark", method: "POST")
    }

    public func addComment(postId: String, content: String, parentId: String?, effectFlags: Int?,
                           attachmentIds: [String]?, mobileTranscription: MobileTranscriptionPayload?,
                           originalLanguage: String?) async throws -> APIPostComment {
        try await addComment(postId: postId, content: content, parentId: parentId, effectFlags: effectFlags,
                             attachmentIds: attachmentIds, mobileTranscription: mobileTranscription,
                             originalLanguage: originalLanguage, location: nil)
    }

    /// Seule surcharge qui envoie réellement `location` au gateway — le
    /// commentaire d'un post ET la réponse/commentaire d'une story empruntent
    /// tous deux `POST /posts/:id/comments` (une story est un post de type
    /// STORY), donc ce chemin unique couvre les deux surfaces.
    public func addComment(postId: String, content: String, parentId: String?, effectFlags: Int?,
                           attachmentIds: [String]?, mobileTranscription: MobileTranscriptionPayload?,
                           originalLanguage: String?, location: SharedPlace?) async throws -> APIPostComment {
        try await addComment(postId: postId, content: content, parentId: parentId, effectFlags: effectFlags,
                             attachmentIds: attachmentIds, mobileTranscription: mobileTranscription,
                             originalLanguage: originalLanguage, location: location, clientMutationId: nil)
    }

    /// Surcharge porteuse du cmid : envoyé en header `X-Client-Mutation-Id`,
    /// le gateway dédoublonne les rejeux (MutationLog) et ré-émet le cmid dans
    /// l'écho `comment:added` pour la réconciliation optimiste de l'émetteur.
    public func addComment(postId: String, content: String, parentId: String?, effectFlags: Int?,
                           attachmentIds: [String]?, mobileTranscription: MobileTranscriptionPayload?,
                           originalLanguage: String?, location: SharedPlace?, clientMutationId: String?) async throws -> APIPostComment {
        let body = CreateCommentRequest(content: content, parentId: parentId, effectFlags: effectFlags,
                                        attachmentIds: attachmentIds, mobileTranscription: mobileTranscription,
                                        originalLanguage: originalLanguage, location: location)
        guard let clientMutationId, !clientMutationId.isEmpty else {
            let response: APIResponse<APIPostComment> = try await api.post(endpoint: "/posts/\(postId)/comments", body: body)
            return response.data
        }
        let response: APIResponse<APIPostComment> = try await api.requestWithHeaders(
            endpoint: "/posts/\(postId)/comments",
            method: "POST",
            body: try JSONEncoder().encode(body),
            queryItems: nil,
            headers: ["X-Client-Mutation-Id": clientMutationId]
        )
        return response.data
    }

    public func addComment(
        postId: String,
        content: String,
        parentId: String? = nil,
        effectFlags: Int? = nil,
        clientMutationId: String? = nil
    ) async throws -> APIPostComment {
        guard let clientMutationId, !clientMutationId.isEmpty else {
            return try await addComment(
                postId: postId,
                content: content,
                parentId: parentId,
                effectFlags: effectFlags,
                attachmentIds: nil,
                mobileTranscription: nil,
                originalLanguage: nil
            )
        }
        let body = CreateCommentRequest(content: content, parentId: parentId, effectFlags: effectFlags)
        let response: APIResponse<APIPostComment> = try await api.requestWithHeaders(
            endpoint: "/posts/\(postId)/comments",
            method: "POST",
            body: try JSONEncoder().encode(body),
            queryItems: nil,
            headers: ["X-Client-Mutation-Id": clientMutationId]
        )
        return response.data
    }

    public func updateComment(postId: String, commentId: String, content: String?, effectFlags: Int?) async throws -> APIPostComment {
        let body = UpdateCommentRequest(content: content, effectFlags: effectFlags)
        let response: APIResponse<APIPostComment> = try await api.patch(
            endpoint: "/posts/\(postId)/comments/\(commentId)", body: body
        )
        return response.data
    }

    /// Traduction d'un commentaire à la demande vers UNE langue (Prisme —
    /// « Exploration ») : fire-and-forget, le résultat arrive via l'événement
    /// socket `comment:translation-updated`. Miroir de `requestTranslation`
    /// (posts) ; `force` rejoue une langue déjà traduite.
    public func requestCommentTranslation(postId: String, commentId: String, targetLanguage: String, force: Bool = false) async throws {
        struct TranslateCommentRequest: Encodable {
            let targetLanguage: String
            let force: Bool?
        }
        // Payload `{ requested: Bool, targetLanguage: String }` — typé a
        // minima : le résultat utile arrive par le socket
        // comment:translation-updated, pas par cette réponse.
        struct TranslateCommentResponse: Decodable {
            let requested: Bool?
        }
        let body = TranslateCommentRequest(targetLanguage: targetLanguage, force: force ? true : nil)
        let _: APIResponse<TranslateCommentResponse> = try await api.post(
            endpoint: "/posts/\(postId)/comments/\(commentId)/translate", body: body
        )
    }

    public func likeComment(postId: String, commentId: String) async throws {
        let _: APIResponse<[String: String]> = try await api.request(
            endpoint: "/posts/\(postId)/comments/\(commentId)/like", method: "POST"
        )
    }

    public func repost(
        postId: String,
        targetType: PostType? = nil,
        content: String? = nil,
        isQuote: Bool = false,
        visibility: String? = nil
    ) async throws -> APIPost {
        let body = RepostRequest(
            content: content,
            isQuote: isQuote,
            targetType: targetType?.rawValue,
            visibility: visibility
        )
        let response: APIResponse<APIPost> = try await api.post(endpoint: "/posts/\(postId)/repost", body: body)
        return response.data
    }

    public func share(postId: String) async throws {
        let _: APIResponse<[String: String]> = try await api.request(endpoint: "/posts/\(postId)/share", method: "POST")
    }

    /// Records a share and (optionally) mints a TrackingLink. When
    /// `generateLink` is `true` the response carries an absolute
    /// `meeshy.me/l/<token>` URL the caller can hand to a system share
    /// sheet — the gateway owns the link creation, the client only
    /// surfaces the result. Counter-only callers can keep using
    /// `share(postId:)`.
    public func share(
        postId: String,
        platform: String? = nil,
        generateLink: Bool = false
    ) async throws -> PostShareResult {
        var body: [String: Any] = [:]
        if let platform { body["platform"] = platform }
        if generateLink { body["generateLink"] = true }
        let bodyData = try JSONSerialization.data(withJSONObject: body)
        let response: APIResponse<PostShareResult> = try await api.request(
            endpoint: "/posts/\(postId)/share",
            method: "POST",
            body: bodyData
        )
        return response.data
    }

    /// Publie une pièce jointe reçue en conversation. Le corps ne porte que ce
    /// que le serveur ne peut PAS déduire : l'identifiant du média, la
    /// destination quand l'utilisateur l'a choisie, le mot qu'il ajoute, et la
    /// provenance — que seul le client qui a ouvert la caméra connaît.
    public func publishAttachment(
        attachmentId: String,
        target: PublicationTarget? = nil,
        content: String? = nil,
        capturedInApp: Bool = false
    ) async throws -> APIPost {
        let body = PublishAttachmentRequest(
            attachmentId: attachmentId,
            target: target?.rawValue,
            content: content,
            // Omis quand faux : le serveur applique le même défaut, et une clé
            // absente vaut mieux qu'une affirmation sans contenu.
            capturedInApp: capturedInApp ? true : nil
        )
        let response: APIResponse<APIPost> = try await api.post(endpoint: "/posts/from-attachment", body: body)
        return response.data
    }

    public func getBookmarks(cursor: String? = nil, limit: Int = 20) async throws -> PaginatedAPIResponse<[APIPost]> {
        try await api.paginatedRequest(endpoint: "/posts/bookmarks", cursor: cursor, limit: limit)
    }

    public func removeBookmark(postId: String) async throws {
        let _: APIResponse<[String: Bool]> = try await api.delete(endpoint: "/posts/\(postId)/bookmark")
    }

    public func getPost(postId: String) async throws -> APIPost {
        let response: APIResponse<APIPost> = try await api.request(endpoint: "/posts/\(postId)")
        return response.data
    }

    public func getComments(postId: String, cursor: String? = nil, limit: Int = 20) async throws -> PaginatedAPIResponse<[APIPostComment]> {
        try await api.paginatedRequest(endpoint: "/posts/\(postId)/comments", cursor: cursor, limit: limit)
    }

    public func requestTranslation(postId: String, targetLanguage: String) async throws {
        let body = ["targetLanguage": targetLanguage]
        let bodyData = try JSONSerialization.data(withJSONObject: body)
        let _: APIResponse<[String: String]> = try await api.request(
            endpoint: "/posts/\(postId)/translate",
            method: "POST",
            body: bodyData
        )
    }

    public func pinPost(postId: String) async throws {
        let _: APIResponse<[String: Bool]> = try await api.request(endpoint: "/posts/\(postId)/pin", method: "POST")
    }

    public func unpinPost(postId: String) async throws {
        let _: APIResponse<[String: Bool]> = try await api.delete(endpoint: "/posts/\(postId)/pin")
    }

    public func unlikeComment(postId: String, commentId: String) async throws {
        let _: APIResponse<[String: Bool]> = try await api.delete(endpoint: "/posts/\(postId)/comments/\(commentId)/like")
    }

    public func deleteComment(postId: String, commentId: String) async throws {
        let _: APIResponse<[String: Bool]> = try await api.delete(endpoint: "/posts/\(postId)/comments/\(commentId)")
    }

    public func createStory(content: String?, storyEffects: StoryEffects?, visibility: String = "PUBLIC", visibilityUserIds: [String]? = nil, originalLanguage: String? = nil, mediaIds: [String]? = nil, repostOfId: String? = nil) async throws -> APIPost {
        try await createStory(content: content, storyEffects: storyEffects, visibility: visibility,
                              visibilityUserIds: visibilityUserIds, originalLanguage: originalLanguage,
                              mediaIds: mediaIds, repostOfId: repostOfId, mentions: nil)
    }

    public func createStory(content: String?, storyEffects: StoryEffects?, visibility: String, visibilityUserIds: [String]?, originalLanguage: String?, mediaIds: [String]?, repostOfId: String?, mentions: [PostMentionInput]?) async throws -> APIPost {
        try await createStory(content: content, storyEffects: storyEffects, visibility: visibility,
                              visibilityUserIds: visibilityUserIds, originalLanguage: originalLanguage,
                              mediaIds: mediaIds, repostOfId: repostOfId, mentions: mentions,
                              allowSoundExtraction: nil, mediaAlt: nil)
    }

    /// Seule surcharge qui envoie réellement `allowSoundExtraction` ET
    /// `mediaAlt` — même patron que `create(… allowSoundExtraction: mediaAlt:)`.
    ///
    /// Depuis V3-3 elle n'écrit plus le corps elle-même : publier une story,
    /// c'est publier un canevas de type `STORY`. Un second constructeur de
    /// corps aurait été le point de divergence exact que ce lot vient de
    /// fermer.
    public func createStory(content: String?, storyEffects: StoryEffects?, visibility: String, visibilityUserIds: [String]?, originalLanguage: String?, mediaIds: [String]?, repostOfId: String?, mentions: [PostMentionInput]?, allowSoundExtraction: Bool?, mediaAlt: [String: String]?) async throws -> APIPost {
        try await createCanvasPost(type: .story, content: content, storyEffects: storyEffects,
                                   visibility: visibility, visibilityUserIds: visibilityUserIds,
                                   originalLanguage: originalLanguage, mediaIds: mediaIds,
                                   repostOfId: repostOfId, mentions: mentions,
                                   allowSoundExtraction: allowSoundExtraction, mediaAlt: mediaAlt)
    }

    /// Le SEUL constructeur du corps de création par canevas, tous formats
    /// confondus — c'est ce qui garantit qu'un post composé emporte exactement
    /// ce qu'une story emporte, moins le type.
    public func createCanvasPost(type: PostType, content: String?, storyEffects: StoryEffects?, visibility: String, visibilityUserIds: [String]?, originalLanguage: String?, mediaIds: [String]?, repostOfId: String?, mentions: [PostMentionInput]?, allowSoundExtraction: Bool?, mediaAlt: [String: String]?) async throws -> APIPost {
        // Strip composer-local `file://` paths from mediaObjects before the
        // payload hits the wire — they only resolve in the author's sandbox
        // and break the canvas for every reader (cf. StoryEffects+Sanitization
        // and StoryMediaLayer.swift:132-134).
        let sanitizedEffects = storyEffects?.sanitizedForServerPublish()
        let body = CreateStoryRequest(type: type.rawValue, content: content, storyEffects: sanitizedEffects, visibility: visibility, visibilityUserIds: visibilityUserIds, originalLanguage: originalLanguage, mediaIds: mediaIds, repostOfId: repostOfId, mentions: mentions, allowSoundExtraction: allowSoundExtraction, mediaAlt: mediaAlt)
        let response: APIResponse<APIPost> = try await api.post(endpoint: "/posts", body: body)
        return response.data
    }

    public func createWithType(_ type: PostType, content: String, visibility: String = "PUBLIC",
                                moodEmoji: String? = nil, storyEffects: StoryEffects? = nil) async throws -> APIPost {
        switch type {
        case .story:
            return try await createStory(content: content, storyEffects: storyEffects, visibility: visibility)
        case .status:
            return try await create(content: content, type: "STATUS", visibility: visibility, moodEmoji: moodEmoji)
        case .post:
            return try await create(content: content, type: "POST", visibility: visibility)
        case .reel:
            // Règle produit 2026-08-02 : un REEL exige une composition
            // qualifiante (vidéo || audio || >= 2 images —
            // `ReelComposition.qualifiesAsReel`). Cette surface ne transporte
            // aucun média : la composition ne peut jamais qualifier, on publie
            // donc un POST. Les chemins avec médias passent par `create(...,
            // mediaIds:)` avec `ReelComposition.defaultType` côté appelant.
            return try await create(content: content, type: "POST", visibility: visibility)
        }
    }

    // MARK: - Update Post

    /// Forme courte — un chemin d'édition qui ne gère pas les références n'en
    /// déclare AUCUNE (`mentions: nil`) : le serveur préserve celles du post.
    public func update(postId: String, content: String? = nil, visibility: String? = nil, visibilityUserIds: [String]? = nil, moodEmoji: String? = nil, originalLanguage: String? = nil, type: String? = nil, removeMediaIds: [String]? = nil, storyEffects: StoryEffects? = nil, mediaIds: [String]? = nil, location: PostLocationUpdate? = nil) async throws -> APIPost {
        try await update(postId: postId, content: content, visibility: visibility, visibilityUserIds: visibilityUserIds,
                         moodEmoji: moodEmoji, originalLanguage: originalLanguage, type: type,
                         removeMediaIds: removeMediaIds, storyEffects: storyEffects, mediaIds: mediaIds,
                         location: location, mentions: nil)
    }

    /// Forme complète, SANS valeur par défaut — même patron que
    /// `create(… mentions:)` : deux surcharges toutes deux « à défauts »
    /// rendraient tout appel court ambigu.
    public func update(postId: String, content: String?, visibility: String?, visibilityUserIds: [String]?, moodEmoji: String?, originalLanguage: String?, type: String?, removeMediaIds: [String]?, storyEffects: StoryEffects?, mediaIds: [String]?, location: PostLocationUpdate?, mentions: [PostMentionInput]?) async throws -> APIPost {
        try await update(postId: postId, content: content, visibility: visibility, visibilityUserIds: visibilityUserIds,
                         moodEmoji: moodEmoji, originalLanguage: originalLanguage, type: type,
                         removeMediaIds: removeMediaIds, storyEffects: storyEffects, mediaIds: mediaIds,
                         location: location, mentions: mentions, allowSoundExtraction: nil, mediaAlt: nil)
    }

    /// Seule surcharge qui envoie réellement `allowSoundExtraction` ET
    /// `mediaAlt` — même patron que `create(… allowSoundExtraction: mediaAlt:)`
    /// ci-dessus.
    public func update(postId: String, content: String?, visibility: String?, visibilityUserIds: [String]?, moodEmoji: String?, originalLanguage: String?, type: String?, removeMediaIds: [String]?, storyEffects: StoryEffects?, mediaIds: [String]?, location: PostLocationUpdate?, mentions: [PostMentionInput]?, allowSoundExtraction: Bool?, mediaAlt: [String: String]?) async throws -> APIPost {
        // `visibilityUserIds` était déclaré dans `UpdatePostRequest` mais JAMAIS
        // renseigné ici : il partait toujours à `nil`, et le `refine` Zod du
        // gateway rejetait donc systématiquement EXCEPT/ONLY.
        let body = UpdatePostRequest(content: content, visibility: visibility, visibilityUserIds: visibilityUserIds, moodEmoji: moodEmoji, originalLanguage: originalLanguage, type: type, removeMediaIds: removeMediaIds, storyEffects: storyEffects, mediaIds: mediaIds, location: location, mentions: mentions, allowSoundExtraction: allowSoundExtraction, mediaAlt: mediaAlt)
        let response: APIResponse<APIPost> = try await api.put(endpoint: "/posts/\(postId)", body: body)
        return response.data
    }

    // MARK: - View Tracking

    public func viewPost(postId: String, duration: Int? = nil) async throws {
        if let duration {
            let body = ["duration": duration]
            let bodyData = try JSONSerialization.data(withJSONObject: body)
            let _: APIResponse<[String: Bool]> = try await api.request(
                endpoint: "/posts/\(postId)/view",
                method: "POST",
                body: bodyData
            )
        } else {
            let _: APIResponse<[String: Bool]> = try await api.request(
                endpoint: "/posts/\(postId)/view",
                method: "POST"
            )
        }
    }

    public func getPostViews(postId: String, limit: Int = 50, offset: Int = 0) async throws -> PostViewersResponse {
        let response: APIResponse<PostViewersResponse> = try await api.request(
            endpoint: "/posts/\(postId)/views",
            queryItems: [
                URLQueryItem(name: "limit", value: "\(limit)"),
                URLQueryItem(name: "offset", value: "\(offset)")
            ]
        )
        return response.data
    }

    // MARK: - Feed Variants

    public func getUserPosts(userId: String, cursor: String? = nil, limit: Int = 20) async throws -> PaginatedAPIResponse<[APIPost]> {
        try await api.paginatedRequest(endpoint: "/posts/user/\(userId)", cursor: cursor, limit: limit)
    }

    public func getCommunityPosts(communityId: String, cursor: String? = nil, limit: Int = 20) async throws -> PaginatedAPIResponse<[APIPost]> {
        try await api.paginatedRequest(endpoint: "/posts/community/\(communityId)", cursor: cursor, limit: limit)
    }

    // MARK: - Comment Replies

    public func getCommentReplies(postId: String, commentId: String, cursor: String? = nil, limit: Int = 20) async throws -> PaginatedAPIResponse<[APIPostComment]> {
        try await api.paginatedRequest(endpoint: "/posts/\(postId)/comments/\(commentId)/replies", cursor: cursor, limit: limit)
    }

    // MARK: - Impression Tracking

    public func recordImpressions(postIds: [String], source: String = "feed") async throws {
        guard !postIds.isEmpty else { return }
        struct BatchBody: Encodable { let postIds: [String]; let source: String }
        let _: APIResponse<[String: Int]> = try await api.post(
            endpoint: "/posts/impressions/batch",
            body: BatchBody(postIds: postIds, source: source)
        )
    }

    /// Records a single impression for one post. Unlike `recordImpressions`
    /// (feed batch, deduped client-side per session), this is NOT deduped —
    /// every Detail open is one more impression (`source: "detail"`).
    public func recordImpression(postId: String, source: String = "detail") async throws {
        struct Body: Encodable { let source: String }
        let _: APIResponse<[String: Bool]> = try await api.post(
            endpoint: "/posts/\(postId)/impression",
            body: Body(source: source)
        )
    }

    public func recordEngagement(_ sessions: [EngagementSession]) async throws {
        guard !sessions.isEmpty else { return }
        struct BatchBody: Encodable { let sessions: [EngagementSession] }
        let _: APIResponse<[String: Int]> = try await api.post(
            endpoint: "/posts/engagement/batch",
            body: BatchBody(sessions: sessions)
        )
    }
}
