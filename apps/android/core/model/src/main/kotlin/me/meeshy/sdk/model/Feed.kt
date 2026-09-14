package me.meeshy.sdk.model

import kotlinx.serialization.Serializable
import me.meeshy.sdk.lang.resolveLastMessagePreview

/** Type of a feed media item — port of FeedMediaType (FeedModels.swift). */
@Serializable
enum class FeedMediaType {
    @kotlinx.serialization.SerialName("image") IMAGE,
    @kotlinx.serialization.SerialName("video") VIDEO,
    @kotlinx.serialization.SerialName("audio") AUDIO,
    @kotlinx.serialization.SerialName("document") DOCUMENT,
    @kotlinx.serialization.SerialName("location") LOCATION,
}

/** A translation of a post/comment — port of PostTranslation (FeedModels.swift). */
@Serializable
data class PostTranslation(
    val text: String = "",
    val translationModel: String? = null,
    val confidenceScore: Double? = null,
)

/** A media item attached to a feed post — port of FeedMedia (FeedModels.swift). */
@Serializable
data class FeedMedia(
    val id: String,
    val type: FeedMediaType = FeedMediaType.IMAGE,
    val url: String? = null,
    val thumbnailUrl: String? = null,
    val thumbHash: String? = null,
    val thumbnailColor: String = "4ECDC4",
    val width: Int? = null,
    val height: Int? = null,
    val duration: Int? = null,
    val fileName: String? = null,
    val fileSize: String? = null,
    val pageCount: Int? = null,
    val locationName: String? = null,
    val latitude: Double? = null,
    val longitude: Double? = null,
    /** The media's caption text, in its original language (`PostMedia.caption`, #6280). */
    val caption: String? = null,
    /** Langue SOURCE de [caption] (`PostMedia.captionLanguage`, #6280). */
    val captionLanguage: String? = null,
    /**
     * Traductions de [caption], aplaties `langue → texte` — même dialecte que
     * `StoryTranslation`/`lastMessageTranslations`. DISTINCTE de toute traduction
     * de piste audio, qui ne traduit jamais le texte de la légende (#6280).
     */
    val captionTranslations: Map<String, String>? = null,
    val transcription: MessageTranscription? = null,
)

/**
 * La descente du Prisme sur LA LÉGENDE de ce média (#6280) — projette
 * [resolveLastMessagePreview] (même règle que `resolveLastMessagePreview` pour
 * l'aperçu de conversation, la RÈGLE #3 du Prisme : la langue d'origine concourt
 * à SON rang, jamais comme court-circuit). `null` quand [caption] est absent ;
 * sinon [caption] TEL QUEL si aucune traduction ne cible une langue préférée
 * (règle #1 du Prisme : jamais `translations.values.first()`).
 */
fun FeedMedia.resolvedCaption(preferredLanguages: List<String>): String? =
    resolveLastMessagePreview(
        preview = caption,
        translations = captionTranslations,
        originalLanguage = captionLanguage,
        preferredLanguages = preferredLanguages,
    )

/** Embedded reposted content in a feed post — port of RepostContent (FeedModels.swift). */
@Serializable
data class RepostContent(
    val id: String,
    val author: String = "",
    val authorId: String = "",
    val authorUsername: String? = null,
    val authorColor: String = "",
    val authorAvatarURL: String? = null,
    val content: String = "",
    val timestamp: String? = null,
    val likes: Int = 0,
    val isQuote: Boolean = false,
    val type: String? = null,
    val originalLanguage: String? = null,
    val audioUrl: String? = null,
    @Serializable(with = StoryEffectsWireSerializer::class)
    val storyEffects: StoryEffects? = null,
    val media: List<FeedMedia> = emptyList(),
    val translations: Map<String, PostTranslation>? = null,
    val originalRepostOfId: String? = null,
    val visibility: String? = null,
    val expiresAt: String? = null,
)

/** A comment on a feed post — port of FeedComment (FeedModels.swift). */
@Serializable
data class FeedComment(
    val id: String,
    val author: String = "",
    val authorId: String = "",
    val authorUsername: String? = null,
    val authorColor: String = "",
    val authorAvatarURL: String? = null,
    val parentId: String? = null,
    val content: String = "",
    val timestamp: String? = null,
    val likes: Int = 0,
    val replies: Int = 0,
    val effectFlags: Int = 0,
    val originalLanguage: String? = null,
    val translatedContent: String? = null,
)

/** A feed post — port of FeedPost (FeedModels.swift). */
@Serializable
data class FeedPost(
    val id: String,
    val author: String = "",
    val authorId: String = "",
    val authorUsername: String? = null,
    val authorColor: String = "",
    val authorAvatarURL: String? = null,
    val type: String? = null,
    val content: String = "",
    val timestamp: String? = null,
    val likes: Int = 0,
    val isLiked: Boolean = false,
    val comments: List<FeedComment> = emptyList(),
    val commentCount: Int = 0,
    val repost: RepostContent? = null,
    val repostAuthor: String? = null,
    val isQuote: Boolean = false,
    val media: List<FeedMedia> = emptyList(),
    val originalLanguage: String? = null,
    val translations: Map<String, PostTranslation>? = null,
    val translatedContent: String? = null,
)
