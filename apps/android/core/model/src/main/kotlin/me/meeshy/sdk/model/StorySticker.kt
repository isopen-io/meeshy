package me.meeshy.sdk.model

import kotlinx.serialization.Serializable

/**
 * A sticker on a story canvas — port of StorySticker (StoryModels.swift).
 *
 * [postMediaId]/[provider] carry an image sticker as an INTEGRATED asset —
 * same id space as any post media, never a third-party URL — port of iOS's
 * `StorySticker.postMediaId`/`.provider`. Both are optional with a neutral
 * default so a document from before this field existed still decodes: the
 * codebase has already paid for a stricter-than-the-wire model on this exact
 * type of field (keyframes, transitions) making the WHOLE document fail.
 */
@Serializable
data class StorySticker(
    val id: String,
    val emoji: String = "",
    val postMediaId: String = "",
    val provider: String? = null,
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
) {
    /** True once an integrated image backs this sticker — the renderer's cue to paint it over the emoji. */
    val hasImage: Boolean get() = postMediaId.isNotBlank()
}
