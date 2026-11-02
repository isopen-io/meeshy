package me.meeshy.sdk.model

import kotlinx.serialization.Serializable

/**
 * The durable form of the feed composer's in-progress post or reel (#13417) — what survives
 * a closed sheet, a killed app and a publication that has not been confirmed yet. Mirror of
 * the story composer's [StoryComposerDraftSnapshot] for the feed.
 *
 * [media] keeps every attached item as the composer showed it: a server id once uploaded, the
 * upload's `cmid_` placeholder while its bytes still wait on the device. [visibility] is the
 * wire string. Every field defaults, so a blob written by an older build decodes.
 */
@Serializable
data class PostComposerDraftSnapshot(
    val text: String = "",
    val visibility: String = "PUBLIC",
    val media: List<UploadedMedia> = emptyList(),
    val forcePlainPost: Boolean = false,
    val location: SharedPlace? = null,
    val language: String? = null,
    val mediaAlt: Map<String, String> = emptyMap(),
    /** The caption of each media (`PostMedia.caption`), keyed like [mediaAlt] — a third text, distinct from the post's content and from the alt. */
    val mediaCaption: Map<String, String> = emptyMap(),
    /** The scene's background colour (hex without `#`), absent for a post without a scene. */
    val background: String? = null,
    val updatedAtMillis: Long = 0L,
    /**
     * The whole scene the post was composed on (#13863) — slides, objects, sounds, drawing, looks — kept for « Rouvrir »
     * so a post that did not leave reopens exactly as it was composed. `null` for a post of the feed composer of before.
     */
    val scene: StoryComposerDraftSnapshot? = null,
) {
    /** Whether there is anything an author would want back: words, media or a composed scene. */
    val isWorthRestoring: Boolean
        get() = text.isNotBlank() || media.isNotEmpty() || scene?.isWorthRestoring == true

    /** Content equality that ignores [updatedAtMillis], so re-saving an unchanged draft writes nothing. */
    fun sameContentAs(other: PostComposerDraftSnapshot): Boolean =
        copy(updatedAtMillis = 0L) == other.copy(updatedAtMillis = 0L)
}
