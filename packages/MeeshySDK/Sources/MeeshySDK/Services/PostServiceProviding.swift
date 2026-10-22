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
    /// Création complète — audience nommée, extraction de son, texte
    /// alternatif ET grain de découvrabilité géographique. Requirement
    /// SÉPARÉE, même patron que `create(… mentions:)` : les protocoles Swift
    /// ne portent pas de valeur par défaut, et tout double de test aurait
    /// cessé de conformer d'un coup.
    ///
    /// `discoverabilityPrecision` est le SECOND opt-in de position, distinct
    /// du badge gouverné par `location` : `nil` (le défaut partout ailleurs)
    /// laisse le contenu non trouvable. Aucun appelant ne doit poser une
    /// valeur que l'utilisateur n'a pas choisie.
    func create(content: String?, type: String, visibility: String, visibilityUserIds: [String]?, moodEmoji: String?, mediaIds: [String]?, audioUrl: String?, audioDuration: Int?, originalLanguage: String?, mobileTranscription: MobileTranscriptionPayload?, repostOfId: String?, location: SharedPlace?, mentions: [PostMentionInput]?, allowSoundExtraction: Bool?, mediaAlt: [String: String]?, mediaCaption: [String: String]?, discoverabilityPrecision: DiscoverabilityPrecision?) async throws -> APIPost
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
    func update(postId: String, content: String?, visibility: String?, visibilityUserIds: [String]?, moodEmoji: String?, originalLanguage: String?, type: String?, removeMediaIds: [String]?, storyEffects: StoryEffects?, mediaIds: [String]?, location: PostLocationUpdate?, mentions: [PostMentionInput]?, allowSoundExtraction: Bool?, mediaAlt: [String: String]?, mediaCaption: [String: String]?) async throws -> APIPost
    /// L'édition à DÉCLARATION — **on n'écrit que ce qu'on sait complet et
    /// qu'on a su rendre**. L'appelant dit ce que sa surface a PEINT
    /// (`known`) et ce qu'elle DÉTIENT (`draft`) ; le corps se construit à un
    /// seul endroit, `PostEditPayload.build`.
    ///
    /// Les surcharges positionnelles ci-dessus déclarent implicitement TOUT
    /// (`PostEditField.all`) : leurs `nil` valaient déjà « je n'en parle
    /// pas ». Elles restent le chemin des appelants qui n'ont rien à taire.
    ///
    /// Requirement SÉPARÉE avec défaut ci-dessous — même convention que le
    /// reste de ce protocole : un double de test qui ne la surcharge pas
    /// reste conforme, et continue d'observer le corps par ses paramètres.
    func update(postId: String, known: Set<PostEditField>, draft: PostEditDraft) async throws -> APIPost
    func delete(postId: String) async throws
    /// #11151 — le retrait de la publication d'un AUTRE porte son motif.
    func delete(postId: String, reason: String?) async throws
    /// #11535 — la modération rend PRIVÉE la publication d'un autre, avec son motif.
    func makePrivate(postId: String, authorId: String, reason: String?) async throws
    func like(postId: String) async throws
    func unlike(postId: String) async throws
    func bookmark(postId: String) async throws
    func getBookmarks(cursor: String?, limit: Int) async throws -> PaginatedAPIResponse<[APIPost]>
    func removeBookmark(postId: String) async throws
    func getPost(postId: String) async throws -> APIPost
    func getComments(postId: String, cursor: String?, limit: Int) async throws -> PaginatedAPIResponse<[APIPostComment]>
    func likeComment(postId: String, commentId: String) async throws
    func unlikeComment(postId: String, commentId: String) async throws
    func deleteComment(postId: String, commentId: String) async throws
    /// #11151 — le retrait du commentaire d'un AUTRE porte son motif.
    func deleteComment(postId: String, commentId: String, reason: String?) async throws
    /// Édition d'un commentaire par son auteur : contenu et/ou effets visuels
    /// (`effectFlags`, même bitfield que la création — lueur/pulse/…). Une
    /// requirement séparée avec défaut ci-dessous pour garder les mocks valides.
    /// `originalLanguage` déclare la langue du texte corrigé — `nil` laisse la
    /// passerelle la redétecter (#6598, #6600).
    func updateComment(postId: String, commentId: String, content: String?, effectFlags: Int?, originalLanguage: String?) async throws -> APIPostComment
    func repost(postId: String, targetType: PostType?, content: String?, isQuote: Bool, visibility: String?) async throws -> APIPost
    /// Variante IDEMPOTENTE — envoie `clientMutationId` en header
    /// `X-Client-Mutation-Id`, ce que le gateway attend depuis que
    /// `POST /posts/:id/repost` passe par `withMutationOutcome`
    /// (`replayCost: 'diverges'`, lot 7 tâche 7.1b).
    ///
    /// Elle est INDISPENSABLE au repost, plus qu'à un like : `repostPost`
    /// fabrique un `Post` NEUF à chaque appel, donc rien ne le rend
    /// naturellement idempotent — une ligne d'outbox rejouée, ou un envoi
    /// relancé après un délai d'expiration d'`URLSession`, en faisait deux.
    ///
    /// **Ce que ce jeton couvre EXACTEMENT : le REJEU d'un MÊME envoi.** Le
    /// gateway rapproche deux requêtes par leur `X-Client-Mutation-Id`, et par
    /// rien d'autre. Deux TAPS sont deux gestes, donc deux jetons, qu'aucun
    /// `MutationLog` ne peut rapprocher — et les rapprocher en dérivant le
    /// jeton du CONTENU coûterait un geste LÉGITIME : republier, supprimer,
    /// republier, où le gateway rend déjà 410 sur le rejeu d'un repost
    /// supprimé. Le double tap se retient donc EN AMONT, par le verrou « en
    /// vol » par CIBLE de l'écrivain applicatif (`RepostPublisher`, app iOS) —
    /// jamais par ce header, qui n'en a pas les moyens.
    ///
    /// Requirement SÉPARÉE, avec un défaut ci-dessous qui laisse tomber le
    /// jeton : les conformeurs existants (mocks) restent valides sans une
    /// ligne de changement. Patron d'`addComment(… clientMutationId:)`.
    func repost(postId: String, targetType: PostType?, content: String?, isQuote: Bool, visibility: String?, clientMutationId: String?) async throws -> APIPost
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
    func createStory(content: String?, storyEffects: StoryEffects?, visibility: String, visibilityUserIds: [String]?, originalLanguage: String?, mediaIds: [String]?, repostOfId: String?, mentions: [PostMentionInput]?, allowSoundExtraction: Bool?, mediaAlt: [String: String]?, mediaCaption: [String: String]?) async throws -> APIPost
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
    func createCanvasPost(type: PostType, content: String?, storyEffects: StoryEffects?, visibility: String, visibilityUserIds: [String]?, originalLanguage: String?, mediaIds: [String]?, repostOfId: String?, mentions: [PostMentionInput]?, allowSoundExtraction: Bool?, mediaAlt: [String: String]?, mediaCaption: [String: String]?) async throws -> APIPost
    /// La même publication, avec « AUSSI en réel » (#9476) : `alsoAsReel: true`
    /// sur une STORY fait partir la story ET son réel en un geste.
    func createCanvasPost(type: PostType, content: String?, storyEffects: StoryEffects?, visibility: String, visibilityUserIds: [String]?, originalLanguage: String?, mediaIds: [String]?, repostOfId: String?, mentions: [PostMentionInput]?, allowSoundExtraction: Bool?, mediaAlt: [String: String]?, mediaCaption: [String: String]?, alsoAsReel: Bool?) async throws -> APIPost
    /// La même publication sous une clé d'idempotence (#10321) : `X-Client-Mutation-Id`
    /// fait reconnaître un rejeu par la passerelle, qui rend la publication déjà écrite.
    func createCanvasPost(type: PostType, content: String?, storyEffects: StoryEffects?, visibility: String, visibilityUserIds: [String]?, originalLanguage: String?, mediaIds: [String]?, repostOfId: String?, mentions: [PostMentionInput]?, allowSoundExtraction: Bool?, mediaAlt: [String: String]?, mediaCaption: [String: String]?, alsoAsReel: Bool?, clientMutationId: String?) async throws -> APIPost
    func createWithType(_ type: PostType, content: String, visibility: String, moodEmoji: String?, storyEffects: StoryEffects?) async throws -> APIPost
    func requestTranslation(postId: String, targetLanguage: String) async throws
    /// `POST /posts/media/:mediaId/caption/translate` — traduction à la demande de
    /// la LÉGENDE d'un média (#6280) : un contenu distinct du texte du post, qui
    /// revient par `media:caption-translation-updated`.
    func requestMediaCaptionTranslation(mediaId: String, targetLanguage: String) async throws
    func pinPost(postId: String) async throws
    func unpinPost(postId: String) async throws
    func getPostViews(postId: String, limit: Int, offset: Int) async throws -> OffsetPaginatedAPIResponse<[APIPostViewer]>
    func getUserPosts(userId: String, cursor: String?, limit: Int) async throws -> PaginatedAPIResponse<[APIPost]>
    func getCommentReplies(postId: String, commentId: String, cursor: String?, limit: Int) async throws -> PaginatedAPIResponse<[APIPostComment]>
    func getCommunityPosts(communityId: String, cursor: String?, limit: Int) async throws -> PaginatedAPIResponse<[APIPost]>
    /// `POST /social/events` — la porte UNIQUE de la télémétrie de lecture
    /// (#10483), pour un compte comme pour un lecteur sans compte.
    ///
    /// Requirement SÉPARÉE avec défaut ci-dessous : un double de test qui ne la
    /// surcharge pas reste conforme, et ÉCHOUE plutôt que de prétendre avoir
    /// compté. Chaque événement porte son enveloppe (#10500) ; la forme sans
    /// enveloppe (`[SocialEvent]`) est une commodité qui l'appose à l'appel.
    func recordSocialEvents(_ events: [StampedSocialEvent], credential: SocialEventsCredential) async throws -> SocialEventsReceipt
    /// `POST /social/events` pour un lot v2 DÉJÀ encodé (`SocialEventsV2Wire
    /// .body`) — jamais mêlé à un comptage (#10500). Défaut ci-dessous.
    func recordSocialEventsV2(body: Data, credential: SocialEventsCredential) async throws -> SocialEventsV2Receipt
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

/// Accusé de `POST /posts/media/:mediaId/caption/translate` (#6280) :
/// `{ requested: true, targetLanguage }` — un booléen voisin d'une chaîne, que
/// `[String: String]` ne décode pas.
struct MediaCaptionTranslationRequestAck: Decodable, Sendable {
    let requested: Bool?
    let targetLanguage: String?
}
