package me.meeshy.sdk.model

import kotlinx.serialization.Serializable
import me.meeshy.sdk.lang.LanguageResolver
import me.meeshy.sdk.lang.PrismCandidate
import me.meeshy.sdk.lang.PrismTranslationResolver
import me.meeshy.sdk.lang.ReaderPrism
import me.meeshy.sdk.lang.resolveLastMessagePreview

/** A post author — port of APIAuthor (PostModels.swift). */
@Serializable
data class ApiAuthor(
    val id: String,
    val username: String? = null,
    val displayName: String? = null,
    val avatar: String? = null,
    /** Le décor servi avec la personne (#10945) ; absent sans contour ou sur un ancien serveur. */
    @Serializable(with = TolerantPostAuthorDecorSerializer::class)
    val profileDecor: PostAuthorDecor? = null,
) {
    /** Le contour d'avatar équipé, ou `null`. */
    val avatarRing: PostServedRing? get() = profileDecor?.avatarRing
}

/** A media item on a post — port of APIPostMedia (PostModels.swift). */
@Serializable
data class ApiPostMedia(
    val id: String,
    val fileName: String? = null,
    val originalName: String? = null,
    val mimeType: String? = null,
    val fileSize: Int? = null,
    val fileUrl: String? = null,
    val width: Int? = null,
    val height: Int? = null,
    val thumbnailUrl: String? = null,
    val thumbHash: String? = null,
    val duration: Int? = null,
    val order: Int? = null,
    val caption: String? = null,
    val alt: String? = null,
    /**
     * Langue SOURCE de [caption] (`PostMedia.captionLanguage`, #6280) — DISTINCTE
     * de [translations] ci-dessous, qui traduit les PISTES audio/transcriptions,
     * jamais le texte de la légende. `null` tant que le pipeline de traduction de
     * légende n'a pas encore détecté de langue source.
     */
    val captionLanguage: String? = null,
    /**
     * Traductions de [caption] (`PostMedia.captionTranslations`, #6280) — même
     * forme que `ApiPost.translations`, DISTINCTE de [translations] ci-dessous
     * (déjà prise par les pistes audio traduites). Voir
     * `packages/shared/types/media-caption-translation.ts` (SSOT du contrat).
     */
    val captionTranslations: Map<String, ApiMediaCaptionTranslationEntry>? = null,
    val transcription: ApiAttachmentTranscription? = null,
    val translations: Map<String, ApiAttachmentTranslation>? = null,
    /** Langue du média (`PostMedia.language`) — pistes d'une même œuvre. */
    val language: String? = null,
    /** Identifiant du média dont celui-ci est une variante (`PostMedia.variantOf`). */
    val variantOf: String? = null,
)

/**
 * La descente du Prisme sur LA LÉGENDE de ce média (#6280) — projette
 * [me.meeshy.sdk.lang.resolveLastMessagePreview] (règle #3 du Prisme : la langue
 * d'origine concourt à SON rang, jamais comme court-circuit). `null` quand
 * [ApiPostMedia.caption] est absent ; sinon [ApiPostMedia.caption] TEL QUEL si
 * aucune traduction ne cible une langue préférée (règle #1 : jamais un premier
 * élément arbitraire de la carte). Mirror de [FeedMedia.resolvedCaption] côté
 * modèle REST plutôt qu'aplati.
 */
fun ApiPostMedia.resolvedCaption(preferredLanguages: List<String>): String? =
    resolveLastMessagePreview(
        preview = caption,
        translations = captionTranslations
            ?.mapNotNull { (lang, entry) -> entry.text.takeIf { it.isNotBlank() }?.let { lang to it } }
            ?.toMap(),
        originalLanguage = captionLanguage,
        preferredLanguages = preferredLanguages,
    )

/**
 * Une entrée de [ApiPostMedia.captionTranslations] (#6280) — même forme que
 * [ApiPostTranslationEntry], déclarée séparément parce qu'elle qualifie une
 * LÉGENDE de média, jamais `Post.content`. Port de iOS
 * `APIMediaCaptionTranslationEntry` (PostModels.swift).
 */
@Serializable
data class ApiMediaCaptionTranslationEntry(
    val text: String = "",
    val translationModel: String? = null,
    val confidenceScore: Double? = null,
    val createdAt: String? = null,
    val updatedAt: String? = null,
)

/** A post/comment translation entry — port of APIPostTranslationEntry (PostModels.swift). */
@Serializable
data class ApiPostTranslationEntry(
    val text: String = "",
    val translationModel: String? = null,
    val confidenceScore: Double? = null,
    val createdAt: String? = null,
)

/** The post a repost references — port of APIRepostOf (PostModels.swift). */
@Serializable
data class ApiRepostOf(
    val id: String,
    val type: String? = null,
    val content: String? = null,
    val originalLanguage: String? = null,
    val translations: Map<String, ApiPostTranslationEntry>? = null,
    @Serializable(with = StoryEffectsWireSerializer::class)
    val storyEffects: StoryEffects? = null,
    val audioUrl: String? = null,
    val moodEmoji: String? = null,
    val originalRepostOfId: String? = null,
    val author: ApiAuthor? = null,
    val media: List<ApiPostMedia>? = null,
    val createdAt: String? = null,
    val likeCount: Int? = null,
    val commentCount: Int? = null,
    val isQuote: Boolean? = null,
    /**
     * The reposted (source) post's shared place, hoisted by the gateway from
     * `metadata.location` — mirror of iOS `APIRepostOf.location` (PostModels.swift).
     * Rendered as a tappable sticker inside the quote embed.
     */
    val location: SharedPlace? = null,
    /** Les personnes que le post SOURCE nomme ; `null` = pas d'avis (différent de `[]`). */
    @Serializable(with = TolerantPostReferencesSerializer::class)
    val mentions: List<PostReference>? = null,
    @Serializable(with = TolerantPostServedRingSerializer::class)
    val authorRing: PostServedRing? = null,
)

/** A comment on a post — port of APIPostComment (PostModels.swift). */
@Serializable
data class ApiPostComment(
    val id: String,
    val content: String = "",
    val originalLanguage: String? = null,
    val parentId: String? = null,
    val translations: Map<String, ApiPostTranslationEntry>? = null,
    val likeCount: Int? = null,
    val replyCount: Int? = null,
    val effectFlags: Int? = null,
    val createdAt: String? = null,
    val author: ApiAuthor? = null,
    val currentUserReactions: List<String>? = null,
    /** Média attaché au commentaire (un seul, tableau par parité avec les posts). */
    val media: List<ApiPostMedia>? = null,
    /** Lieu partagé, hissé par la passerelle depuis `metadata.location`. */
    val location: SharedPlace? = null,
    /** L'ancre figée du média cité (#6578), hissée depuis `metadata.quotedPostMedia`. */
    @Serializable(with = TolerantQuotedRefSerializer::class)
    val quotedPostMedia: ApiQuotedPostMediaRef? = null,
    /** Le média cité, relu à chaque service ; absent quand il n'existe plus. */
    val quotedMedia: ApiPostMedia? = null,
    /** Liens suivis hissés en tête (écho socket) — le REST les range sous [metadata]. */
    @Serializable(with = TolerantTrackedLinksSerializer::class)
    val trackingLinks: List<TrackedLink>? = null,
    @Serializable(with = TolerantTrackingMetadataSerializer::class)
    val metadata: TrackingLinksMetadata? = null,
)

/** `[urlBrute: jeton]` d'un commentaire : la carte hissée d'abord, celle de `metadata` sinon. */
val ApiPostComment.trackedLinkMap: Map<String, String>
    get() = (trackingLinks?.takeIf { it.isNotEmpty() } ?: metadata?.trackingLinks).orEmpty().trackedLinkMap()

/** `[urlBrute: jeton]` d'un post. */
val ApiPost.trackedLinkMap: Map<String, String>
    get() = servedTrackingLinks.orEmpty().trackedLinkMap()

/** Le genre typé du post ; `null` pour un genre inconnu (la chaîne brute reste dans [ApiPost.type]). */
val ApiPost.postType: PostType? get() = postTypeFromWire(type)

/** Le contour d'avatar de l'auteur, hissé comme `FeedPost.authorRing`. */
val ApiPost.authorRing: PostServedRing? get() = author?.avatarRing

/** A post — port of APIPost (PostModels.swift). */
@Serializable
data class ApiPost(
    val id: String,
    val type: String? = null,
    val visibility: String? = null,
    val content: String? = null,
    val originalLanguage: String? = null,
    val createdAt: String? = null,
    val updatedAt: String? = null,
    val expiresAt: String? = null,
    val author: ApiAuthor? = null,
    val likeCount: Int? = null,
    val commentCount: Int? = null,
    val repostCount: Int? = null,
    val viewCount: Int? = null,
    val impressionCount: Int? = null,
    val bookmarkCount: Int? = null,
    val shareCount: Int? = null,
    val reactionSummary: Map<String, Int>? = null,
    val isPinned: Boolean? = null,
    val isEdited: Boolean? = null,
    val media: List<ApiPostMedia>? = null,
    val comments: List<ApiPostComment>? = null,
    val repostOf: ApiRepostOf? = null,
    val originalRepostOfId: String? = null,
    val isQuote: Boolean? = null,
    val moodEmoji: String? = null,
    val audioUrl: String? = null,
    val audioDuration: Int? = null,
    @Serializable(with = StoryEffectsWireSerializer::class)
    val storyEffects: StoryEffects? = null,
    val translations: Map<String, ApiPostTranslationEntry>? = null,
    val isLikedByMe: Boolean? = null,
    val isBookmarkedByMe: Boolean? = null,
    val isViewedByMe: Boolean? = null,
    val currentUserReactions: List<String>? = null,
    val mentionedUsers: List<MentionedUser>? = null,
    val viaUsername: String? = null,
    val location: SharedPlace? = null,
    /** Distance in meters from the viewer — only carried by `GET /social/posts?scope=nearby`. */
    val distanceMeters: Double? = null,
    val visibilityUserIds: List<String>? = null,
    val contentEditedAt: String? = null,
    /** Ouvertures du post (distinctes des impressions). */
    val postOpenCount: Int? = null,
    val qualifiedViewCount: Int? = null,
    val playCount: Int? = null,
    val anonymousViewCount: Int? = null,
    val anonymousImpressionCount: Int? = null,
    val uniqueViewCount: Int? = null,
    val anonymousUniqueViewCount: Int? = null,
    val isRepostedByMe: Boolean? = null,
    /** Personnes référencées (INLINE/PINNED/NOTE/SILENT), profil résolu au chargement. */
    @Serializable(with = TolerantPostReferencesSerializer::class)
    val mentions: List<PostReference>? = null,
    /** Droit d'ouvrir un contenu expiré parce qu'on y est référencé — déclaré par le serveur. */
    val referenceAccess: ReferenceAccess? = null,
    /** Liens suivis hissés en tête (socket) ; le REST les range sous `metadata.trackingLinks`, voir [servedTrackingLinks]. */
    @Serializable(with = TolerantTrackedLinksSerializer::class)
    val trackingLinks: List<TrackedLink>? = null,
    @Serializable(with = TolerantTrackingMetadataSerializer::class)
    val metadata: TrackingLinksMetadata? = null,
    /** Points que CE post a rapportés au lecteur (#9569) ; `null` = garde ce que tu sais, jamais zéro. */
    @Serializable(with = NonNegativeIntSerializer::class)
    val viewerPoints: Int? = null,
    /** Source de classement de cet élément dans la page qui l'a servi (#10501). */
    val rankingSource: String? = null,
)

/** Les liens suivis servis : la carte hissée si non vide, sinon celle de `metadata`. */
val ApiPost.servedTrackingLinks: List<TrackedLink>?
    get() = trackingLinks?.takeIf { it.isNotEmpty() } ?: metadata?.trackingLinks

/**
 * Prisme Linguistique resolution for posts. Post translations are a language-keyed map
 * (vs. the message list form); the descent is the single [PrismTranslationResolver] one,
 * fed by the strict [ReaderPrism]: ranks walked in order, the first served wins — by a
 * non-blank translation, or because the content is already written in that language
 * ([originalLanguage] competes at its own rank). Never an arbitrary entry.
 */
internal fun Map<String, ApiPostTranslationEntry>?.preferredEntry(
    prefs: LanguageResolver.ContentLanguagePreferences,
    originalLanguage: String?,
): ApiPostTranslationEntry? {
    val translations = this?.takeIf { it.isNotEmpty() } ?: return null
    return PrismTranslationResolver.resolve(
        originalLanguage = originalLanguage,
        candidates = translations.map { (language, entry) -> PrismCandidate(language = language, value = entry) },
        preferredLanguages = ReaderPrism.resolve(prefs),
        isServable = { it.text.isNotBlank() },
    )?.value
}

/**
 * Content to display under the Prisme Linguistique: the preferred translation,
 * or the original [content] when no translation targets a preferred language.
 */
fun ApiPost.displayContent(prefs: LanguageResolver.ContentLanguagePreferences): String =
    translations.preferredEntry(prefs, originalLanguage)?.text ?: content.orEmpty()

/** True when the displayed content is a translation rather than the original. */
fun ApiPost.isTranslated(prefs: LanguageResolver.ContentLanguagePreferences): Boolean =
    translations.preferredEntry(prefs, originalLanguage) != null

/**
 * Content to display for a reposted/quoted post under the Prisme Linguistique:
 * the preferred translation, or the original [ApiRepostOf.content] when no
 * translation targets a preferred language. Same law as [ApiPost.displayContent]
 * — the embedded post is prism-translated like any other post.
 */
fun ApiRepostOf.displayContent(prefs: LanguageResolver.ContentLanguagePreferences): String =
    translations.preferredEntry(prefs, originalLanguage)?.text ?: content.orEmpty()

/** True when the reposted post's displayed content is a translation, not the original. */
fun ApiRepostOf.isTranslated(prefs: LanguageResolver.ContentLanguagePreferences): Boolean =
    translations.preferredEntry(prefs, originalLanguage) != null

/**
 * Content to display for a comment under the Prisme Linguistique: the preferred
 * translation, or the original [ApiPostComment.content] when no translation targets
 * a preferred language. Same law as [ApiPost.displayContent] — a comment is
 * prism-translated like any other content.
 */
fun ApiPostComment.displayContent(prefs: LanguageResolver.ContentLanguagePreferences): String =
    translations.preferredEntry(prefs, originalLanguage)?.text ?: content

/** True when the comment's displayed content is a translation, not the original. */
fun ApiPostComment.isTranslated(prefs: LanguageResolver.ContentLanguagePreferences): Boolean =
    translations.preferredEntry(prefs, originalLanguage) != null

/** A viewer of a post — port of APIPostViewer (PostModels.swift). */
@Serializable
data class ApiPostViewer(
    val id: String,
    val userId: String = "",
    val viewedAt: String? = null,
    val duration: Int? = null,
    val user: ApiAuthor? = null,
)

@Serializable
data class PostViewersResponse(
    val items: List<ApiPostViewer> = emptyList(),
    val pagination: PostViewersPagination? = null,
)

@Serializable
data class PostViewersPagination(
    val total: Int = 0,
    val offset: Int = 0,
    val limit: Int = 0,
    val hasMore: Boolean = false,
)
