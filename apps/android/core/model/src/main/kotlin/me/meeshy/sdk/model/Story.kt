package me.meeshy.sdk.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * Story canvas models — port of StoryModels.swift.
 *
 * The client-side edit-command machinery (EditCommand, AddClipCommand, …,
 * AnyEditCommand, TimelineProject) is intentionally not ported: it is undo/redo
 * editor logic with no wire representation.
 */

/** Text style preset for story text — port of StoryTextStyle (StoryModels.swift). */
@Serializable
enum class StoryTextStyle {
    @SerialName("bold") BOLD,
    @SerialName("neon") NEON,
    @SerialName("typewriter") TYPEWRITER,
    @SerialName("handwriting") HANDWRITING,
    @SerialName("classic") CLASSIC,
}

/** Photo filter preset for a story slide — port of StoryFilter (StoryModels.swift). */
@Serializable
enum class StoryFilter {
    @SerialName("vintage") VINTAGE,
    @SerialName("bw") BW,
    @SerialName("warm") WARM,
    @SerialName("cool") COOL,
    @SerialName("dramatic") DRAMATIC,
    @SerialName("vivid") VIVID,
    @SerialName("fade") FADE,
    @SerialName("chrome") CHROME,
}

/** Normalised text anchor position — port of StoryTextPosition (StoryModels.swift). */
@Serializable
data class StoryTextPosition(
    val x: Double = 0.5,
    val y: Double = 0.5,
)

/** A voice transcription attached to a story — port of StoryVoiceTranscription (StoryModels.swift). */
@Serializable
data class StoryVoiceTranscription(
    val language: String = "",
    val content: String = "",
)

/** A background audio library entry — port of StoryBackgroundAudioEntry (StoryModels.swift). */
@Serializable
data class StoryBackgroundAudioEntry(
    val id: String,
    val title: String = "",
    val uploaderName: String? = null,
    val duration: Int = 0,
    val fileUrl: String = "",
    val usageCount: Int = 0,
    val isPublic: Boolean = true,
)

/** A story content translation — port of StoryTranslation (StoryModels.swift). */
@Serializable
data class StoryTranslation(
    val language: String = "",
    val content: String = "",
)

/**
 * Background style for a story text object — port of StoryTextBackgroundStyle
 * (StoryModels.swift). Tagged union encoded as `{ type, hex?, radius? }`:
 * type is one of "none" / "solid" / "glass".
 */
@Serializable
data class StoryTextBackgroundStyle(
    val type: String = "none",
    val hex: String? = null,
    val radius: Double? = null,
)

/** A 2D anchor point in normalised canvas coords — port of CGPoint usage in StoryModels.swift. */
@Serializable
data class StoryAnchorPoint(
    val x: Double = 0.5,
    val y: Double = 0.5,
)

/** Easing curve for story animations — port of StoryEasing (StoryModels.swift). */
@Serializable
enum class StoryEasing {
    @SerialName("linear") LINEAR,
    @SerialName("easeIn") EASE_IN,
    @SerialName("easeOut") EASE_OUT,
    @SerialName("easeInOut") EASE_IN_OUT,
}

/** A single animation keyframe — port of StoryKeyframe (StoryModels.swift). */
@Serializable
data class StoryKeyframe(
    val id: String,
    val time: Float = 0f,
    val x: Double? = null,
    val y: Double? = null,
    val scale: Double? = null,
    val opacity: Double? = null,
    val easing: StoryEasing? = null,
)

/** A text object on a story canvas — port of StoryTextObject (StoryModels.swift). */
@Serializable
data class StoryTextObject(
    val id: String,
    val text: String = "",
    val x: Double = 0.5,
    val y: Double = 0.5,
    val scale: Double = 1.0,
    val rotation: Double = 0.0,
    val zIndex: Int = 0,
    val anchor: StoryAnchorPoint = StoryAnchorPoint(),
    val fontSize: Double = 64.0,
    val fontFamily: String = "system",
    val textStyle: String? = null,
    val textColor: String? = null,
    val textAlign: String? = null,
    val textBg: String? = null,
    val backgroundStyle: StoryTextBackgroundStyle? = null,
    val borderColor: String? = null,
    val borderWidth: Double? = null,
    val translations: Map<String, String>? = null,
    val sourceLanguage: String? = null,
    val startTime: Double? = null,
    val duration: Double? = null,
    val fadeIn: Double? = null,
    val fadeOut: Double? = null,
    val isLocked: Boolean? = null,
    val keyframes: List<StoryKeyframe>? = null,
)

/** Type of a story media object — port of StoryMediaKind (StoryModels.swift). */
@Serializable
enum class StoryMediaKind {
    @SerialName("image") IMAGE,
    @SerialName("video") VIDEO,
}

/** An image/video object on a story canvas — port of StoryMediaObject (StoryModels.swift). */
@Serializable
data class StoryMediaObject(
    val id: String,
    val postMediaId: String = "",
    val mediaURL: String? = null,
    val mediaType: String = "image",
    val placement: String = "media",
    val x: Double = 0.5,
    val y: Double = 0.5,
    val scale: Double = 1.0,
    val rotation: Double = 0.0,
    val volume: Float = 1.0f,
    val aspectRatio: Double = 1.0,
    val anchor: StoryAnchorPoint = StoryAnchorPoint(),
    val intrinsicDuration: Double? = null,
    val isBackground: Boolean = false,
    val loop: Boolean = false,
    val zIndex: Int = 0,
    val startTime: Double? = null,
    val duration: Double? = null,
    val fadeIn: Double? = null,
    val fadeOut: Double? = null,
    val sourceLanguage: String? = null,
    val keyframes: List<StoryKeyframe>? = null,
)

/** A TTS audio variant by language — port of StoryAudioVariant (StoryModels.swift). */
@Serializable
data class StoryAudioVariant(
    val postMediaId: String = "",
    val language: String = "",
    val isAutoGenerated: Boolean = true,
)

/** An audio player object on a story canvas — port of StoryAudioPlayerObject (StoryModels.swift). */
@Serializable
data class StoryAudioPlayerObject(
    val id: String,
    val postMediaId: String = "",
    val placement: String = "overlay",
    val x: Double = 0.5,
    val y: Double = 0.8,
    val volume: Float = 1.0f,
    val waveformSamples: List<Float> = emptyList(),
    val isBackground: Boolean? = null,
    val backgroundAudioVariants: List<StoryAudioVariant>? = null,
    val zIndex: Int? = null,
    val startTime: Float? = null,
    val duration: Float? = null,
    val loop: Boolean? = null,
    val fadeIn: Float? = null,
    val fadeOut: Float? = null,
    val sourceLanguage: String? = null,
)

/** An emoji sticker on a story canvas — port of StorySticker (StoryModels.swift). */
@Serializable
data class StorySticker(
    val id: String,
    val emoji: String = "",
    val x: Double = 0.5,
    val y: Double = 0.5,
    val scale: Double = 1.0,
    val rotation: Double = 0.0,
    val zIndex: Int = 0,
    val baseSize: Double = 140.0,
    val anchor: StoryAnchorPoint = StoryAnchorPoint(),
    val startTime: Double? = null,
    val duration: Double? = null,
    val fadeIn: Double? = null,
    val fadeOut: Double? = null,
)

/** Inter-slide transition effect — port of StoryTransitionEffect (StoryModels.swift). */
@Serializable
enum class StoryTransitionEffect {
    @SerialName("fade") FADE,
    @SerialName("zoom") ZOOM,
    @SerialName("slide") SLIDE,
    @SerialName("reveal") REVEAL,
}

/** Kind of inter-clip transition — port of StoryTransitionKind (StoryModels.swift). */
@Serializable
enum class StoryTransitionKind {
    @SerialName("crossfade") CROSSFADE,
    @SerialName("dissolve") DISSOLVE,
}

/** A transition between two adjacent clips of a slide — port of StoryClipTransition (StoryModels.swift). */
@Serializable
data class StoryClipTransition(
    val id: String,
    val fromClipId: String = "",
    val toClipId: String = "",
    val kind: StoryTransitionKind = StoryTransitionKind.CROSSFADE,
    val duration: Float = 0f,
    val easing: StoryEasing? = null,
)

/** A transform applied to the background media — port of StoryBackgroundTransform (StoryModels.swift). */
@Serializable
data class StoryBackgroundTransform(
    val scale: Double? = null,
    val offsetX: Double? = null,
    val offsetY: Double? = null,
    val rotation: Double? = null,
)

/** The full effects payload for a story slide — port of StoryEffects (StoryModels.swift). */
@Serializable
data class StoryEffects(
    val background: String? = null,
    val textStyle: String? = null,
    val textColor: String? = null,
    val textPosition: String? = null,
    val filter: String? = null,
    val filterIntensity: Double? = null,
    val stickers: List<String>? = null,
    val textAlign: String? = null,
    val textSize: Double? = null,
    val textBg: String? = null,
    val textOffsetY: Double? = null,
    val stickerObjects: List<StorySticker>? = null,
    val textPositionPoint: StoryTextPosition? = null,
    val backgroundAudioId: String? = null,
    val backgroundAudioVolume: Float? = null,
    val backgroundAudioStart: Double? = null,
    val backgroundAudioEnd: Double? = null,
    val voiceAttachmentId: String? = null,
    val voiceTranscriptions: List<StoryVoiceTranscription>? = null,
    val opening: StoryTransitionEffect? = null,
    val closing: StoryTransitionEffect? = null,
    val textObjects: List<StoryTextObject> = emptyList(),
    val mediaObjects: List<StoryMediaObject>? = null,
    val audioPlayerObjects: List<StoryAudioPlayerObject>? = null,
    val backgroundAudioVariants: List<StoryAudioVariant>? = null,
    val thumbHash: String? = null,
    val backgroundTransform: StoryBackgroundTransform? = null,
    val slideDuration: Float? = null,
    val clipTransitions: List<StoryClipTransition>? = null,
    val musicTrackId: String? = null,
    val musicStartTime: Double? = null,
    val musicEndTime: Double? = null,
)

/** A single story slide — port of StorySlide (StoryModels.swift). */
@Serializable
data class StorySlide(
    val id: String,
    val mediaURL: String? = null,
    val content: String? = null,
    val effects: StoryEffects = StoryEffects(),
    val duration: Double = 12.0,
    val order: Int = 0,
)

/** Post kind — port of PostType (StoryModels.swift). */
@Serializable
enum class PostType {
    @SerialName("POST") POST,
    @SerialName("STORY") STORY,
    @SerialName("STATUS") STATUS,
}

/** A published story item — port of StoryItem (StoryModels.swift). */
@Serializable
data class StoryItem(
    val id: String,
    val content: String? = null,
    val media: List<FeedMedia> = emptyList(),
    val storyEffects: StoryEffects? = null,
    val createdAt: String? = null,
    val expiresAt: String? = null,
    val repostOfId: String? = null,
    val originalRepostOfId: String? = null,
    val repostAuthorName: String? = null,
    val visibility: String? = null,
    val audioUrl: String? = null,
    val isViewed: Boolean = false,
    val translations: List<StoryTranslation>? = null,
    val backgroundAudio: StoryBackgroundAudioEntry? = null,
    val reactionCount: Int = 0,
    val commentCount: Int = 0,
)

/** A grouping of one author's stories — port of StoryGroup (StoryModels.swift). */
@Serializable
data class StoryGroup(
    val id: String,
    val username: String = "",
    val avatarColor: String = "",
    val avatarURL: String? = null,
    val stories: List<StoryItem> = emptyList(),
)

/** A mood/status entry — port of StatusEntry (StoryModels.swift). */
@Serializable
data class StatusEntry(
    val id: String,
    val userId: String = "",
    val username: String = "",
    val avatarColor: String = "",
    val moodEmoji: String = "",
    val content: String? = null,
    val audioUrl: String? = null,
    val createdAt: String? = null,
    val expiresAt: String? = null,
    val visibility: String? = null,
    val reactionSummary: Map<String, Int>? = null,
    val viaUsername: String? = null,
)

/** Add/toggle a reaction request — port of ReactionRequest (StoryModels.swift). */
@Serializable
data class ReactionRequest(
    val emoji: String,
)

/** Repost a post/story/status request — port of RepostRequest (StoryModels.swift). */
@Serializable
data class RepostRequest(
    val content: String? = null,
    val isQuote: Boolean = false,
    val targetType: String? = null,
)

/** Create a mood status request — port of StatusCreateRequest (StoryModels.swift). */
@Serializable
data class StatusCreateRequest(
    val type: String = "STATUS",
    val moodEmoji: String,
    val content: String? = null,
    val visibility: String = "PUBLIC",
    val visibilityUserIds: List<String>? = null,
)

/** Mark a story as viewed request — port of StoryViewRequest (StoryModels.swift). */
@Serializable
data class StoryViewRequest(
    val viewed: Boolean = true,
)
