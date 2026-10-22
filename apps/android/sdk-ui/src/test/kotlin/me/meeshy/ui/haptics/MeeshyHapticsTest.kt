package me.meeshy.ui.haptics

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.feedback.HapticKind
import me.meeshy.sdk.feedback.HapticSink
import me.meeshy.sdk.feedback.HapticSurfacing
import org.junit.Test

class MeeshyHapticsTest {
    private class Recorder : HapticSink {
        val received = mutableListOf<Int>()
        override fun perform(feedbackConstant: Int) { received += feedbackConstant }
    }

    private fun haptics(recorder: Recorder, sdkInt: Int = 35) =
        MeeshyHaptics(HapticSurfacing(recorder, sdkInt))

    @Test fun `chaque methode produit exactement la constante de sa nature`() {
        val cases: List<Pair<(MeeshyHaptics) -> Unit, HapticKind>> = listOf(
            { h: MeeshyHaptics -> h.light() } to HapticKind.LIGHT,
            { h: MeeshyHaptics -> h.medium() } to HapticKind.MEDIUM,
            { h: MeeshyHaptics -> h.heavy() } to HapticKind.HEAVY,
            { h: MeeshyHaptics -> h.success() } to HapticKind.SUCCESS,
            { h: MeeshyHaptics -> h.error() } to HapticKind.ERROR,
        )
        cases.forEach { (call, kind) ->
            val recorder = Recorder()
            call(haptics(recorder))
            assertThat(recorder.received).containsExactly(HapticSurfacing.constantFor(kind, 35))
        }
    }

    @Test fun `aucune nature n est sans constante`() {
        HapticKind.values().forEach { kind ->
            assertThat(HapticSurfacing.constantFor(kind, 26)).isAtLeast(0)
        }
    }
}
