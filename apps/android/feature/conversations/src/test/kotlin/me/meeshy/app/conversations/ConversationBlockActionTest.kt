package me.meeshy.app.conversations

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.people.BlockEntry
import me.meeshy.sdk.model.people.BlockEntryPlan
import org.junit.Test

class ConversationBlockActionTest {

    @Test
    fun `a direct conversation offers block, then unblock once the peer is blocked`() {
        assertThat(BlockEntryPlan.of("peer", "me", isGroup = false, isBlocked = false)).isEqualTo(BlockEntry.BLOCK)
        assertThat(BlockEntryPlan.of("peer", "me", isGroup = false, isBlocked = true)).isEqualTo(BlockEntry.UNBLOCK)
    }

    @Test
    fun `a group conversation never offers block`() {
        assertThat(BlockEntryPlan.of("peer", "me", isGroup = true, isBlocked = false)).isNull()
    }
}
