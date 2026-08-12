package me.meeshy.ui.component

import com.google.common.truth.Truth.assertThat
import me.meeshy.ui.theme.MeeshyPalette
import org.junit.Test

/** Parity plan §4.6: the feedback toast tints by severity — success/error/info. */
class MeeshyToastTest {

    @Test
    fun `success feedback is the success green`() {
        assertThat(feedbackAccentColor(FeedbackKind.Success)).isEqualTo(MeeshyPalette.Success)
    }

    @Test
    fun `error feedback is the error colour`() {
        assertThat(feedbackAccentColor(FeedbackKind.Error)).isEqualTo(MeeshyPalette.Error)
    }

    @Test
    fun `info feedback is the info colour`() {
        assertThat(feedbackAccentColor(FeedbackKind.Info)).isEqualTo(MeeshyPalette.Info)
    }
}
