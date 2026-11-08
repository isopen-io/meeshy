package me.meeshy.sdk.model.syncpill

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.sync.OutboxNavigationSource
import me.meeshy.sdk.model.sync.OutboxUiIcon
import me.meeshy.sdk.model.sync.OutboxUiItem
import me.meeshy.sdk.model.sync.OutboxUiKind
import me.meeshy.sdk.model.sync.OutboxUiStatus
import org.junit.Test

class SyncPillLabelsTest {
    private fun item(
        kind: OutboxUiKind,
        icon: OutboxUiIcon = OutboxUiIcon.TEXT,
        status: OutboxUiStatus = OutboxUiStatus.PENDING,
        other: String? = null,
    ) = OutboxUiItem("i", kind, null, icon, 0, OutboxNavigationSource.Unknown, status, 0, otherKey = other)

    @Test
    fun `a message is labelled by its medium`() {
        fun key(icon: OutboxUiIcon) = SyncPillLabels.keyFor(item(OutboxUiKind.MESSAGE, icon))
        assertThat(key(OutboxUiIcon.AUDIO)).isEqualTo("sync.pill.sending.audio")
        assertThat(key(OutboxUiIcon.IMAGE)).isEqualTo("sync.pill.sending.image")
        assertThat(key(OutboxUiIcon.VIDEO)).isEqualTo("sync.pill.sending.video")
        assertThat(key(OutboxUiIcon.FILE)).isEqualTo("sync.pill.sending.file")
        assertThat(key(OutboxUiIcon.STICKER)).isEqualTo("sync.pill.sending.sticker")
        assertThat(key(OutboxUiIcon.TEXT)).isEqualTo("sync.pill.sending.message")
        assertThat(key(OutboxUiIcon.NONE)).isEqualTo("sync.pill.sending.message")
    }

    @Test
    fun `story and comment variants follow their medium`() {
        assertThat(SyncPillLabels.keyFor(item(OutboxUiKind.STORY, OutboxUiIcon.VIDEO))).isEqualTo("sync.pill.publishing.story.video")
        assertThat(SyncPillLabels.keyFor(item(OutboxUiKind.STORY, OutboxUiIcon.IMAGE))).isEqualTo("sync.pill.publishing.story")
        assertThat(SyncPillLabels.keyFor(item(OutboxUiKind.POST_COMMENT, OutboxUiIcon.AUDIO))).isEqualTo("sync.pill.sending.comment.audio")
        assertThat(SyncPillLabels.keyFor(item(OutboxUiKind.POST_REACTION))).isEqualTo("sync.pill.reacting.post")
    }

    @Test
    fun `a terminal row reads as a failure not as a verb`() {
        val expected = mapOf(
            OutboxUiKind.MESSAGE to "sync.pill.failed.message",
            OutboxUiKind.EDIT to "sync.pill.failed.edit",
            OutboxUiKind.DELETE to "sync.pill.failed.delete",
            OutboxUiKind.REACTION to "sync.pill.failed.reaction",
            OutboxUiKind.STORY to "sync.pill.failed.story",
            OutboxUiKind.POST_COMMENT to "sync.pill.failed.comment",
            OutboxUiKind.POST_REACTION to "sync.pill.failed.postReaction",
            OutboxUiKind.OTHER to "sync.pill.failed.generic",
        )
        expected.forEach { (kind, key) ->
            assertThat(SyncPillLabels.keyFor(item(kind, status = OutboxUiStatus.EXHAUSTED))).isEqualTo(key)
        }
    }

    @Test
    fun `other kinds have their own verb and an unknown one stays generic`() {
        assertThat(SyncPillLabels.keyFor(item(OutboxUiKind.OTHER, other = "blockUser"))).isEqualTo("sync.pill.other.block")
        assertThat(SyncPillLabels.keyFor(item(OutboxUiKind.OTHER, other = "blockUser", status = OutboxUiStatus.FAILED)))
            .isEqualTo("sync.pill.failed.block")
        assertThat(SyncPillLabels.keyFor(item(OutboxUiKind.OTHER, other = "reportAttachmentStatus"))).isEqualTo("sync.pill.other.attachmentStatus")
        assertThat(SyncPillLabels.keyFor(item(OutboxUiKind.OTHER, other = "uploadMedia"))).isEqualTo("sync.pill.other.generic")
        assertThat(SyncPillLabels.keyFor(item(OutboxUiKind.OTHER, other = null))).isEqualTo("sync.pill.other.generic")
    }
}
