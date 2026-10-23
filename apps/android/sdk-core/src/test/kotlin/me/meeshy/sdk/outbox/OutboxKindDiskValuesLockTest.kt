package me.meeshy.sdk.outbox

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * `outbox.kind` stores the enum NAME. A build must read what an older one wrote, so the list is
 * append-only: renaming or reordering a kind is a data migration, not a refactor.
 */
class OutboxKindDiskValuesLockTest {

    private val frozen = listOf(
        "SEND_MESSAGE",
        "EDIT_MESSAGE",
        "DELETE_MESSAGE",
        "ADD_REACTION",
        "REMOVE_REACTION",
        "READ_RECEIPT",
        "MARK_UNREAD",
        "UPDATE_CONVERSATION_PREFS",
        "UPDATE_PROFILE",
        "UPDATE_SETTINGS",
        "UPDATE_PRIVACY_SETTINGS",
        "PUBLISH_STORY",
        "UPLOAD_MEDIA",
        "BLOCK_USER",
        "UNBLOCK_USER",
        "SEND_FRIEND_REQUEST",
        "PIN_MESSAGE",
        "UNPIN_MESSAGE",
        "LIKE_POST",
        "UNLIKE_POST",
        "BOOKMARK_POST",
        "UNBOOKMARK_POST",
        "RESPOND_FRIEND_REQUEST",
    )

    @Test
    fun `the frozen disk names are still the first kinds of the enum, in order`() {
        assertThat(OutboxKind.entries.map { it.name }.take(frozen.size)).containsExactlyElementsIn(frozen).inOrder()
    }

    @Test
    fun `the catalog persists each kind under its enum name`() {
        OutboxKind.entries.forEach { assertThat(OutboxKindCatalog.metaFor(it).diskValue).isEqualTo(it.name) }
    }
}
