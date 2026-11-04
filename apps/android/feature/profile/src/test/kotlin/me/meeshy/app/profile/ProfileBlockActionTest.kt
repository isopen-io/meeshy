package me.meeshy.app.profile

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.people.BlockEntry
import me.meeshy.sdk.model.people.BlockEntryPlan
import org.junit.Test

class ProfileBlockActionTest {

    @Test
    fun `a failed block or unblock is announced as an error`() {
        assertThat(ProfileActionFeedback.BlockFailed.isError).isTrue()
        assertThat(ProfileActionFeedback.UnblockFailed.isError).isTrue()
        assertThat(ProfileActionFeedback.UserBlocked.isError).isFalse()
    }

    @Test
    fun `the profile entry follows the shared block law`() {
        assertThat(BlockEntryPlan.of("u2", "me", isBlocked = false)).isEqualTo(BlockEntry.BLOCK)
        assertThat(BlockEntryPlan.of("u2", "me", isBlocked = true)).isEqualTo(BlockEntry.UNBLOCK)
        assertThat(BlockEntryPlan.of("me", "me", isBlocked = false)).isNull()
    }
}
