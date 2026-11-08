package me.meeshy.app.calls

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.call.CallState
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import org.junit.Test

class CallHoldControllerTest {

    private class FakeHost(
        override var isVideoCall: Boolean = true,
        override var userCameraOn: Boolean = true,
        override var survivalSuspended: Boolean = false,
        override var backgroundSuspended: Boolean = false,
        override var hidden: Boolean = false,
    ) : CallHoldHost {
        val log = mutableListOf<String>()
        override fun setCapture(enabled: Boolean) { log += "capture=$enabled" }
        override fun announceVideo(enabled: Boolean) { log += "announce=$enabled" }
        override fun adoptBackgroundSuspension() { log += "adopt" }
        override fun reevaluateLifecycle() { log += "reevaluate" }
        override fun onHoldChanged() { log += "changed" }
    }

    private class Rig(host: FakeHost = FakeHost()) {
        val host = host
        val clock = object : CallClock { override fun nowMs() = 0L }
        val toasts = CallToastBus(clock)
        val controller = CallHoldController(toasts, CallHoldWording { "blocked" }).also {
            it.attach(host)
            it.onTransition(CallState.Idle, CallState.Connected, CallSessionInfo("c", CallConfig.EMPTY))
        }
    }

    @Test
    fun `une attente du systeme coupe la video et previent le pair`() {
        val rig = Rig()

        rig.controller.onTelecomHold(true)

        assertThat(rig.controller.isOnHold.value).isTrue()
        assertThat(rig.host.log).containsExactly("capture=false", "announce=false", "changed").inOrder()
    }

    @Test
    fun `la reprise rallume la video et rejoue le cycle de vie`() {
        val rig = Rig()
        rig.controller.onTelecomHold(true)
        rig.host.log.clear()

        rig.controller.onTelecomHold(false)

        assertThat(rig.controller.isOnHold.value).isFalse()
        assertThat(rig.host.log).containsExactly("capture=true", "announce=true", "reevaluate", "changed").inOrder()
    }

    @Test
    fun `une perte transitoire du focus audio met aussi l appel en attente`() {
        val rig = Rig()

        rig.controller.onAudioFocus(false)
        assertThat(rig.controller.isOnHold.value).isTrue()
        rig.controller.onAudioFocus(true)
        assertThat(rig.controller.isOnHold.value).isFalse()
    }

    @Test
    fun `deux sources d attente ne reprennent que quand les deux sont levees`() {
        val rig = Rig()
        rig.controller.onTelecomHold(true)
        rig.controller.onAudioFocus(false)
        rig.host.log.clear()

        rig.controller.onTelecomHold(false)
        assertThat(rig.controller.isOnHold.value).isTrue()
        assertThat(rig.host.log).isEmpty()

        rig.controller.onAudioFocus(true)
        assertThat(rig.controller.isOnHold.value).isFalse()
    }

    @Test
    fun `un appel audio ou une camera eteinte ne dit rien au pair`() {
        val audio = Rig(FakeHost(isVideoCall = false))
        audio.controller.onTelecomHold(true)
        assertThat(audio.host.log).containsExactly("changed")

        val off = Rig(FakeHost(userCameraOn = false))
        off.controller.onTelecomHold(true)
        assertThat(off.host.log).containsExactly("changed")
    }

    @Test
    fun `la reprise en arriere-plan laisse la camera au cycle de vie`() {
        val rig = Rig()
        rig.controller.onTelecomHold(true)
        rig.host.hidden = true
        rig.host.log.clear()

        rig.controller.onTelecomHold(false)

        assertThat(rig.host.log).containsExactly("adopt", "reevaluate", "changed").inOrder()
    }

    @Test
    fun `la reprise attend la fin de la survie puis rallume la video`() {
        val rig = Rig()
        rig.controller.onTelecomHold(true)
        rig.host.survivalSuspended = true
        rig.host.log.clear()

        rig.controller.onTelecomHold(false)
        assertThat(rig.host.log).doesNotContain("capture=true")

        rig.host.survivalSuspended = false
        rig.controller.onSurvivalChanged(false)
        assertThat(rig.host.log).containsAtLeast("capture=true", "announce=true")
    }

    @Test
    fun `allumer la camera en attente est refuse avec le toast dedie`() = runBlocking {
        val rig = Rig()
        rig.controller.onTelecomHold(true)

        assertThat(rig.controller.refusesCameraActivation(enabling = true)).isTrue()

        assertThat(withTimeout(1_000) { rig.toasts.toasts.first() }.message).isEqualTo("blocked")
        assertThat(rig.controller.refusesCameraActivation(enabling = false)).isFalse()
    }

    @Test
    fun `hors attente la camera s allume librement`() {
        assertThat(Rig().controller.refusesCameraActivation(enabling = true)).isFalse()
    }

    @Test
    fun `la fin de l appel leve l attente`() {
        val rig = Rig()
        rig.controller.onTelecomHold(true)

        rig.controller.onTransition(CallState.Connected, CallState.Idle, CallSessionInfo("c", CallConfig.EMPTY))

        assertThat(rig.controller.isOnHold.value).isFalse()
    }

    @Test
    fun `une attente avant le debut de l appel est ignoree`() {
        val controller = CallHoldController(CallToastBus(object : CallClock { override fun nowMs() = 0L }), CallHoldWording { "x" })

        controller.onTelecomHold(true)

        assertThat(controller.isOnHold.value).isFalse()
    }
}
