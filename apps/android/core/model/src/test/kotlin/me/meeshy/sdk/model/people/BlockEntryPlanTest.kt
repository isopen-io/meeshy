package me.meeshy.sdk.model.people

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class BlockEntryPlanTest {
    private fun plan(
        target: String? = "u2",
        self: String? = "u1",
        group: Boolean = false,
        anonymous: Boolean = false,
        blocked: Boolean = false,
    ) = BlockEntryPlan.of(target, self, group, anonymous, blocked)

    @Test fun `another person offers block`() = assertThat(plan()).isEqualTo(BlockEntry.BLOCK)

    @Test fun `a blocked person offers unblock`() = assertThat(plan(blocked = true)).isEqualTo(BlockEntry.UNBLOCK)

    @Test fun `oneself is never offered`() = assertThat(plan(target = "u1")).isNull()

    @Test fun `a group is never offered`() = assertThat(plan(group = true)).isNull()

    @Test fun `a visitor without account is never offered`() = assertThat(plan(anonymous = true)).isNull()

    @Test fun `a missing or blank target is never offered`() {
        assertThat(plan(target = null)).isNull()
        assertThat(plan(target = " ")).isNull()
    }

    @Test fun `only blocking asks for confirmation`() {
        assertThat(BlockEntry.BLOCK.needsConfirmation).isTrue()
        assertThat(BlockEntry.UNBLOCK.needsConfirmation).isFalse()
    }

    @Test fun `confirmation wording falls back when the name is missing`() {
        assertThat(BlockConfirmWording.displayName(null, "this person")).isEqualTo("this person")
        assertThat(BlockConfirmWording.displayName("  ", "this person")).isEqualTo("this person")
        assertThat(BlockConfirmWording.displayName(" Ana ", "this person")).isEqualTo("Ana")
    }
}
