package me.meeshy.app.feed

import androidx.compose.runtime.Immutable
import me.meeshy.sdk.lang.LanguageResolver
import me.meeshy.sdk.theme.authorAccentHex
import me.meeshy.sdk.theme.storyAccentHex
import me.meeshy.sdk.model.ApiPost
import me.meeshy.sdk.model.FeedMediaType
import me.meeshy.sdk.model.MosaicLayoutMode
import me.meeshy.sdk.model.PostMediaPresentation
import me.meeshy.sdk.model.PostType
import me.meeshy.sdk.model.SceneMotion
import me.meeshy.sdk.model.SceneShape
import me.meeshy.sdk.model.card.PostCommentCardPost
import me.meeshy.sdk.model.displayContent
import me.meeshy.sdk.model.isTranslated
import me.meeshy.sdk.model.resolvedLayout
import me.meeshy.sdk.model.resolvedCaption
import me.meeshy.sdk.lang.LanguageResolver.preferredContentLanguages
import me.meeshy.sdk.model.StoryItem
import me.meeshy.sdk.story.sceneItems
import me.meeshy.sdk.story.toStoryItem
import me.meeshy.ui.component.bubble.LanguageChip
import me.meeshy.ui.component.bubble.PostLanguageStrip

/** An image attachment ready for display in a feed card. */
@Immutable
data class FeedPostImage(
    val id: String,
    val url: String,
    val thumbnailUrl: String?,
    val width: Int?,
    val height: Int?,
    val thumbHash: String?,
    /**
     * The media's caption, Prisme-resolved to the viewer's preferred language
     * (#6280) — `null` when the media carries no caption at all. Distinct from
     * [FeedPostPresentation.content] (`Post.content`) and from any alt text:
     * three separate contents, never confused even at equal strings.
     */
    val caption: String? = null,
    /**
     * Author-authored accessibility description (`PostMedia.alt`, #6739), served
     * verbatim (no Prisme resolution — unlike [caption], it carries no
     * translation pipeline on the wire). `null`/blank means the author wrote
     * none; consumers fall back to a generic localized label in that case.
     */
    val alt: String? = null,
)

/**
 * Les scènes d'un post composé sur la scène (#13863 R7, iOS `PostSceneCard` / `PostSceneMosaic`) : elles se peignent à la place
 * de ses médias, dans la disposition que l'auteur a choisie, sur la couleur de l'auteur. [captions] : la légende propre de chaque
 * scène, rang pour rang ([PostSceneCaptions]) ; [offersSound] : une scène a quelque chose à faire entendre, que la fiche du post
 * laisse couper (#13893) ; [frames] : ce que la carte montre de chaque scène, rang pour rang ([PostSceneFrames], #14199) ;
 * [carrierText] : le texte du post servi par le Prisme, qui légende en plein écran une scène sans légende propre (#14200) ;
 * [moving] : chaque scène bouge-t-elle, rang pour rang ; [soundCredit] : le son que la fiche nomme (#14201).
 */
@Immutable
data class FeedPostScenes(
    val items: List<StoryItem>,
    val layout: MosaicLayoutMode,
    val accentHex: String?,
    val captions: List<String?> = emptyList(),
    val offersSound: Boolean = false,
    val frames: List<SceneCardFraming> = emptyList(),
    val carrierText: String? = null,
    val moving: List<Boolean> = emptyList(),
    val soundCredit: SceneSoundCredit = SceneSoundCredit.None,
) {
    /** Le rapport du carrousel : sa page la plus HAUTE, pour n'en rogner aucune ; le gabarit 9:16 sans cadrage connu. */
    val carouselAspect: Double get() = frames.mapNotNull(SceneCardFraming::pageAspect).minOrNull() ?: SceneShape.ASPECT
}

/**
 * A feed post projected for rendering: Prisme-resolved content, the viewer's own
 * like state (never inferred from the public count) and resolved media URLs.
 *
 * Pure data — built by [FeedPostBuilder] so the resolution is unit-testable and
 * the Compose layer stays dumb.
 */
@Immutable
data class FeedPostPresentation(
    val id: String,
    val authorId: String?,
    val authorUsername: String?,
    val authorName: String?,
    val authorAvatarUrl: String?,
    val createdAtIso: String?,
    val content: String,
    val isTranslated: Boolean,
    val languageStrip: List<LanguageChip>,
    val moodEmoji: String?,
    val images: List<FeedPostImage>,
    /** Tous les médias du post (image, vidéo, audio, document), plafonnés à `MAX_POST_MEDIA`. */
    val media: List<FeedMediaItem> = emptyList(),
    val likeCount: Int,
    val isLiked: Boolean,
    val bookmarkCount: Int,
    val isBookmarked: Boolean,
    val commentCount: Int,
    val repostCount: Int,
    val isPinned: Boolean,
    val isEdited: Boolean,
    val isReel: Boolean,
    val repostEmbed: RepostEmbedPresentation?,
    val viewCount: Int,
    val impressionCount: Int,
    /** True when the signed-in viewer authored this post — gates the author-only reach line. */
    val isAuthor: Boolean,
    /** The post's shared place, or null when none — mirror of iOS `post.location`. */
    val location: FeedLocationPresentation? = null,
    /** Distance in meters from the viewer — only present on the Nearby feed. */
    val distanceMeters: Double? = null,
    /** The author's layout (#6514), already resolved — the carousel when the post declares none. */
    val layout: MosaicLayoutMode = MosaicLayoutMode.FALLBACK,
    /** L'explorateur de langues du post (iOS `PostTranslationSheet`), `null` sans traduction. */
    val languageExplorer: PostLanguageExplorer? = null,
    /** Ce que le réel montre au repos (iOS `ReelFeedCard`) ; `null` pour tout autre post. */
    val reelCover: ReelCover? = null,
    /** Rapport largeur / hauteur de la carte du réel (`ReelCoverResolver.cardAspect`). */
    val reelAspect: Float = ReelCoverResolver.cardAspect(null, null),
    /** Les scènes d'un post composé sur la scène, peintes à la place de [images] ; `null` pour tout autre post. */
    val scenes: FeedPostScenes? = null,
    /** Le post tel qu'« Imager » un de ses commentaires le met en tête (#13922) : son texte servi, son audience, ses médias. */
    val commentCardSupport: PostCommentCardPost? = null,
    /** Les premiers commentaires que la carte montre sous ses actions (#14314) ; `null` : aucun à montrer. */
    val commentsPreview: FeedCommentsPreviewState? = null,
) {
    /**
     * Le réel que ce réel republie, quand il n'a pas de média propre : la carte montre alors UNE couverture, celle du
     * réel source, signée de son auteur d'origine et ouvrant ce réel-là (iOS `ReelFeedCard.repostedReel`).
     */
    val republishedReel: RepostEmbedPresentation?
        get() = repostEmbed?.takeIf { isReel && media.isEmpty() && it.isReel && !it.isUnavailable }

    /** Le réel que la carte ouvre : le réel cité d'une republication, sinon ce réel. */
    val reelOpenId: String get() = republishedReel?.id ?: id

    /** Ce réel se montre en carte plein cadre, légende en surimpression (iOS `ReelFeedCard`). */
    val showsReelCard: Boolean get() = isReel && reelCover != null

    /** Le pseudo de l'auteur d'origine, pour l'attribution `↻ @pseudo` de l'en-tête ; `null` sans repost servi. */
    val repostAttribution: String?
        get() = repostEmbed?.takeUnless { it.isUnavailable }
            ?.let { it.authorUsername ?: it.authorName }

    /** Carrousel pour un post, diaporama horizontal pour un reel (iOS `PostMediaPresentation.default`). */
    val mediaPresentation: PostMediaPresentation
        get() = PostMediaPresentation.defaultFor(if (isReel) PostType.REEL else PostType.POST)
}

object FeedPostBuilder {

    /**
     * Project [post] for rendering.
     *
     * @param activeLanguageCode the language the viewer switched the post to via a
     *   flag tap (null → the default Prisme resolution). When it names a language
     *   the post carries — a translation or the original — the displayed content and
     *   the strip's active chip both follow it; an unknown/content-less override is
     *   ignored and the default resolution stands. Mirrors the chat bubble's
     *   single-primary language switch, keyed per post rather than per message.
     */
    fun build(
        post: ApiPost,
        preferences: LanguageResolver.ContentLanguagePreferences,
        mediaBaseUrl: String?,
        activeLanguageCode: String? = null,
        currentUserId: String? = null,
    ): FeedPostPresentation {
        val preferredLanguages = preferredContentLanguages(preferences)
        val media = FeedMediaMapper.map(post.media, preferredLanguages, mediaBaseUrl)
        val images = media
            .filter { it.type == FeedMediaType.IMAGE }
            .map { item ->
                FeedPostImage(
                    id = item.id,
                    url = item.url,
                    thumbnailUrl = item.thumbnailUrl,
                    width = item.width,
                    height = item.height,
                    thumbHash = item.thumbHash,
                    caption = item.caption,
                    alt = item.alt,
                )
            }
        val isReel = post.type.equals("reel", ignoreCase = true)
        // iOS `FeedPost.reelDisplayMedia` : un réel republié sans média propre montre le réel qu'il republie.
        val reelMedia = if (isReel) media.ifEmpty { FeedMediaMapper.map(post.repostOf?.media, preferredLanguages, mediaBaseUrl) } else media
        val originalCode = post.originalLanguage.normalizedCode()
        val isTranslated = post.isTranslated(preferences)
        val activeCode = resolveActiveCode(post, preferences, activeLanguageCode)
        val activeIsOriginal = activeCode == null || activeCode == originalCode
        val content = resolveContent(post, preferences, activeCode, activeIsOriginal)
        return FeedPostPresentation(
            id = post.id,
            authorId = post.author?.id,
            authorUsername = post.author?.username,
            authorName = (post.author?.displayName ?: post.author?.username)
                ?.takeIf { it.isNotBlank() },
            authorAvatarUrl = post.author?.avatar
                ?.let { resolveFeedMediaUrl(it, mediaBaseUrl) },
            createdAtIso = post.createdAt,
            content = content,
            isTranslated = isTranslated,
            languageStrip = PostLanguageStrip.build(
                originalLanguage = post.originalLanguage,
                translations = post.translations,
                preferences = preferences,
                showingOriginal = isTranslated && activeIsOriginal,
                activeCodeOverride = activeCode,
                includeTranslatable = true,
            ),
            moodEmoji = post.moodEmoji?.takeIf { it.isNotBlank() },
            images = images,
            media = media,
            likeCount = post.likeCount ?: 0,
            isLiked = post.isLikedByMe == true,
            bookmarkCount = post.bookmarkCount ?: 0,
            isBookmarked = post.isBookmarkedByMe == true,
            commentCount = post.commentCount ?: 0,
            repostCount = post.repostCount ?: 0,
            isPinned = post.isPinned == true,
            isEdited = post.isEdited == true,
            isReel = isReel,
            repostEmbed = RepostEmbedBuilder.forPost(post, preferences, mediaBaseUrl),
            viewCount = post.viewCount ?: 0,
            impressionCount = post.impressionCount ?: 0,
            isAuthor = currentUserId != null && post.author?.id == currentUserId,
            location = FeedPostLocationBuilder.build(post.location),
            distanceMeters = post.distanceMeters,
            layout = post.storyEffects.resolvedLayout,
            languageExplorer = PostLanguageExplorerBuilder.build(post, preferences, activeCode),
            reelCover = if (isReel) ReelCoverResolver.resolve(reelMedia, post.authorAccentHex()) { post.toStoryItem() } else null,
            reelAspect = reelMedia.reelVisual().let { ReelCoverResolver.cardAspect(it?.width, it?.height) },
            scenes = if (isReel) null else post.sceneItems()?.let { read ->
                val documents = PostSceneFrames.documents(post.storyEffects, read.items)
                FeedPostScenes(
                    items = read.items,
                    layout = read.layout,
                    accentHex = post.author.storyAccentHex(),
                    captions = PostSceneCaptions.of(read.items, media),
                    offersSound = PostSceneSound.offers(read.items),
                    frames = PostSceneFrames.of(documents),
                    carrierText = content.trim().takeIf(String::isNotEmpty),
                    moving = documents.map(SceneMotion::isCinematic),
                    soundCredit = PostSceneSound.credit(read.items, post.storyEffects?.canvas?.sound),
                )
            },
            commentCardSupport = CommentCardReading.support(post, content),
            commentsPreview = FeedCommentsPreviewBuilder.build(post.comments, post.commentCount ?: 0, preferences, mediaBaseUrl),
        )
    }

    /**
     * The effective displayed language for [post]: the viewer's [override] when it
     * names a language the post actually carries (a translation or the original),
     * else the default Prisme resolution — the preferred translation, or the
     * original when none is preferred. Shared by [build] and the ViewModel's
     * flag-tap handler so the switch decision has one source of truth.
     */
    fun resolveActiveCode(
        post: ApiPost,
        preferences: LanguageResolver.ContentLanguagePreferences,
        override: String?,
    ): String? {
        val originalCode = post.originalLanguage.normalizedCode()
        val preferredCode = LanguageResolver
            .preferredTranslation(post.translations.toTranslationRows(), preferences, post.originalLanguage)
            ?.targetLanguage?.normalizedCode()
        val requested = override.normalizedCode()?.takeIf { it.hasContentIn(post, originalCode) }
        return requested ?: (preferredCode ?: originalCode)
    }

    private fun resolveContent(
        post: ApiPost,
        preferences: LanguageResolver.ContentLanguagePreferences,
        activeCode: String?,
        activeIsOriginal: Boolean,
    ): String = when {
        activeIsOriginal -> post.content.orEmpty()
        else -> post.translations
            ?.entries
            ?.firstOrNull { it.key.normalizedCode() == activeCode && it.value.text.isNotBlank() }
            ?.value?.text
            ?: post.displayContent(preferences)
    }

    private fun String.hasContentIn(post: ApiPost, originalCode: String?): Boolean =
        this == originalCode || post.translations?.any {
            it.key.normalizedCode() == this && it.value.text.isNotBlank()
        } == true

    private fun String?.normalizedCode(): String? =
        this?.trim()?.lowercase()?.takeIf { it.isNotEmpty() }
}
