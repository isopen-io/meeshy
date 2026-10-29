package me.meeshy.app.calls

import androidx.compose.ui.test.junit4.createComposeRule
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.call.CallState
import me.meeshy.sdk.model.call.group.GroupCallTitle
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/** Le nom d'un appel de groupe dont le principal est parti se lit comme sur iOS : « Ada, Bruno +2 » (#13754). */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class GroupCallTitleTextTest {
    @get:Rule val rule = createComposeRule()

    private fun text(title: GroupCallTitle?): String? {
        var shown: String? = "unset"
        rule.setContent { shown = groupCallTitleText(title) }
        rule.waitForIdle()
        return shown
    }

    @Test
    fun `two named members then the count of the others`() {
        assertThat(text(GroupCallTitle.Members(listOf("Ada", "Bruno"), more = 2))).isEqualTo("Ada, Bruno +2")
    }

    @Test
    fun `an unknown member reads Participant`() {
        assertThat(text(GroupCallTitle.Members(listOf("Ada", ""), more = 0))).isEqualTo("Ada, Participant")
    }

    @Test
    fun `the group's own title wins`() {
        assertThat(text(GroupCallTitle.Group("Famille"))).isEqualTo("Famille")
    }

    @Test
    fun `while the primary's seat is held the call keeps its name`() {
        assertThat(text(null)).isNull()
        val state = CallPresenter.present(CallState.Connected, CallConfig(peerId = "a", peerName = "Alice", isVideo = false, isOutgoing = true), CallMedia())
        assertThat(state.withGroupTitle(null)).isSameInstanceAs(state)
        assertThat(state.withGroupTitle("Famille").peerName).isEqualTo("Famille")
    }
}
