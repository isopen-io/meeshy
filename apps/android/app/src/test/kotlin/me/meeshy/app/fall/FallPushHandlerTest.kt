package me.meeshy.app.fall

import com.google.common.truth.Truth.assertThat
import me.meeshy.app.push.IncomingPush
import org.junit.Test

/**
 * L'alerte de sécurité poussée (#18748) : app ouverte, ni l'alerte ni sa levée ne font de bannière (la socket a parlé) ;
 * la levée retire l'état de la personne nommée, app ouverte ou fermée ; tout autre push passe son chemin.
 */
class FallPushHandlerTest {
    private val awa = "64b7f0c2a1b2c3d4e5f60718"
    private val cleared = mutableListOf<String>()

    private fun handler(open: Boolean) = FallPushHandler({ cleared += it }) { open }

    private fun push(vararg pairs: Pair<String, String>) = IncomingPush.of(mapOf(*pairs))

    @Test
    fun `app ouverte, l'alerte est avalee et ne retire rien`() {
        assertThat(handler(open = true).handle(push("type" to "safety_alert", "userId" to awa))).isTrue()
        assertThat(cleared).isEmpty()
    }

    @Test
    fun `app fermee, l'alerte part en banniere`() {
        assertThat(handler(open = false).handle(push("type" to "safety_alert", "userId" to awa))).isFalse()
    }

    @Test
    fun `la levee retire l'etat, et ne fait de banniere que l'app fermee`() {
        assertThat(handler(open = true).handle(push("type" to "safety_alert_cleared", "userId" to awa))).isTrue()
        assertThat(handler(open = false).handle(push("type" to "safety_alert_cleared", "userId" to awa))).isFalse()
        assertThat(cleared).containsExactly(awa, awa)
    }

    @Test
    fun `un autre push n'est pas touche`() {
        assertThat(handler(open = true).handle(push("type" to "new_message", "userId" to awa))).isFalse()
        assertThat(cleared).isEmpty()
    }
}
