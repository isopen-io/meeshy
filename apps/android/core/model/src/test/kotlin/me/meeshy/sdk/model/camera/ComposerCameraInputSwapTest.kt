package me.meeshy.sdk.model.camera

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.camera.ComposerCameraInputSwap.Outcome
import me.meeshy.sdk.model.composer.capture.CaptureLensFacing
import org.junit.Test

class ComposerCameraInputSwapTest {
    private class FakeGraph(private val accepts: Set<String>) : ComposerCaptureInputGraph<String> {
        val inputs = mutableSetOf<String>()
        val log = mutableListOf<String>()
        override fun beginConfiguration() { log += "begin" }
        override fun commitConfiguration() { log += "commit" }
        override fun removeInput(input: String) { inputs -= input; log += "remove $input" }
        override fun canAddInput(input: String) = input in accepts
        override fun addInput(input: String): Boolean { inputs += input; log += "add $input"; return true }
    }

    @Test
    fun `la nouvelle entree remplace l'ancienne dans une seule configuration`() {
        val graph = FakeGraph(accepts = setOf("front")).apply { inputs += "back" }
        var seen: Outcome? = null
        val outcome = ComposerCameraInputSwap.swap(graph, "back", "front") { seen = it }
        assertThat(outcome).isEqualTo(Outcome.SWAPPED)
        assertThat(seen).isEqualTo(Outcome.SWAPPED)
        assertThat(graph.inputs).containsExactly("front")
        assertThat(graph.log).containsExactly("begin", "remove back", "add front", "commit").inOrder()
    }

    @Test
    fun `un refus remet l'ancienne entree en place`() {
        val graph = FakeGraph(accepts = emptySet()).apply { inputs += "back" }
        val outcome = ComposerCameraInputSwap.swap(graph, "back", "front")
        assertThat(outcome).isEqualTo(Outcome.KEPT)
        assertThat(graph.inputs).containsExactly("back")
        assertThat(graph.log.last()).isEqualTo("commit")
    }

    @Test
    fun `un refus sans ancienne entree ne laisse aucune entree`() {
        val graph = FakeGraph(accepts = emptySet())
        assertThat(ComposerCameraInputSwap.swap(graph, null, "front")).isEqualTo(Outcome.NONE)
        assertThat(graph.inputs).isEmpty()
    }

    @Test
    fun `une entree qui ne naissait pas ne touche pas a la session`() {
        val graph = FakeGraph(accepts = setOf("x")).apply { inputs += "back" }
        assertThat(ComposerCameraInputSwap.swap(graph, "back", null)).isEqualTo(Outcome.KEPT)
        assertThat(ComposerCameraInputSwap.swap(graph, null, null)).isEqualTo(Outcome.NONE)
        assertThat(graph.log).isEmpty()
        assertThat(graph.inputs).containsExactly("back")
    }

    @Test
    fun `la position publiee reste juste apres un refus`() {
        val front = CaptureLensFacing.FRONT
        val back = CaptureLensFacing.BACK
        assertThat(ComposerCameraInputSwap.publishedPosition(Outcome.SWAPPED, front, back)).isEqualTo(front)
        assertThat(ComposerCameraInputSwap.publishedPosition(Outcome.KEPT, front, back)).isEqualTo(back)
        assertThat(ComposerCameraInputSwap.publishedPosition(Outcome.NONE, front, null)).isNull()
    }
}
