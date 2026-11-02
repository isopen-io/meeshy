package me.meeshy.sdk.call

import android.content.Context
import com.google.common.truth.Truth.assertThat
import io.mockk.mockk
import org.junit.Test
import org.webrtc.PeerConnectionFactory

class WebRtcEngineLazyInitTest {

    private class Rig {
        var builds = 0
        val gate = CallActivityGate()
        val engine = WebRtcEngine(
            appContext = mockk<Context>(relaxed = true),
            stackProvider = {
                builds++
                WebRtcStack(InertEglBase(), mockk<PeerConnectionFactory>(relaxed = true))
            },
            activityGate = gate,
        )
    }

    @Test
    fun `instancier le moteur ne construit aucune pile WebRTC`() {
        val rig = Rig()

        assertThat(rig.builds).isEqualTo(0)
        assertThat(rig.engine.isStackBuilt).isFalse()
        assertThat(rig.gate.isActive).isFalse()
    }

    @Test
    fun `fermer sans appel ne construit rien non plus`() {
        val rig = Rig()

        rig.engine.close()
        rig.engine.setAudioEnabled(false)

        assertThat(rig.builds).isEqualTo(0)
    }

    @Test
    fun `la pile nait a la première lecture d'eglBase et une seule fois`() {
        val rig = Rig()

        rig.engine.eglBase
        rig.engine.eglBase

        assertThat(rig.builds).isEqualTo(1)
        assertThat(rig.engine.isStackBuilt).isTrue()
    }
}
