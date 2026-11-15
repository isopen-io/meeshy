package me.meeshy.sdk.feedback

import android.view.HapticFeedbackConstants
import com.google.common.truth.Truth.assertThat
import org.junit.Test

class HapticSurfacingTest {
    private class FakeSink : HapticSink {
        val received = mutableListOf<Int>()
        override fun perform(feedbackConstant: Int) { received += feedbackConstant }
    }

    @Test fun `chaque nature est transmise a la destination`() {
        val sink = FakeSink()
        val haptics = HapticSurfacing(sink, sdkInt = 35)
        HapticKind.values().forEach(haptics::perform)
        assertThat(sink.received).hasSize(HapticKind.values().size)
    }

    @Test fun `succes et erreur utilisent confirmer et refuser des l API 30`() {
        assertThat(HapticSurfacing.constantFor(HapticKind.SUCCESS, 30)).isEqualTo(HapticFeedbackConstants.CONFIRM)
        assertThat(HapticSurfacing.constantFor(HapticKind.ERROR, 30)).isEqualTo(HapticFeedbackConstants.REJECT)
    }

    @Test fun `sous l API 30 succes et erreur retombent sur des constantes anciennes`() {
        assertThat(HapticSurfacing.constantFor(HapticKind.SUCCESS, 26)).isEqualTo(HapticFeedbackConstants.CONTEXT_CLICK)
        assertThat(HapticSurfacing.constantFor(HapticKind.ERROR, 29)).isEqualTo(HapticFeedbackConstants.LONG_PRESS)
    }

    @Test fun `la selection garde le cran segmente derriere l API 34`() {
        assertThat(HapticSurfacing.constantFor(HapticKind.SELECTION, 34)).isEqualTo(HapticFeedbackConstants.SEGMENT_FREQUENT_TICK)
        assertThat(HapticSurfacing.constantFor(HapticKind.SELECTION, 33)).isEqualTo(HapticFeedbackConstants.CLOCK_TICK)
    }
}
