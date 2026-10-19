import Foundation

// MARK: - Feed Post Model
public struct FeedPost: Identifiable, Sendable {
    public let id: String
    public let author: String
    public let authorId: String
    public let authorUsername: String?
    public let authorColor: String
    public let authorAvatarURL: String?
    /// Le contour équipé de l'auteur (#10946), servi avec lui (#10945) ; `nil` sans contour.
    public var authorRing: ServedProfileDecorItem? = nil
    public let type: String?
    /// Mutable so optimistic edit flows (FeedViewModel.updatePost) can
    /// rewrite the body without reconstructing the whole struct. All
    /// other identity / authorship fields stay immutable.
    public var content: String
    public let timestamp: Date
    public var likes: Int
    public var isLiked: Bool = false
    /// Whether the current user has bookmarked this post. Server-enriched
    /// via `PostFeedService.getFeed` — drives the filled amber bookmark
    /// icon on first render without needing the cache-hydrate fallback.
    public var isBookmarkedByMe: Bool = false
    /// Whether the current user has reposted this post (any of their posts
    /// has `repostOfId == this.id`). Drives the filled green repost icon.
    public var isRepostedByMe: Bool = false
    public var comments: [FeedComment] = []
    /// **Les commentaires mis en avant sous un post** — trois au plus, les plus
    /// aimés d'abord. Le classement vit ICI, pas dans la carte (#7010).
    ///
    /// La règle était écrite dans `FeedPostCard`, donc redérivée à chaque
    /// évaluation de son `body` et introuvable depuis toute autre surface qui
    /// voudrait le même aperçu. `comments` ne porte que la TRANCHE servie par
    /// la passerelle (`APIPost.comments`) plus d'éventuelles insertions
    /// optimistes — quelques éléments, jamais le fil entier.
    ///
    /// **Non STOCKÉ à dessein.** `comments` est `var` et reçoit ces insertions
    /// (`FeedViewModel`), qui laisseraient un champ dérivé PÉRIMÉ sans qu'aucun
    /// écran ne le dise — et un `didSet` ne se déclenche pas depuis l'init
    /// memberwise, donc un post construit avec ses commentaires n'en aurait
    /// AUCUN à montrer. Une donnée dérivée d'une source mutable se calcule.
    public var topComments: [FeedComment] {
        Array(comments.sorted { $0.likes > $1.likes }.prefix(3))
    }
    public var commentCount: Int = 0
    /// Server-issued repost count — total reposts of this post. Distinct from
    /// `isReposted` which (when present, currently absent server-side) would
    /// indicate whether the *current user* has reposted.
    public var repostCount: Int = 0
    /// Server-issued bookmark count.
    public var bookmarkCount: Int = 0
    /// Server-issued share count (every `POST /posts/:id/share` increments it).
    public var shareCount: Int = 0
    /// Server-issued unique-view count (`Post.viewCount`). Set via
    /// `APIPost.toFeedPost` and persisted through the Codable round-trip
    /// below so a cache-first render doesn't flash it back to 0.
    public var viewCount: Int = 0
    /// Server-issued post-open count (`Post.postOpenCount`) — TOTAL full-frame
    /// openings of this post: immersive reel player OR post Detail page (the
    /// concept is generic to any Post, not just reels). This is what the eye
    /// badge shows ("vues totales"). Derived server-side from PostEngagement
    /// sessions on the `reels`/`detail` surfaces. Persisted through the
    /// Codable round-trip below (see `viewCount` note).
    public var postOpenCount: Int = 0
    /// Server-issued impression count (`Post.impressionCount`) — total
    /// exposures, NEVER deduplicated: each feed appearance AND each Detail
    /// open counts. This is what the "Impressions" (chart) badge shows.
    /// Persisted through the Codable round-trip below (see `viewCount` note).
    public var impressionCount: Int = 0
    /// Part ANONYME de `viewCount` (#10483) — `nil` d'un serveur antérieur.
    public var anonymousViewCount: Int? = nil
    /// Vues UNIQUES (#10483) — une par compte et une par lecteur anonyme ;
    /// `viewCount` compte, lui, chaque ouverture. Servies, gardées, pas
    /// encore affichées. `nil` d'un serveur antérieur.
    public var uniqueViewCount: Int? = nil
    public var anonymousUniqueViewCount: Int? = nil
    /// Server-issued qualified-view count (`Post.qualifiedViewCount`) — total
    /// sessions reaching the 2.5s-OR-30% threshold. Persisted through the
    /// Codable round-trip below (see `viewCount` note).
    public var qualifiedViewCount: Int = 0
    /// Server-issued playback-completion count (`Post.playCount`). Persisted
    /// through the Codable round-trip below (see `viewCount` note).
    public var playCount: Int = 0
    public var repost: RepostContent? = nil
    public var repostAuthor: String? = nil
    public var isQuote: Bool = false
    public var media: [FeedMedia] = []
    public var originalLanguage: String?
    /// Audience du post et sa liste nommée (EXCEPT/ONLY) — champs augmentés
    /// serveur, posés par `APIPost.toFeedPost` / `PostRecord.toFeedPost`,
    /// jamais par l'init memberwise. Ils rendent l'audience ÉDITABLE : sans
    /// eux, la sheet d'édition ne saurait pas sur quoi rouvrir, et un post en
    /// ONLY repartirait sans ses destinataires.
    public var visibility: String?
    public var visibilityUserIds: [String]?
    public var translations: [String: PostTranslation]?
    public var translatedContent: String?
    /// `[rawURL: token]` outbound-link tracking map carried from
    /// `APIPost.trackedLinkMap`. Empty when the post has no tracked links.
    /// Set via `toFeedPost` and persisted through the Codable round-trip, so a
    /// cache-first render keeps its tracked links (#9075) —
    /// consumed by the post body renderer (`/l/<token>` rewrite) and the
    /// embedded-video façade destination. Backward-compatible by construction.
    public var trackedLinkMap: [String: String] = [:]
    /// Les points que ce post a rapportés au lecteur (`APIPost.viewerPoints`),
    /// `nil` quand le serveur ne l'a pas servi. Persisté par le cache : un
    /// rendu cache-first montre déjà la marque « · ✦+N » (#9571).
    public var viewerPoints: Int? = nil

    /// Story canvas payload (`StoryEffects`) when this post is a story. `nil`
    /// for normal posts. Mirrors `RepostContent.storyEffects`. Carried on the
    /// domain model (not just the API model) so the post-detail story canvas
    /// survives the `CacheCoordinator.feed` round-trip.
    public var storyEffects: StoryEffects? = nil
    /// Legacy voice-note audio URL for story/status posts. `nil` for normal posts.
    public var audioUrl: String? = nil
    /// Lieu attaché au post (picker → `SharedPlace`, persisté gateway-side en
    /// `metadata.location` et hissé en champ top-level). Porté sur le modèle
    /// domaine — comme `storyEffects` — pour survivre au round-trip
    /// `CacheCoordinator.feed` : sans lui la position était décodée
    /// (`APIPost.location`) puis PERDUE au passage domaine (constat user
    /// 2026-07-30, aucune carte sur les posts).
    public var location: SharedPlace? = nil
    /// Les personnes que ce post nomme, avec leur mode. Miroir de
    /// `APIPost.mentions` — `nil` tant que le réseau ne l'a pas fourni (post
    /// pas encore rafraîchi depuis un serveur qui ne le sert pas encore, OU
    /// projection GRDB du cache qui ne persiste pas encore ce champ). Les
    /// consommateurs (renderer, `ReferenceNoteRow`) traitent `nil` comme « pas
    /// d'avis » — jamais comme « personne » : `[]` dirait « le serveur s'est
    /// prononcé, personne ne matche », `nil` dit « ne rien changer ».
    public var mentions: [PostReference]? = nil

    /// `validUsernames` prêt pour `MessageTextRenderer.render` : `nil` quand
    /// `mentions` est `nil` (repli sur le comportement historique — tout
    /// `@handle` est linkifié), un `Set` — possiblement vide — sinon.
    public var validMentionUsernames: Set<String>? {
        mentions.map { Set($0.map { $0.username.lowercased() }) }
    }

    public var hasMedia: Bool { !media.isEmpty }
    public var mediaUrl: String? { media.first?.url }
    public var isTranslated: Bool { translatedContent != nil }
    public var displayContent: String { translatedContent ?? content }
    public var availableLanguages: [String] { Array(translations?.keys ?? [String: PostTranslation]().keys) }

    /// B2 / B4 (Prisme Linguistique) — recomputes `translatedContent` for
    /// the supplied preferred-language chain WITHOUT requiring the source
    /// `APIPost`. Used by ViewModels (Feed, PostDetail) when the user
    /// changes their preferred-content languages mid-session: the stored
    /// `translations` dict is enough to flip the rendered language, no
    /// re-fetch needed.
    ///
    /// Honours the Prisme rules: walk `preferredLanguages` IN ORDER and stop
    /// at the first rank that is served — either because the original is
    /// already written in that language, or because a translation exists for
    /// it. The original language competes for ITS rank in the chain; it is
    /// never a short-circuit tested ahead of the loop (Prisme rule 3,
    /// 2026-08-10) — with `preferredLanguages == ["en", "fr"]`, original
    /// `fr`, and an `en` translation available, the `en` translation wins
    /// because it occupies rank 1. Never fall back to an arbitrary
    /// translation if no preferred language matches.
    public func resolved(preferredLanguages: [String]) -> FeedPost {
        var copy = self
        // Les commentaires embarqués suivent le post : un changement de langue
        // les laissait dans l'ancienne.
        copy.comments = comments.map { $0.resolved(preferredLanguages: preferredLanguages) }
        guard translations?.isEmpty == false else { return copy }
        copy.translatedContent = servedTranslation(preferredLanguages: preferredLanguages)?.text
        return copy
    }

    /// La descente, UNE fois, pour les DEUX projections ci-dessous.
    ///
    /// `resolved(preferredLanguages:)` et `resolvedLanguageCode(preferredLanguages:)`
    /// portaient chacune sa copie de la boucle — même parcours, deux types de
    /// retour, et donc deux occasions de diverger sur une charge où elles
    /// doivent être d'accord par construction : le badge de langue de la carte
    /// de feed ANNONCE la langue du texte que le corps AFFICHE. Elles partagent
    /// désormais `PrismTranslationResolver`, et ne diffèrent plus que par ce
    /// qu'elles projettent de son résultat.
    ///
    /// Les deux copies rapprochaient aussi les codes par un `.lowercased()`
    /// BRUT, quand la SSOT canonise (casse repliée ET région strippée) : un
    /// lecteur dont un rang est `"en-US"` ne rencontrait jamais la clé `"en"`.
    private func servedTranslation(preferredLanguages: [String]) -> PrismTranslation? {
        guard let dict = translations, !dict.isEmpty else { return nil }
        return PrismTranslationResolver.resolve(
            originalLanguage: originalLanguage,
            candidates: dict.map { PrismCandidate(language: $0.key, value: $0.value.text) },
            preferredLanguages: preferredLanguages
        )
    }

    /// Companion to `resolved(preferredLanguages:)`: returns the language code
    /// that `displayContent` is currently showing, using the exact same
    /// deterministic Prisme algorithm — walk `preferredLanguages` IN ORDER,
    /// the first rank served wins (original at that rank, else a matching
    /// translation) — never `translations.keys.first` (dictionary iteration
    /// order is non-deterministic in Swift). Used by the feed card to know
    /// which language flag is "active" without re-deriving it unsafely.
    ///
    /// `originalLanguage == nil` does NOT short-circuit to `nil`: `resolved()`
    /// still matches `translations` against `preferredLanguages` in that case
    /// (the per-rank `origLang == lang` test simply never fires, falling
    /// through to the translation check at each rank). This mirrors that —
    /// `nil` only when there's truly no language to report (no original AND
    /// no preferred-language translation matches).
    public func resolvedLanguageCode(preferredLanguages: [String]) -> String? {
        let origLang = originalLanguage.map { MeeshyUser.normalizeLanguageForDedup($0) }
        guard let served = servedTranslation(preferredLanguages: preferredLanguages) else { return origLang }
        return MeeshyUser.normalizeLanguageForDedup(served.language)
    }

    public init(id: String = UUID().uuidString, author: String, authorId: String = "", authorUsername: String? = nil,
                authorAvatarURL: String? = nil,
                type: String? = nil, content: String, timestamp: Date = Date(), likes: Int = 0,
                comments: [FeedComment] = [], commentCount: Int? = nil, repost: RepostContent? = nil, repostAuthor: String? = nil,
                isQuote: Bool = false, media: [FeedMedia] = [], mediaUrl: String? = nil,
                originalLanguage: String? = nil, translations: [String: PostTranslation]? = nil, translatedContent: String? = nil) {
        self.id = id; self.author = author; self.authorId = authorId; self.authorUsername = authorUsername
        let stableId = authorId.isEmpty ? author : authorId
        self.authorColor = DynamicColorGenerator.colorForPost(authorId: stableId, type: type, originalLanguage: originalLanguage)
        self.authorAvatarURL = authorAvatarURL; self.type = type
        self.content = content; self.timestamp = timestamp; self.likes = likes
        self.comments = comments; self.commentCount = commentCount ?? comments.count
        self.repost = repost; self.repostAuthor = repostAuthor
        self.isQuote = isQuote
        if !media.isEmpty { self.media = media }
        else if mediaUrl != nil { self.media = [.image()] }
        self.originalLanguage = originalLanguage; self.translations = translations; self.translatedContent = translatedContent
    }
}

extension FeedPost: Codable {
    enum CodingKeys: String, CodingKey {
        case id, author, authorId, authorUsername, authorAvatarURL, type, content, timestamp, likes, isLiked
        case isBookmarkedByMe, isRepostedByMe
        case comments, commentCount, repostCount, bookmarkCount, shareCount
        case viewCount, postOpenCount, impressionCount, qualifiedViewCount, playCount
        case anonymousViewCount
        case uniqueViewCount, anonymousUniqueViewCount
        case repost, repostAuthor, isQuote, media
        case originalLanguage, translations, translatedContent
        case storyEffects, audioUrl, location, mentions
        case visibility, visibilityUserIds, trackedLinkMap, viewerPoints, authorRing
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        author = try c.decode(String.self, forKey: .author)
        authorId = try c.decode(String.self, forKey: .authorId)
        authorUsername = try c.decodeIfPresent(String.self, forKey: .authorUsername)
        authorAvatarURL = try c.decodeIfPresent(String.self, forKey: .authorAvatarURL)
        type = try c.decodeIfPresent(String.self, forKey: .type)
        content = try c.decode(String.self, forKey: .content)
        timestamp = try c.decode(Date.self, forKey: .timestamp)
        likes = try c.decode(Int.self, forKey: .likes)
        isLiked = try c.decode(Bool.self, forKey: .isLiked)
        // Engagement counters + "by me" flags are server-augmented (set via
        // `APIPost.toFeedPost`, never through the memberwise init) — a cached
        // page persisted before these fields existed simply lacks the keys.
        // `decodeIfPresent` + a falsy default keeps that page loadable instead
        // of throwing `keyNotFound` and dropping the whole cached feed.
        isBookmarkedByMe = try c.decodeIfPresent(Bool.self, forKey: .isBookmarkedByMe) ?? false
        isRepostedByMe = try c.decodeIfPresent(Bool.self, forKey: .isRepostedByMe) ?? false
        comments = try c.decode([FeedComment].self, forKey: .comments)
        commentCount = try c.decode(Int.self, forKey: .commentCount)
        repostCount = try c.decodeIfPresent(Int.self, forKey: .repostCount) ?? 0
        bookmarkCount = try c.decodeIfPresent(Int.self, forKey: .bookmarkCount) ?? 0
        shareCount = try c.decodeIfPresent(Int.self, forKey: .shareCount) ?? 0
        viewCount = try c.decodeIfPresent(Int.self, forKey: .viewCount) ?? 0
        postOpenCount = try c.decodeIfPresent(Int.self, forKey: .postOpenCount) ?? 0
        impressionCount = try c.decodeIfPresent(Int.self, forKey: .impressionCount) ?? 0
        anonymousViewCount = try c.decodeIfPresent(Int.self, forKey: .anonymousViewCount)
        uniqueViewCount = try c.decodeIfPresent(Int.self, forKey: .uniqueViewCount)
        anonymousUniqueViewCount = try c.decodeIfPresent(Int.self, forKey: .anonymousUniqueViewCount)
        qualifiedViewCount = try c.decodeIfPresent(Int.self, forKey: .qualifiedViewCount) ?? 0
        playCount = try c.decodeIfPresent(Int.self, forKey: .playCount) ?? 0
        repost = try c.decodeIfPresent(RepostContent.self, forKey: .repost)
        repostAuthor = try c.decodeIfPresent(String.self, forKey: .repostAuthor)
        isQuote = try c.decode(Bool.self, forKey: .isQuote)
        media = try c.decode([FeedMedia].self, forKey: .media)
        originalLanguage = try c.decodeIfPresent(String.self, forKey: .originalLanguage)
        translations = try c.decodeIfPresent([String: PostTranslation].self, forKey: .translations)
        translatedContent = try c.decodeIfPresent(String.self, forKey: .translatedContent)
        visibility = try c.decodeIfPresent(String.self, forKey: .visibility)
        visibilityUserIds = try c.decodeIfPresent([String].self, forKey: .visibilityUserIds)
        // Resilience: a single malformed `storyEffects` payload must NOT fail
        // the whole decode (RepostContent/FeedPost are decoded inside strict
        // arrays — one throwing entry would drop the entire feed page). Degrade
        // this entry to no effects (miroir de PostModels.swift:290-293).
        do {
            storyEffects = try c.decodeIfPresent(StoryEffects.self, forKey: .storyEffects)
        } catch {
            storyEffects = nil
        }
        audioUrl = try c.decodeIfPresent(String.self, forKey: .audioUrl)
        location = try c.decodeIfPresent(SharedPlace.self, forKey: .location)
        mentions = try c.decodeIfPresent([PostReference].self, forKey: .mentions)
        trackedLinkMap = try c.decodeIfPresent([String: String].self, forKey: .trackedLinkMap) ?? [:]
        viewerPoints = try? c.decodeIfPresent(Int.self, forKey: .viewerPoints)
        authorRing = try? c.decodeIfPresent(ServedProfileDecorItem.self, forKey: .authorRing)
        let stableId = authorId.isEmpty ? author : authorId
        authorColor = DynamicColorGenerator.colorForPost(authorId: stableId, type: type, originalLanguage: originalLanguage)
    }

    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(id, forKey: .id)
        try c.encode(author, forKey: .author)
        try c.encode(authorId, forKey: .authorId)
        try c.encodeIfPresent(authorUsername, forKey: .authorUsername)
        try c.encodeIfPresent(authorAvatarURL, forKey: .authorAvatarURL)
        try c.encodeIfPresent(type, forKey: .type)
        try c.encode(content, forKey: .content)
        try c.encode(timestamp, forKey: .timestamp)
        try c.encode(likes, forKey: .likes)
        try c.encode(isLiked, forKey: .isLiked)
        try c.encode(isBookmarkedByMe, forKey: .isBookmarkedByMe)
        try c.encode(isRepostedByMe, forKey: .isRepostedByMe)
        try c.encode(comments, forKey: .comments)
        try c.encode(commentCount, forKey: .commentCount)
        try c.encode(repostCount, forKey: .repostCount)
        try c.encode(bookmarkCount, forKey: .bookmarkCount)
        try c.encode(shareCount, forKey: .shareCount)
        try c.encode(viewCount, forKey: .viewCount)
        try c.encode(postOpenCount, forKey: .postOpenCount)
        try c.encode(impressionCount, forKey: .impressionCount)
        try c.encodeIfPresent(anonymousViewCount, forKey: .anonymousViewCount)
        try c.encodeIfPresent(uniqueViewCount, forKey: .uniqueViewCount)
        try c.encodeIfPresent(anonymousUniqueViewCount, forKey: .anonymousUniqueViewCount)
        try c.encode(qualifiedViewCount, forKey: .qualifiedViewCount)
        try c.encode(playCount, forKey: .playCount)
        try c.encodeIfPresent(repost, forKey: .repost)
        try c.encodeIfPresent(repostAuthor, forKey: .repostAuthor)
        try c.encode(isQuote, forKey: .isQuote)
        try c.encode(media, forKey: .media)
        try c.encodeIfPresent(originalLanguage, forKey: .originalLanguage)
        try c.encodeIfPresent(translations, forKey: .translations)
        try c.encodeIfPresent(translatedContent, forKey: .translatedContent)
        try c.encodeIfPresent(visibility, forKey: .visibility)
        try c.encodeIfPresent(visibilityUserIds, forKey: .visibilityUserIds)
        try c.encodeIfPresent(storyEffects, forKey: .storyEffects)
        try c.encodeIfPresent(audioUrl, forKey: .audioUrl)
        try c.encodeIfPresent(location, forKey: .location)
        try c.encodeIfPresent(mentions, forKey: .mentions)
        if !trackedLinkMap.isEmpty { try c.encode(trackedLinkMap, forKey: .trackedLinkMap) }
        try c.encodeIfPresent(viewerPoints, forKey: .viewerPoints)
        try c.encodeIfPresent(authorRing, forKey: .authorRing)
    }
}

extension FeedPost: CacheIdentifiable {}

extension FeedPost: Equatable {
    public static func == (lhs: FeedPost, rhs: FeedPost) -> Bool { lhs.id == rhs.id }
}

extension FeedPost: Hashable {
    public func hash(into hasher: inout Hasher) { hasher.combine(id) }
}

// MARK: - Reel Classification
public extension FeedPost {
    /// A *reel* is a post stored with the server-side `REEL` type — an immersive,
    /// full-screen vertical experience instead of a detail page. The type is the
    /// single source of truth: it is chosen at creation time (a media post
    /// defaults to `REEL`, the author may force `POST`), so rendering is a plain
    /// authoritative check, never re-derived from media here.
    var isReel: Bool {
        (type ?? "").uppercased() == "REEL"
    }

    /// True when the server marks this post as a story (`type == "STORY"`).
    /// Mirrors `isReel`; used by `PostDetailView` to render the inline canvas.
    var isStory: Bool { (type ?? "").uppercased() == "STORY" }

    /// **Comment ce post affiche ses médias (directive 2026-08-27).** Dérivé du
    /// TYPE via `PostMediaPresentation.default(for:)` — carousel pour un POST,
    /// diapositives horizontales pour un RÉEL. Le poste DÉFINIT ainsi son
    /// affichage ; aucun autre choix ni interface pour l'instant, un futur champ
    /// stocké pourra surcharger sans changer les appelants (les renderers lisent
    /// ce point unique).
    var mediaPresentation: PostMediaPresentation {
        PostMediaPresentation.default(for: PostType(rawValue: (type ?? "").uppercased()) ?? .post)
    }

    /// Media surfaced first when the reel opens full-screen: the first video,
    /// else the first audio, else the first image. `nil` when the post is not a
    /// reel or carries no playable/visual media.
    var primaryReelMedia: FeedMedia? {
        guard isReel else { return nil }
        if let video = media.first(where: { $0.type == .video }) { return video }
        if let audio = media.first(where: { $0.type == .audio }) { return audio }
        return media.first(where: { $0.type == .image })
    }

    /// Media to RENDER on a reel surface. A reel REPOST carries no media on the
    /// outer post — the content lives in the reposted reel — so fall back to the
    /// reposted reel's media. Without this, `ReelFeedCard` / the immersive viewer
    /// render the empty outer post and a republished reel shows blank.
    var reelDisplayMedia: [FeedMedia] {
        if media.isEmpty, let repost, !repost.media.isEmpty { return repost.media }
        return media
    }

    /// First playable/visual media for a reel surface (video > audio > image),
    /// resolved from `reelDisplayMedia` so reel reposts surface the original
    /// content instead of the empty outer post.
    var primaryReelDisplayMedia: FeedMedia? {
        let list = reelDisplayMedia
        if let video = list.first(where: { $0.type == .video }) { return video }
        if let audio = list.first(where: { $0.type == .audio }) { return audio }
        return list.first(where: { $0.type == .image })
    }

    /// Média à afficher en FOND d'une surface réel : la vidéo si le post en
    /// porte une, sinon la première image. `nil` quand aucun visuel n'existe —
    /// l'appelant rend alors son propre fond (dégradé audio, couleur d'accent).
    ///
    /// Distinct de `primaryReelDisplayMedia`, qui désigne le média JOUÉ et
    /// préfère l'audio à l'image. Les confondre ferait taire un réel audio
    /// portant une image de couverture : son `kind` basculerait sur
    /// `.imageOnly` et l'autoplay ne le prendrait plus.
    var reelBackgroundMedia: FeedMedia? {
        let list = reelDisplayMedia
        if let video = list.first(where: { $0.type == .video }) { return video }
        return list.first(where: { $0.type == .image })
    }

    /// Filters a feed page down to the reels, preserving order. Seeds the reel
    /// pager from the already-loaded feed.
    static func reels(from posts: [FeedPost]) -> [FeedPost] {
        posts.filter(\.isReel)
    }
}
