package me.meeshy.sdk.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/** Text style preset for story text — port of StoryTextStyle (StoryModels.swift). */
@Serializable
enum class StoryTextStyle {
    @SerialName("bold") BOLD,
    @SerialName("neon") NEON,
    @SerialName("typewriter") TYPEWRITER,
    @SerialName("handwriting") HANDWRITING,
    @SerialName("classic") CLASSIC,
}

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
    /** The EFFECT axis (#4870) — [StoryTextEffect.wire]; absent ⇒ none. A string, like `textStyle`, so a newer client's value decodes. */
    val textEffect: String? = null,
    val translations: Map<String, String>? = null,
    val sourceLanguage: String? = null,
    val startTime: Double? = null,
    val duration: Double? = null,
    val fadeIn: Double? = null,
    val fadeOut: Double? = null,
    val isLocked: Boolean? = null,
    val keyframes: List<StoryKeyframe>? = null,
)
