package me.meeshy.sdk.model

import kotlinx.serialization.Serializable

/**
 * The durable form of the mood composer's in-progress status (#13430) — the emoji picked, the
 * words and the audience wire string. A republication of someone else's status is never kept
 * as a draft: it carries its source, and reopening it from the author's own mood would lose
 * the attribution. Every field defaults, so a blob from another build decodes.
 */
@Serializable
data class StatusComposerDraftSnapshot(
    val emoji: String? = null,
    val text: String = "",
    val visibility: String = "PUBLIC",
    val updatedAtMillis: Long = 0L,
) {
    /** Something an author would want back: a mood picked or words written. */
    val isWorthRestoring: Boolean
        get() = emoji != null || text.isNotBlank()

    /** Content equality that ignores [updatedAtMillis], so re-saving an unchanged draft writes nothing. */
    fun sameContentAs(other: StatusComposerDraftSnapshot): Boolean =
        copy(updatedAtMillis = 0L) == other.copy(updatedAtMillis = 0L)
}
