package me.meeshy.sdk.model.call

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class CallAudioRouteStateTest {
    private val earpiece = CallAudioRoute(1, "Écouteur", CallAudioRouteKind.Earpiece)
    private val speaker = CallAudioRoute(2, "Haut-parleur", CallAudioRouteKind.Speaker)
    private val buds = CallAudioRoute(7, "Buds", CallAudioRouteKind.Bluetooth)

    private fun state(
        routes: List<CallAudioRoute> = listOf(earpiece, speaker, buds),
        activeId: Int? = 1,
        permitted: Boolean = true,
        video: Boolean = false,
    ) = CallAudioRouteState(routes, activeId, permitted, video)

    @Test
    fun `selectionner une route proposée la rend active`() {
        assertThat(state().selecting(7).activeId).isEqualTo(7)
    }

    @Test
    fun `selectionner une route inconnue ne change rien`() {
        val s = state()
        assertThat(s.selecting(99)).isEqualTo(s)
    }

    @Test
    fun `sans permission Bluetooth les routes Bluetooth sont masquées et signalées`() {
        val s = state(permitted = false)
        assertThat(s.visibleRoutes).containsExactly(earpiece, speaker)
        assertThat(s.bluetoothHidden).isTrue()
        assertThat(s.selecting(7)).isEqualTo(s)
    }

    @Test
    fun `le périphérique actif débranché retombe sur l'écouteur en audio`() {
        val next = state(activeId = 7).withRoutes(listOf(earpiece, speaker))
        assertThat(next.activeId).isEqualTo(1)
    }

    @Test
    fun `le périphérique actif débranché retombe sur le haut-parleur en vidéo`() {
        val next = state(activeId = 7, video = true).withRoutes(listOf(earpiece, speaker))
        assertThat(next.activeId).isEqualTo(2)
    }

    @Test
    fun `la route active encore présente est gardée`() {
        assertThat(state(activeId = 2).withRoutes(listOf(earpiece, speaker, buds)).activeId).isEqualTo(2)
    }

    @Test
    fun `la route rapportée par la plateforme prime`() {
        assertThat(state(activeId = 1).withRoutes(listOf(earpiece, speaker, buds), platformActiveId = 7).activeId)
            .isEqualTo(7)
    }

    @Test
    fun `la proximité ne s'applique qu'à l'écouteur en audio`() {
        assertThat(CallProximityPolicy.shouldSense(false, CallAudioRouteKind.Earpiece)).isTrue()
        assertThat(CallProximityPolicy.shouldSense(false, CallAudioRouteKind.Speaker)).isFalse()
        assertThat(CallProximityPolicy.shouldSense(true, CallAudioRouteKind.Earpiece)).isFalse()
        assertThat(CallProximityPolicy.shouldSense(false, CallAudioRouteKind.Bluetooth)).isFalse()
    }
}
