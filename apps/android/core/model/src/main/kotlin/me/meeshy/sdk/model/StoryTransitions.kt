package me.meeshy.sdk.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

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
