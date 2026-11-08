package me.meeshy.app.feed

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.PermissionNature
import me.meeshy.sdk.model.media.MediaPermissionState
import org.junit.Test

class NearbyPermissionFlowTest {

    private class Harness(var state: MediaPermissionState, private val grantsOnAsk: Boolean = false) {
        val asked = mutableListOf<Pair<PermissionNature, Boolean>>()
        val access = NearbyLocationAccess(
            stateOf = { state },
            ensure = { nature, announces ->
                asked += nature to announces
                if (grantsOnAsk) state = MediaPermissionState.GRANTED
                grantsOnAsk
            },
        )
    }

    @Test
    fun `opening the screen never asks - an undetermined access waits for the gesture`() = runTest {
        val h = Harness(MediaPermissionState.NOT_DETERMINED)

        assertThat(h.access.onOpen()).isEqualTo(NearbyAccess.NeedsGesture)
        assertThat(h.asked).isEmpty()
    }

    @Test
    fun `opening the screen with the access already granted loads without asking`() = runTest {
        val h = Harness(MediaPermissionState.GRANTED)

        assertThat(h.access.onOpen()).isEqualTo(NearbyAccess.Granted)
        assertThat(h.asked).isEmpty()
    }

    @Test
    fun `a refused access seen at opening still asks nothing`() = runTest {
        val h = Harness(MediaPermissionState.DENIED)

        assertThat(h.access.onOpen()).isEqualTo(NearbyAccess.NeedsGesture)
        assertThat(h.asked).isEmpty()
    }

    @Test
    fun `the gesture asks for the location through the door that announces a refusal`() = runTest {
        val h = Harness(MediaPermissionState.NOT_DETERMINED, grantsOnAsk = true)

        assertThat(h.access.onGesture()).isEqualTo(NearbyAccess.Granted)
        assertThat(h.asked).containsExactly(PermissionNature.LOCATION to true)
    }

    @Test
    fun `a refusal at the gesture draws the denied state`() = runTest {
        val h = Harness(MediaPermissionState.DENIED, grantsOnAsk = false)

        assertThat(h.access.onGesture()).isEqualTo(NearbyAccess.Denied)
    }

    @Test
    fun `a permanent refusal sends the denied button to the settings instead of asking again`() = runTest {
        val h = Harness(MediaPermissionState.DENIED)

        assertThat(h.access.deniedAction()).isEqualTo(NearbyDeniedAction.OpenSettings)
        assertThat(h.asked).isEmpty()
    }

    @Test
    fun `a refusal that can still be asked offers to ask again`() = runTest {
        val h = Harness(MediaPermissionState.NOT_DETERMINED)

        assertThat(h.access.deniedAction()).isEqualTo(NearbyDeniedAction.RequestAgain)
    }

    @Test
    fun `back from the settings with the access granted relaunches the load`() = runTest {
        val h = Harness(MediaPermissionState.DENIED)
        assertThat(h.access.onResumedWhileDenied()).isEqualTo(NearbyAccess.Denied)

        h.state = MediaPermissionState.GRANTED

        assertThat(h.access.onResumedWhileDenied()).isEqualTo(NearbyAccess.Granted)
        assertThat(h.asked).isEmpty()
    }
}
