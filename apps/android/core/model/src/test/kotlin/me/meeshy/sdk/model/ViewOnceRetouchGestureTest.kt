package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.BlurRevealLifecycle.ViewOnceStage
import org.junit.Test

/**
 * Retouching a revealed view-once text closes it ("(1) · Déjà ouvert") — port of iOS
 * `ViewOnceRetouchModifier` + `ConversationViewModel.closeViewOnce` (#7579).
 */
class ViewOnceRetouchGestureTest {

    @Test
    fun `no gesture is laid on a message that is not view once`() {
        ViewOnceStage.entries.forEach { stage ->
            assertThat(BlurRevealLifecycle.retouchGestureActive(isViewOnce = false, stage = stage)).isFalse()
        }
    }

    @Test
    fun `the gesture is only laid while a view once text is revealed`() {
        assertThat(BlurRevealLifecycle.retouchGestureActive(true, ViewOnceStage.Sealed)).isFalse()
        assertThat(BlurRevealLifecycle.retouchGestureActive(true, ViewOnceStage.Revealed)).isTrue()
        assertThat(BlurRevealLifecycle.retouchGestureActive(true, ViewOnceStage.Opened)).isFalse()
    }

    @Test
    fun `retouching a revealed text opens it once and consumes the server counter`() {
        val closure = BlurRevealLifecycle.close(ViewOnceStage.Revealed)
        assertThat(closure.stage).isEqualTo(ViewOnceStage.Opened)
        assertThat(closure.consume).isTrue()
    }

    @Test
    fun `the three doors firing together consume only once`() {
        val first = BlurRevealLifecycle.close(ViewOnceStage.Revealed)
        val second = BlurRevealLifecycle.close(first.stage)
        assertThat(second.stage).isEqualTo(ViewOnceStage.Opened)
        assertThat(second.consume).isFalse()
    }

    @Test
    fun `closing a sealed text neither opens nor consumes it`() {
        val closure = BlurRevealLifecycle.close(ViewOnceStage.Sealed)
        assertThat(closure.stage).isEqualTo(ViewOnceStage.Sealed)
        assertThat(closure.consume).isFalse()
    }

    @Test
    fun `a view once reveal moves sealed to revealed and never reopens an opened text`() {
        assertThat(BlurRevealLifecycle.reveal(ViewOnceStage.Sealed)).isEqualTo(ViewOnceStage.Revealed)
        assertThat(BlurRevealLifecycle.reveal(ViewOnceStage.Revealed)).isEqualTo(ViewOnceStage.Revealed)
        assertThat(BlurRevealLifecycle.reveal(ViewOnceStage.Opened)).isEqualTo(ViewOnceStage.Opened)
    }

    @Test
    fun `a view once text stays revealed until closed instead of timing out`() {
        assertThat(BlurRevealLifecycle.reconcealsOnTimeout(isViewOnce = true)).isFalse()
        assertThat(BlurRevealLifecycle.reconcealsOnTimeout(isViewOnce = false)).isTrue()
    }
}
