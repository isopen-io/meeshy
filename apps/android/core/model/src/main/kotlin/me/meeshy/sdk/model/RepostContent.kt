package me.meeshy.sdk.model

import kotlinx.serialization.Serializable

/**
 * Le contenu reposté embarqué dans un post du fil — miroir de `RepostContent`
 * (RepostContent.swift). Couvre tout ce que le post SOURCE porte : audio, humeur, effets
 * de story, médias, traductions, repost d'origine, visibilité, expiration, lieu, mentions.
 */
@Serializable
public data class RepostContent(
    val id: String,
    val author: String = "",
    val authorId: String = "",
    val authorUsername: String? = null,
    val authorColor: String = "",
    val authorAvatarURL: String? = null,
    /** Le contour équipé de l'auteur original (#10946) ; `null` sans contour. */
    @Serializable(with = TolerantPostServedRingSerializer::class)
    val authorRing: PostServedRing? = null,
    val content: String = "",
    val timestamp: String? = null,
    val likes: Int = 0,
    val isQuote: Boolean = false,
    val type: String? = null,
    val originalLanguage: String? = null,
    val audioUrl: String? = null,
    /** Humeur d'un STATUS reposté ; permet au bloc cité de montrer l'humeur plutôt qu'un corps vide. */
    val moodEmoji: String? = null,
    @Serializable(with = StoryEffectsWireSerializer::class)
    val storyEffects: StoryEffects? = null,
    val media: List<FeedMedia> = emptyList(),
    val translations: Map<String, PostTranslation>? = null,
    val originalRepostOfId: String? = null,
    val visibility: String? = null,
    val expiresAt: String? = null,
    /** Lieu du post SOURCE : sans lui, un repost perdait la position de l'original. */
    val location: SharedPlace? = null,
    /**
     * Les personnes que le post SOURCE nomme. `null` = la charge n'en disait rien ; liste vide =
     * elle affirme qu'il n'y en a aucune. Le rendu du texte cité s'appuie sur cette différence.
     */
    @Serializable(with = TolerantPostReferencesSerializer::class)
    val mentions: List<PostReference>? = null,
) {
    /** Les pseudos que le texte cité peut rendre cliquables ; `null` se propage (aucun avis). */
    val validMentionUsernames: Set<String>?
        get() = mentions?.map { it.username.lowercase() }?.toSet()

    /** Le serveur (`REEL`) fait foi pour reconnaître un réel reposté. */
    val isReel: Boolean get() = postTypeFromWire(type) == PostType.REEL

    /** Premier média montré pour un réel reposté : vidéo, sinon audio, sinon image. */
    val primaryReelMedia: FeedMedia?
        get() = if (!isReel) null else
            media.firstOrNull { it.type == FeedMediaType.VIDEO }
                ?: media.firstOrNull { it.type == FeedMediaType.AUDIO }
                ?: media.firstOrNull { it.type == FeedMediaType.IMAGE }
}
