package me.meeshy.app.calls

import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.call.CallState
import me.meeshy.sdk.model.call.group.GroupCallTitle
import me.meeshy.sdk.model.call.group.text
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/** Le nom d'un appel de groupe dont le principal est parti se lit comme sur iOS : « Ada, Bruno +2 » (#13754, #13768). */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class GroupCallTitleTextTest {

    private val wording = AndroidGroupCallTitleWording(ApplicationProvider.getApplicationContext()).current()

    @Test
    fun `two named members then the count of the others`() {
        assertThat(GroupCallTitle.Members(listOf("Ada", "Bruno"), more = 2).text(wording)).isEqualTo("Ada, Bruno +2")
    }

    @Test
    fun `an unknown member reads Participant`() {
        assertThat(GroupCallTitle.Members(listOf("Ada", ""), more = 0).text(wording)).isEqualTo("Ada, Participant")
    }

    @Test
    fun `the group's own title wins, nobody left reads the call's participants`() {
        assertThat(GroupCallTitle.Group("Famille").text(wording)).isEqualTo("Famille")
        assertThat(GroupCallTitle.Everyone.text(wording)).isEqualTo("Call participants")
    }

    @Test
    fun `while the primary's seat is held the call keeps its name`() {
        val state = CallPresenter.present(CallState.Connected, CallConfig(peerId = "a", peerName = "Alice", isVideo = false, isOutgoing = true), CallMedia())
        assertThat(state.withGroupTitle(null)).isSameInstanceAs(state)
        assertThat(state.withGroupTitle("Famille").peerName).isEqualTo("Famille")
    }
}
