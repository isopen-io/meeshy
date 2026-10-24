package me.meeshy.sdk.model.call

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class CallSwipeDismissRuleTest {

    private fun outcome(
        translation: Float,
        predicted: Float = translation,
        isGroup: Boolean = false,
        isPanelOpen: Boolean = false,
    ) = CallSwipeDismissRule.outcome(translation, predicted, isGroup, isPanelOpen)

    @Test
    fun `the screen follows the finger and stops at the course`() {
        assertThat(CallSwipeDismissRule.offset(120f, isGroup = false, isPanelOpen = false)).isEqualTo(120f)
        assertThat(CallSwipeDismissRule.offset(900f, isGroup = false, isPanelOpen = false)).isEqualTo(300f)
        assertThat(CallSwipeDismissRule.offset(-40f, isGroup = false, isPanelOpen = false)).isEqualTo(0f)
    }

    @Test
    fun `a group call or an open panel never follows the finger`() {
        assertThat(CallSwipeDismissRule.offset(200f, isGroup = true, isPanelOpen = false)).isEqualTo(0f)
        assertThat(CallSwipeDismissRule.offset(200f, isGroup = false, isPanelOpen = true)).isEqualTo(0f)
    }

    @Test
    fun `releasing at 75 percent of the course minimizes`() {
        assertThat(outcome(225f)).isEqualTo(CallSwipeOutcome.Minimize)
    }

    @Test
    fun `releasing just before 75 percent drops back`() {
        assertThat(outcome(224f)).isEqualTo(CallSwipeOutcome.None)
    }

    @Test
    fun `a frank fling minimizes even from a short drag`() {
        assertThat(outcome(80f, predicted = 300f)).isEqualTo(CallSwipeOutcome.Minimize)
        assertThat(outcome(80f, predicted = 299f)).isEqualTo(CallSwipeOutcome.None)
    }

    @Test
    fun `no minimize in a group or with a panel open or when pulled up`() {
        assertThat(outcome(280f, isGroup = true)).isEqualTo(CallSwipeOutcome.None)
        assertThat(outcome(280f, isPanelOpen = true)).isEqualTo(CallSwipeOutcome.None)
        assertThat(outcome(-10f, predicted = 500f)).isEqualTo(CallSwipeOutcome.None)
    }
}
