package me.meeshy.app.inactivity

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import me.meeshy.app.push.IncomingPush
import me.meeshy.sdk.inactivity.InactivityForegroundNotice
import me.meeshy.sdk.inactivity.InactivityForegroundNotices
import org.junit.Test

/**
 * App ouverte, l'alerte d'inactivité d'un Sang passe par la SyncPill À LA PLACE de la bannière, jamais les deux ; la
 * question « Tout va bien ? » part TOUJOURS en bannière, avec son action « Je vais bien » (#18738).
 */
class InactivityPushHandlerTest {
    private fun push(vararg pairs: Pair<String, String>) = IncomingPush.of(mapOf(*pairs))

    private val alert = push(
        "type" to "inactivity_alert",
        "notificationId" to "n1",
        "senderId" to "jacques",
        "title" to "Jacques n'a pas répondu à « Tout va bien ? »",
        "body" to "Aucune activité depuis 12 h",
    )

    @Test
    fun `app ouverte avec une pastille, l'alerte defile et la banniere ne part pas`() = runTest {
        val notices = InactivityForegroundNotices()
        val handler = InactivityPushHandler(notices) { true }
        var received: InactivityForegroundNotice? = null
        val job = launch(UnconfinedTestDispatcher(testScheduler)) { received = notices.notices.first() }

        assertThat(handler.handle(alert)).isTrue()
        runCurrent()
        assertThat(received).isEqualTo(
            InactivityForegroundNotice(
                "inactivity:push:n1",
                "Jacques n'a pas répondu à « Tout va bien ? » · Aucune activité depuis 12 h",
                personKey = "jacques",
            ),
        )
        job.cancel()
    }

    @Test
    fun `app fermee ou sans pastille, la banniere part`() {
        assertThat(InactivityPushHandler(InactivityForegroundNotices()) { false }.handle(alert)).isFalse()
        assertThat(InactivityPushHandler(InactivityForegroundNotices()) { true }.handle(alert)).isFalse()
    }

    @Test
    fun `la question tout va bien n'est jamais avalee par la pastille`() = runTest {
        val notices = InactivityForegroundNotices()
        val job = launch(UnconfinedTestDispatcher(testScheduler)) { notices.notices.first() }
        runCurrent()
        val handler = InactivityPushHandler(notices) { true }
        assertThat(handler.handle(push("type" to "wellness_check", "title" to "Tout va bien ?"))).isFalse()
        job.cancel()
    }

    @Test
    fun `un autre push n'est pas le sien`() {
        val handler = InactivityPushHandler(InactivityForegroundNotices()) { true }
        assertThat(handler.handle(push("type" to "device_unreachable"))).isFalse()
        assertThat(handler.handle(push("type" to "new_message"))).isFalse()
    }

    @Test
    fun `seule la question porte l'action je vais bien`() {
        assertThat(WellnessActionPlan.offersAction(push("type" to "wellness_check").payload)).isTrue()
        assertThat(WellnessActionPlan.offersAction(push("type" to "inactivity_alert").payload)).isFalse()
        assertThat(WellnessActionPlan.offersAction(push("type" to "new_message").payload)).isFalse()
    }
}
