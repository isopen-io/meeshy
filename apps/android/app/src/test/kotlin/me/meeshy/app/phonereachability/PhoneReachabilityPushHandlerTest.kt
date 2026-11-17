package me.meeshy.app.phonereachability

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import me.meeshy.app.push.IncomingPush
import me.meeshy.sdk.phonereachability.PhoneReachabilityForegroundNotice
import me.meeshy.sdk.phonereachability.PhoneReachabilityForegroundNotices
import org.junit.Test

/**
 * La sonde silencieuse reçoit un signe de vie, et app ouverte l'annonce du téléphone injoignable passe par la SyncPill
 * À LA PLACE de la bannière, jamais les deux (#18737).
 */
class PhoneReachabilityPushHandlerTest {
    private fun push(vararg pairs: Pair<String, String>) = IncomingPush.of(mapOf(*pairs))

    private val announcement = push(
        "type" to "device_unreachable",
        "notificationId" to "n1",
        "title" to "Ada",
        "body" to "Le téléphone d'Ada est injoignable depuis 14:10",
    )

    @Test
    fun `une sonde repond par un signe de vie, meme app fermee`() {
        var answers = 0
        val handler = PhoneReachabilityPushHandler(PhoneReachabilityForegroundNotices(), { false }) { answers += 1 }
        assertThat(handler.handle(push("type" to "device_probe", "requestedAt" to "2026-11-15T10:00:00.000Z"))).isTrue()
        assertThat(answers).isEqualTo(1)
    }

    @Test
    fun `app ouverte avec une pastille, l'annonce defile et la banniere ne part pas`() = runTest {
        val notices = PhoneReachabilityForegroundNotices()
        val handler = PhoneReachabilityPushHandler(notices, { true }) {}
        var received: PhoneReachabilityForegroundNotice? = null
        val job = launch(UnconfinedTestDispatcher(testScheduler)) { received = notices.notices.first() }

        assertThat(handler.handle(announcement)).isTrue()
        runCurrent()
        assertThat(received).isEqualTo(
            PhoneReachabilityForegroundNotice("phone:push:n1", "Ada · Le téléphone d'Ada est injoignable depuis 14:10"),
        )
        job.cancel()
    }

    @Test
    fun `app fermee ou sans pastille, la banniere part`() {
        assertThat(PhoneReachabilityPushHandler(PhoneReachabilityForegroundNotices(), { false }) {}.handle(announcement)).isFalse()
        assertThat(PhoneReachabilityPushHandler(PhoneReachabilityForegroundNotices(), { true }) {}.handle(announcement)).isFalse()
    }

    @Test
    fun `un autre push n'est pas le sien`() {
        var answers = 0
        val handler = PhoneReachabilityPushHandler(PhoneReachabilityForegroundNotices(), { true }) { answers += 1 }
        assertThat(handler.handle(push("type" to "battery_pull"))).isFalse()
        assertThat(handler.handle(push("type" to "new_message"))).isFalse()
        assertThat(answers).isEqualTo(0)
    }
}
