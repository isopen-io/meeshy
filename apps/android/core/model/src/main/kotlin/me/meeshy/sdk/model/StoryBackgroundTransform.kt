package me.meeshy.sdk.model

import kotlinx.serialization.Serializable

/**
 * A transform applied to the background media — port of StoryBackgroundTransform (StoryModels.swift).
 *
 * [videoFitMode] is the author's forced framing of the background (`"fit"` letterbox, `"fill"` cover; absence
 * renders FILLED, see `StoryBackgroundFraming`), and [backdrop] the fill of the bands of a FITTED media (a raw
 * `StoryBackdrop` value, absence = the media blur). Both are the wire contract shared with iOS and the web.
 */
@Serializable
data class StoryBackgroundTransform(
    val scale: Double? = null,
    val offsetX: Double? = null,
    val offsetY: Double? = null,
    val rotation: Double? = null,
    val videoFitMode: String? = null,
    val backdrop: String? = null,
) {
    val isIdentity: Boolean
        get() = (scale ?: 1.0) == 1.0 && (offsetX ?: 0.0) == 0.0 && (offsetY ?: 0.0) == 0.0 &&
            (rotation ?: 0.0) == 0.0 && videoFitMode == null && backdrop == null
}
