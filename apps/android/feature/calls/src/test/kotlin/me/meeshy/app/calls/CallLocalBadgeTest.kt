package me.meeshy.app.calls

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/** #12569 : la pastille locale de l'appel porte MON nom et MA photo, pas l'initiale du mot « Vous ». */
class CallLocalBadgeTest {

    @Test
    fun `la pastille prend mon nom de session`() {
        val peer = CallPeerVisual(selfName = "Gaëlle Mboula", selfAvatarUrl = "https://gate.meeshy.me/me.png")

        assertThat(peer.localBadgeName(fallback = "Vous")).isEqualTo("Gaëlle Mboula")
        assertThat(peer.selfAvatarUrl).isEqualTo("https://gate.meeshy.me/me.png")
    }

    @Test
    fun `sans session lisible la pastille retombe sur le mot de repli`() {
        assertThat(CallPeerVisual.EMPTY.localBadgeName(fallback = "Vous")).isEqualTo("Vous")
        assertThat(CallPeerVisual(selfName = "  ").localBadgeName(fallback = "Vous")).isEqualTo("Vous")
    }
}
