package me.meeshy.app.feed

import me.meeshy.sdk.model.PostComposerDraftSnapshot
import me.meeshy.sdk.model.PostType
import me.meeshy.sdk.model.ReelComposition
import me.meeshy.sdk.model.StoryComposerDraftSnapshot
import me.meeshy.sdk.model.composer.ComposerFormat
import java.time.Instant

enum class DraftResumeKind { POST, REEL, STORY }

/** Where a draft lives: the post slot of the composer of old (#13503), or the scene (#13863), whatever its format. */
enum class DraftResumeSource { POST_SLOT, SCENE }

/** One draft the author can pick up again, as the head of the feed shows it. */
data class DraftResumeEntry(
    val kind: DraftResumeKind,
    val text: String?,
    val mediaCount: Int,
    val updatedAtMillis: Long,
    val source: DraftResumeSource = DraftResumeSource.POST_SLOT,
)

/**
 * « Reprendre votre brouillon » (#13430, iso iOS #8848): the drafts worth offering at the head of
 * the feed, the most recently touched first. A story draft whose publication is on its way is not
 * one — it is already sent, and is told by « Publications non envoyées ».
 *
 * A draft of the post composer of old kept in its slot (#13503) is a REEL when its composition is one
 * ([ReelComposition.defaultType], the very rule the publish applies), a POST otherwise. A scene draft (#13863) is the
 * format it was composed in, and shows its post text first.
 */
object DraftResumeEntries {

    fun from(post: PostComposerDraftSnapshot?, story: StoryComposerDraftSnapshot?): List<DraftResumeEntry> =
        listOfNotNull(post?.toEntry(), story?.toEntry()).sortedByDescending { it.updatedAtMillis }

    private fun PostComposerDraftSnapshot.toEntry(): DraftResumeEntry? =
        takeIf { it.isWorthRestoring }?.let {
            DraftResumeEntry(
                kind = if (isReel) DraftResumeKind.REEL else DraftResumeKind.POST,
                text = text.trim().ifBlank { null },
                mediaCount = media.size,
                updatedAtMillis = updatedAtMillis,
            )
        }

    private val PostComposerDraftSnapshot.isReel: Boolean
        get() = ReelComposition.defaultType(media.map { ReelComposition.MediaKind(it.mimeType, it.durationMs) }, forcePlainPost) == PostType.REEL

    private fun StoryComposerDraftSnapshot.toEntry(): DraftResumeEntry? =
        takeIf { it.isWorthRestoring && !it.isAwaitingPublication }?.let {
            DraftResumeEntry(
                kind = when (format) {
                    ComposerFormat.POST.name -> DraftResumeKind.POST
                    ComposerFormat.REEL.name -> DraftResumeKind.REEL
                    else -> DraftResumeKind.STORY
                },
                text = postText.trim().ifBlank { null } ?: slides.firstNotNullOfOrNull { slide -> slide.text.trim().ifBlank { null } },
                mediaCount = slides.sumOf { slide -> slide.mediaIds.size },
                updatedAtMillis = updatedAt?.let { stamp -> runCatching { Instant.parse(stamp).toEpochMilli() }.getOrNull() } ?: 0L,
                source = DraftResumeSource.SCENE,
            )
        }
}
