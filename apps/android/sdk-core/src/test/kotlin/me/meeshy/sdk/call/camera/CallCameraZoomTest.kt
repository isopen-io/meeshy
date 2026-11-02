package me.meeshy.sdk.call.camera

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.call.camera.CameraLens
import me.meeshy.sdk.model.call.camera.CameraZoomPolicy
import me.meeshy.sdk.model.call.camera.CameraZoomStep
import org.junit.Test

class CallCameraZoomTest {
    private class FakeActuator : CameraZoomActuator {
        val crops = mutableListOf<Pair<Float, Float?>>()
        val opened = mutableListOf<String>()
        override fun setCrop(zoom: Float, rampRate: Float?) { crops += zoom to rampRate }
        override fun openLens(lensId: String) { opened += lensId }
    }

    private val triple = CameraZoomPolicy.profile(
        listOf(CameraLens("w", 0.5f), CameraLens("m", 1f), CameraLens("t", 3f)), isFront = false, maxDigitalZoom = 10f,
    )

    private fun attached(): Pair<CallCameraZoom, FakeActuator> {
        val actuator = FakeActuator()
        return CallCameraZoom(actuator).also { it.attach(triple, activeLensId = "m") } to actuator
    }

    @Test
    fun `attach ouvre sur le grand-angle a 1x sans rampe, sans rouvrir la camera`() {
        val (zoom, actuator) = attached()
        assertThat(zoom.state.value.displayFactor).isEqualTo(1f)
        assertThat(actuator.crops.last()).isEqualTo(1f to null)
        assertThat(actuator.opened).isEmpty()
    }

    @Test
    fun `un appareil sans zoom ne fait rien`() {
        val actuator = FakeActuator()
        val zoom = CallCameraZoom(actuator).also { it.attach(null, null) }
        zoom.updatePinch(2f)
        zoom.select(2f)
        zoom.cycleQuickStop()
        assertThat(zoom.state.value.isZoomable).isFalse()
        assertThat(actuator.crops).isEmpty()
    }

    @Test
    fun `une pastille d'objectif rouvre la camera sur cet objectif sans recadrer`() {
        val (zoom, actuator) = attached()
        zoom.select(3f)
        assertThat(actuator.opened).containsExactly("t")
        assertThat(actuator.crops.last()).isEqualTo(1f to CameraZoomPolicy.SETTLE_RAMP_RATE)
        assertThat(zoom.state.value.displayFactor).isEqualTo(3f)
    }

    @Test
    fun `la pastille 2x recadre le grand-angle sans rouvrir la camera`() {
        val (zoom, actuator) = attached()
        zoom.select(2f)
        assertThat(actuator.opened).isEmpty()
        assertThat(actuator.crops.last()).isEqualTo(2f to CameraZoomPolicy.SETTLE_RAMP_RATE)
    }

    @Test
    fun `le pincement multiplie le facteur du debut du geste et suit le doigt`() {
        val (zoom, actuator) = attached()
        zoom.updatePinch(2f)
        assertThat(zoom.state.value.displayFactor).isEqualTo(2f)
        assertThat(zoom.state.value.isPinching).isTrue()
        assertThat(actuator.crops.last()).isEqualTo(2f to CameraZoomPolicy.PINCH_RAMP_RATE)
        zoom.updatePinch(3f)
        assertThat(zoom.state.value.displayFactor).isEqualTo(3f)
    }

    @Test
    fun `pincer ne change jamais d'objectif sous les doigts, le relacher s'aimante`() {
        val (zoom, actuator) = attached()
        zoom.updatePinch(2.9f)
        assertThat(actuator.opened).isEmpty()
        zoom.endPinch()
        assertThat(zoom.state.value.isPinching).isFalse()
        assertThat(zoom.state.value.displayFactor).isEqualTo(3f)
        assertThat(actuator.opened).containsExactly("t")
    }

    @Test
    fun `pincer vers l'arriere ne descend pas sous l'objectif ouvert`() {
        val (zoom, actuator) = attached()
        zoom.updatePinch(0.4f)
        assertThat(zoom.state.value.displayFactor).isEqualTo(1f)
        assertThat(actuator.opened).isEmpty()
    }

    @Test
    fun `le retour a 1x ramene au grand-angle`() {
        val (zoom, actuator) = attached()
        zoom.select(3f)
        zoom.resetToBaseline()
        assertThat(zoom.state.value.displayFactor).isEqualTo(1f)
        assertThat(actuator.opened).containsExactly("t", "m").inOrder()
    }

    @Test
    fun `le bouton de pastilles passe au suivant puis boucle au plus large`() {
        val (zoom, _) = attached()
        zoom.cycleQuickStop()
        assertThat(zoom.state.value.displayFactor).isEqualTo(2f)
        zoom.cycleQuickStop()
        assertThat(zoom.state.value.displayFactor).isEqualTo(3f)
        zoom.cycleQuickStop()
        assertThat(zoom.state.value.displayFactor).isEqualTo(0.5f)
    }

    @Test
    fun `les crans montent et descendent`() {
        val (zoom, _) = attached()
        zoom.step(CameraZoomStep.Increment)
        assertThat(zoom.state.value.displayFactor).isEqualTo(2f)
        zoom.step(CameraZoomStep.Decrement)
        zoom.step(CameraZoomStep.Decrement)
        assertThat(zoom.state.value.displayFactor).isEqualTo(0.5f)
    }

    @Test
    fun `une nouvelle camera repart a 1x et detach oublie tout`() {
        val (zoom, actuator) = attached()
        zoom.select(2f)
        zoom.attach(triple, activeLensId = "m")
        assertThat(zoom.state.value.displayFactor).isEqualTo(1f)
        assertThat(actuator.crops.last()).isEqualTo(1f to null)
        zoom.detach()
        assertThat(zoom.state.value.profile).isNull()
        val before = actuator.crops.size
        zoom.select(2f)
        assertThat(actuator.crops.size).isEqualTo(before)
    }
}
