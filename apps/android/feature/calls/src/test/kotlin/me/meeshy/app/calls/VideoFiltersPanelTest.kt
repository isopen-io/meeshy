package me.meeshy.app.calls

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.semantics.getOrNull
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.call.VideoFilterConfig
import me.meeshy.sdk.model.call.VideoFilterPreset
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class VideoFiltersPanelTest {
    @get:Rule val rule = createComposeRule()

    private fun show(initial: VideoFilterConfig, degraded: Boolean = false, seen: (VideoFilterConfig) -> Unit = {}) {
        rule.setContent {
            var config by androidx.compose.runtime.remember { mutableStateOf(initial) }
            MeeshyTheme {
                VideoFiltersPanel(config, degraded, { config = it; seen(it) })
            }
        }
    }

    @Test
    fun `the active preset chip is selected and the others are not`() {
        show(VideoFilterPreset.Warm.config)
        val selected = { text: String ->
            rule.onNodeWithText(text).fetchSemanticsNode().config.getOrNull(SemanticsProperties.Selected)
        }
        assertThat(selected("Warm")).isTrue()
        assertThat(selected("Cool")).isFalse()
    }

    @Test
    fun `tapping a preset applies its colorimetry and keeps the blur`() {
        var last: VideoFilterConfig? = null
        show(VideoFilterConfig(backgroundBlurEnabled = true)) { last = it }
        rule.onNodeWithText("Vivid").performClick()
        assertThat(last?.saturation).isEqualTo(VideoFilterPreset.Vivid.config.saturation)
        assertThat(last?.backgroundBlurEnabled).isTrue()
    }

    @Test
    fun `reset appears only with a look and turns the colorimetry off`() {
        rule.setContent { MeeshyTheme { VideoFiltersPanel(VideoFilterConfig.DEFAULT, false, {}) } }
        rule.onNodeWithText("Reset").assertDoesNotExist()
    }

    @Test
    fun `reset restores the neutral look`() {
        var last: VideoFilterConfig? = null
        show(VideoFilterPreset.Cool.config) { last = it }
        rule.onNodeWithText("Reset").performClick()
        assertThat(last?.isEnabled).isFalse()
    }

    @Test
    fun `the performance indicator shows only when auto degraded`() {
        show(VideoFilterConfig.DEFAULT, degraded = false)
        rule.onNodeWithText("Reduced performance — some filters disabled").assertDoesNotExist()
    }

    @Test
    fun `the performance indicator is shown when auto degraded`() {
        show(VideoFilterConfig.DEFAULT, degraded = true)
        rule.onNodeWithText("Reduced performance — some filters disabled").assertExists()
    }

    @Test
    fun `the blur radius slider appears with the blur toggle`() {
        show(VideoFilterConfig(backgroundBlurEnabled = true))
        rule.onNodeWithText("Radius").assertExists()
    }
}
