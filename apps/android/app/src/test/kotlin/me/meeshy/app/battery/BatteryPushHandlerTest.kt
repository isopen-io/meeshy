package me.meeshy.app.battery

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.runTest
import me.meeshy.app.push.IncomingPush
import me.meeshy.sdk.battery.BatteryForegroundNotice
import me.meeshy.sdk.battery.BatteryForegroundNotices
import org.junit.Test

/** App ouverte, l'annonce de batterie passe par la SyncPill À LA PLACE de la bannière, jamais les deux (#14147). */
class BatteryPushHandlerTest {
    private fun push(vararg pairs: Pair<String, String>) = IncomingPush.of(mapOf(*pairs))

    private val announcement = push("type" to "device_battery", "notificationId" to "n1", "title" to "Alice", "body" to "5 %")

    @Test
    fun `app ouverte avec une pastille, l'annonce defile et la banniere ne part pas`() = runTest {
        val notices = BatteryForegroundNotices()
        val handler = BatteryPushHandler(notices, { true }, {})
        var received: BatteryForegroundNotice? = null
        val job = launch(UnconfinedTestDispatcher(testScheduler)) { received = notices.notices.first() }

        assertThat(handler.handle(announcement)).isTrue()
        assertThat(received).isEqualTo(BatteryForegroundNotice("battery:push:n1", "Alice · 5 %"))
        job.cancel()
    }

    @Test
    fun `app fermee ou sans pastille, la banniere part`() {
        assertThat(BatteryPushHandler(BatteryForegroundNotices(), { false }, {}).handle(announcement)).isFalse()
        assertThat(BatteryPushHandler(BatteryForegroundNotices(), { true }, {}).handle(announcement)).isFalse()
    }

    @Test
    fun `un autre push n'est pas le sien`() {
        assertThat(BatteryPushHandler(BatteryForegroundNotices(), { true }, {}).handle(push("type" to "new_message"))).isFalse()
    }
}
