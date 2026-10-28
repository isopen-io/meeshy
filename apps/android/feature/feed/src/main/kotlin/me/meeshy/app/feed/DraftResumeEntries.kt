package me.meeshy.app.feed

import me.meeshy.sdk.model.PostComposerDraftSnapshot
import me.meeshy.sdk.model.StoryComposerDraftSnapshot
import java.time.Instant

enum class DraftResumeKind { POST, STORY }

/** One draft the author can pick up again, as the head of the feed shows it. */
data class DraftResumeEntry(
    val kind: DraftResumeKind,
    val text: String?,
    val mediaCount: Int,
    val updatedAtMillis: Long,
)

/**
 * « Reprendre votre brouillon » (#13430, iso iOS #8848): the drafts worth offering at the head of
 * the feed, the most recently touched first. A story draft whose publication is on its way is not
 * one — it is already sent, and is told by « Publications non envoyées ».
 */
object DraftResumeEntries {

    fun from(post: PostComposerDraftSnapshot?, story: StoryComposerDraftSnapshot?): List<DraftResumeEntry> =
        listOfNotNull(post?.toEntry(), story?.toEntry()).sortedByDescending { it.updatedAtMillis }

    private fun PostComposerDraftSnapshot.toEntry(): DraftResumeEntry? =
        takeIf { it.isWorthRestoring }?.let {
            DraftResumeEntry(
                kind = DraftResumeKind.POST,
                text = text.trim().ifBlank { null },
                mediaCount = media.size,
                updatedAtMillis = updatedAtMillis,
            )
        }

    private fun StoryComposerDraftSnapshot.toEntry(): DraftResumeEntry? =
        takeIf { it.isWorthRestoring && !it.isAwaitingPublication }?.let {
            DraftResumeEntry(
                kind = DraftResumeKind.STORY,
                text = slides.firstNotNullOfOrNull { slide -> slide.text.trim().ifBlank { null } },
                mediaCount = slides.sumOf { slide -> slide.mediaIds.size },
                updatedAtMillis = updatedAt?.let { stamp -> runCatching { Instant.parse(stamp).toEpochMilli() }.getOrNull() } ?: 0L,
            )
        }
}
