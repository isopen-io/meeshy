package me.meeshy.app.chat.share

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.MessageEffectFlags
import me.meeshy.sdk.model.share.ShareEntry
import me.meeshy.sdk.model.share.ShareMessage
import me.meeshy.sdk.model.share.SharePlanner
import org.junit.Test

class ShareDurationRowStateTest {
    private fun plan(seconds: Double?) = SharePlanner.plan(
        ShareEntry.Messages(
            listOf(
                ShareMessage(
                    id = "m", text = "x",
                    effectFlags = if (seconds != null) MessageEffectFlags.EPHEMERAL else null,
                    ephemeralDuration = seconds,
                ),
            ),
        ),
    )

    @Test
    fun `no flame means no row`() {
        assertThat(ShareDurationRowState.of(plan(null), null).isVisible).isFalse()
    }

    @Test
    fun `the source duration is preselected and no longer tier is offered`() {
        val state = ShareDurationRowState.of(plan(60.0), null)
        assertThat(state.isVisible).isTrue()
        assertThat(state.selectedSeconds).isEqualTo(60)
        assertThat(state.choices.map { it.seconds }).isNotEmpty()
        assertThat(state.choices.all { it.seconds <= 60 }).isTrue()
        assertThat(state.choices.count { state.isSelected(it) }).isEqualTo(1)
    }

    @Test
    fun `a chosen duration longer than the source is brought back to it`() {
        assertThat(ShareDurationRowState.of(plan(60.0), 3600).selectedSeconds).isEqualTo(60)
    }

    @Test
    fun `a shorter chosen duration is kept`() {
        assertThat(ShareDurationRowState.of(plan(300.0), 30).selectedSeconds).isEqualTo(30)
    }
}
