package me.meeshy.app.navigation

import com.google.common.truth.Truth.assertThat
import me.meeshy.app.navigation.graph.PersonMapDestinations
import me.meeshy.sdk.model.push.PushPayload
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/** Toucher l'alerte « un Sang s'approche » (#20540), app tuée comme ouverte : la carte de l'autre Sang. */
@RunWith(RobolectricTestRunner::class)
@Config(application = android.app.Application::class, sdk = [34])
class LaunchRouterBloodProximityTest {

    private fun tapRoute(vararg data: Pair<String, String>): String? =
        LaunchRouter.route(LaunchExtras(tap = PushPayload.decode(mapOf(*data))))

    @Test
    fun `le toucher du push ouvre la carte de l autre Sang`() {
        assertThat(tapRoute("type" to "blood_proximity", "userId" to "u-lina", "senderId" to "u-lina"))
            .isEqualTo(PersonMapDestinations.route("u-lina"))
    }

    @Test
    fun `la route de la carte se lit par son patron`() {
        assertThat(PersonMapDestinations.route("u-lina")).isEqualTo("location/person/u-lina")
        assertThat(PersonMapDestinations.ROUTE).isEqualTo("location/person/{userId}")
    }

    @Test
    fun `la cle userId voyage dans l intent du toucher`() {
        val intent = android.content.Intent()
        me.meeshy.app.push.PushTapExtras.put(intent, mapOf("type" to "blood_proximity", "userId" to "u-lina"))

        assertThat(me.meeshy.app.push.PushTapExtras.read(intent).first.userId).isEqualTo("u-lina")
    }
}
