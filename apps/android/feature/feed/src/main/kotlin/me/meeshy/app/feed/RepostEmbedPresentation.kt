package me.meeshy.app.feed

import me.meeshy.sdk.lang.ReaderPrism
import androidx.compose.runtime.Immutable
import me.meeshy.sdk.lang.LanguageResolver
import me.meeshy.sdk.model.ApiPost
import me.meeshy.sdk.model.ApiRepostOf
import me.meeshy.sdk.model.FeedMediaType
import me.meeshy.sdk.model.FeedReelKind
import me.meeshy.sdk.model.RepostEmbedLanguages
import me.meeshy.sdk.model.RepostLanguageFlag
import me.meeshy.sdk.model.servedLanguage
import me.meeshy.sdk.model.StoryItem
import me.meeshy.sdk.model.displayContent
import me.meeshy.sdk.model.isoToEpochMillisOrNull
import me.meeshy.sdk.model.isTranslated
import me.meeshy.sdk.story.toStoryItem
import me.meeshy.sdk.theme.DynamicColorGenerator

/**
 * A reposted/quoted post projected for the embedded quote cell rendered inside a
 * feed card (and the post-detail screen). Pure data — built by [RepostEmbedBuilder]
 * so the Prisme resolution and media-preview logic stay unit-testable and the
 * Compose layer stays dumb.
 *
 * The [id] is the ORIGINAL reposted post's id (the embed's tap target), never the
 * outer reposter card's id — mirrors iOS `FeedPostCard.repostTapTargetId`.
 */
@Immutable
data class RepostEmbedPresentation(
    val id: String,
    val authorName: String?,
    val authorAvatarUrl: String?,
    val createdAtIso: String?,
    val content: String,
    val isTranslated: Boolean,
    val previewImageUrl: String?,
    val extraMediaCount: Int,
    val likeCount: Int,
    /**
     * The reposted post's mood emoji, or `null` when absent/blank (mirror of iOS
     * `FeedPostCard.swift`'s `repost.moodEmoji`). A reposted STATUS carries an empty
     * body, so the cell prefixes this to the content — without it a republished mood
     * would render an empty embed.
     */
    val moodEmoji: String?,
    val isQuote: Boolean,
    val isStory: Boolean,
    val isReel: Boolean,
    /**
     * The reposted post's shared place, or `null` when absent — mirror of iOS
     * `FeedPostCard.swift:989`, where the source post's `SharedPlace` renders as a
     * tappable sticker inside the quote block. Projected through the same
     * [FeedPostLocationBuilder] the outer feed card uses, so the label resolution
     * has one source of truth.
     */
    val location: FeedLocationPresentation? = null,
    /** Le compte de l'auteur cité : sa présence servie se lit sur la carte unique. */
    val authorId: String? = null,
    /** Le pseudo de l'auteur cité : l'attribution de l'en-tête (`↻ @pseudo`, iOS `FeedPostCard+Header`). */
    val authorUsername: String? = null,
    /**
     * La story citée, quand le repost en est une : la scène se lit alors par le MÊME lecteur que les stories
     * (iOS `StoryRepostEmbedCell`), pas par un bloc de citation vide. `null` pour tout autre repost.
     */
    val storyItem: StoryItem? = null,
    /**
     * L'original n'est plus servi (supprimé, retiré, hors de portée) : la carte dessine cet état au lieu
     * d'un bloc vide, et n'ouvre rien.
     */
    val isUnavailable: Boolean = false,
    /** Ce que le réel cité montre au repos (iOS `ReelRepostEmbedCell.poster`) ; `null` pour tout autre repost. */
    val reelCover: ReelCover? = null,
    /** Les médias du post cité, dans l'ordre serveur : le détail y lit l'audio, la vidéo et les documents de l'auteur CITÉ. */
    val media: List<FeedMediaItem> = emptyList(),
    /** Langue d'origine du post cité : repli du Prisme audio de ses médias (iOS `DetailMediaAuthor.originalLanguage`). */
    val originalLanguage: String? = null,
    /** La langue dans laquelle le texte du post CITÉ est lu (Prisme) : son propre état, jamais celui du post extérieur. */
    val displayedLanguage: String? = null,
    /** Les autres langues du post cité (drapeaux de l'embed) ; la puce active se calcule dans la carte, d'après le panneau ouvert. */
    val languageFlags: List<RepostLanguageFlag> = emptyList(),
    /** Le texte du post cité par langue : la matière du panneau secondaire de l'embed. */
    val languageTexts: Map<String, String> = emptyMap(),
    /** Le vocal du post cité (iOS `RepostContent.audioUrl`), `null` sans. */
    val audioUrl: String? = null,
    /** Les pseudos que le post cité nomme : `null` = pas d'avis (tout `@pseudo` reste cliquable), `[]` = personne. */
    val mentionUsernames: Set<String>? = null,
    /** L'échéance du post cité (statut, story éphémère) ; `null` = ne s'éteint pas. */
    val expiresAtIso: String? = null,
    /** L'original du post cité quand lui-même est une republication (iOS `originalRepostOfId`). */
    val originalRepostOfId: String? = null,
)

/** Ce que la bande d'un réel republié montre et jouera (iOS `ReelRepostEmbedCell.reelKind`) : la vidéo, sinon l'audio, sinon l'image. */
internal fun RepostEmbedPresentation.reelStripKind(): FeedReelKind = when {
    media.any { it.type == FeedMediaType.VIDEO } -> FeedReelKind.VIDEO
    media.any { it.type == FeedMediaType.AUDIO } -> FeedReelKind.AUDIO
    else -> FeedReelKind.IMAGE_ONLY
}

/** La vidéo qui monte la surface de lecture muette ; `null` pour un réel audio ou sans média (fond teinté + note). */
internal fun RepostEmbedPresentation.reelStripVideo(): FeedMediaItem? = media.firstOrNull { it.type == FeedMediaType.VIDEO }

/**
 * L'identité d'élection d'un réel republié : l'id du post CONTENANT, jamais celui du réel cité (iOS `reelCellId`) — un réel
 * montré en natif ET en repost n'élit ainsi qu'UNE surface.
 */
internal object RepostEmbedAutoplayKey {
    fun of(containingPostId: String): String = containingPostId
}

object RepostEmbedBuilder {

    /**
     * L'incrustation d'un POST du fil : la citation de [ApiPost.repostOf], la scène de la story citée, ou l'état
     * « plus disponible » quand le post se déclare republication ([ApiPost.originalRepostOfId] / [ApiPost.isQuote])
     * mais que le serveur ne sert plus l'original. `null` pour un post qui n'en est pas un.
     */
    fun forPost(
        post: ApiPost,
        preferences: LanguageResolver.ContentLanguagePreferences,
        mediaBaseUrl: String?,
        nowEpochMillis: Long = System.currentTimeMillis(),
    ): RepostEmbedPresentation? {
        val quoted = build(post.repostOf, preferences, mediaBaseUrl, nowEpochMillis) ?: return unavailable(post)
        return if (quoted.isStory) quoted.copy(storyItem = post.toStoryItem()) else quoted
    }

    private fun authorLabel(repost: ApiRepostOf): String? =
        (repost.author?.displayName ?: repost.author?.username)?.takeIf { it.isNotBlank() }

    private fun unavailable(post: ApiPost): RepostEmbedPresentation? {
        val declaresRepost = !post.originalRepostOfId.isNullOrBlank() || post.isQuote == true
        if (!declaresRepost) return null
        return RepostEmbedPresentation(
            id = post.originalRepostOfId.orEmpty(),
            authorName = null,
            authorAvatarUrl = null,
            createdAtIso = null,
            content = "",
            isTranslated = false,
            previewImageUrl = null,
            extraMediaCount = 0,
            likeCount = 0,
            moodEmoji = null,
            isQuote = post.isQuote == true,
            isStory = false,
            isReel = false,
            isUnavailable = true,
        )
    }

    /**
     * Project [repost] for the embedded quote cell, or `null` when the post is not
     * a repost. Content follows the Prisme Linguistique (preferred translation, or
     * the original when none is preferred — Rule 1, never an arbitrary translation).
     */
    fun build(
        repost: ApiRepostOf?,
        preferences: LanguageResolver.ContentLanguagePreferences,
        mediaBaseUrl: String?,
        nowEpochMillis: Long = System.currentTimeMillis(),
    ): RepostEmbedPresentation? {
        repost ?: return null
        val expired = !repost.type.equals("story", ignoreCase = true) &&
            repost.expiresAt?.let(::isoToEpochMillisOrNull)?.let { it <= nowEpochMillis } == true
        val mediaCount = repost.media?.size ?: 0
        return RepostEmbedPresentation(
            id = repost.id,
            isUnavailable = expired,
            authorId = repost.author?.id?.takeIf { it.isNotBlank() },
            authorUsername = repost.author?.username?.takeIf { it.isNotBlank() },
            authorName = authorLabel(repost),
            authorAvatarUrl = repost.author?.avatar
                ?.takeIf { it.isNotBlank() }
                ?.let { resolveFeedMediaUrl(it, mediaBaseUrl) },
            createdAtIso = repost.createdAt,
            content = repost.displayContent(preferences),
            isTranslated = repost.isTranslated(preferences),
            previewImageUrl = repost.media
                ?.firstOrNull()
                ?.let { it.thumbnailUrl ?: it.fileUrl }
                ?.takeIf { it.isNotBlank() }
                ?.let { resolveFeedMediaUrl(it, mediaBaseUrl) },
            extraMediaCount = (mediaCount - 1).coerceAtLeast(0),
            likeCount = (repost.likeCount ?: 0).coerceAtLeast(0),
            moodEmoji = repost.moodEmoji?.takeIf { it.isNotBlank() },
            isQuote = repost.isQuote == true,
            isStory = repost.type.equals("story", ignoreCase = true),
            isReel = repost.type.equals("reel", ignoreCase = true),
            location = FeedPostLocationBuilder.build(repost.location),
            media = FeedMediaMapper.map(repost.media, ReaderPrism.resolve(preferences), mediaBaseUrl),
            originalLanguage = repost.originalLanguage,
            displayedLanguage = repost.servedLanguage(preferences),
            languageFlags = RepostEmbedLanguages.flags(repost, displayed = repost.servedLanguage(preferences), secondary = null),
            languageTexts = RepostEmbedLanguages.available(repost)
                .mapNotNull { code -> RepostEmbedLanguages.textIn(repost, code)?.let { code to it } }
                .toMap(),
            audioUrl = repost.audioUrl?.takeIf { it.isNotBlank() }?.let { resolveFeedMediaUrl(it, mediaBaseUrl) },
            mentionUsernames = repost.mentions?.map { it.username.lowercase() }?.toSet(),
            expiresAtIso = repost.expiresAt?.takeIf { it.isNotBlank() },
            originalRepostOfId = repost.originalRepostOfId?.takeIf { it.isNotBlank() },
            reelCover = repost.takeIf { it.type.equals("reel", ignoreCase = true) }?.let {
                ReelCoverResolver.resolve(
                    media = FeedMediaMapper.map(it.media, ReaderPrism.resolve(preferences), mediaBaseUrl),
                    accentHex = DynamicColorGenerator.colorForName(repost.author?.id?.takeIf { id -> id.isNotBlank() } ?: authorLabel(repost).orEmpty()),
                ) { null }
            },
        )
    }
}
