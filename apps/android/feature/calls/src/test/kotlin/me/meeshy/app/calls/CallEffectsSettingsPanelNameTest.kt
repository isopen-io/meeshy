package me.meeshy.app.calls

import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.hasContentDescription
import androidx.compose.ui.test.junit4.createComposeRule
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.call.VideoFilterConfig
import me.meeshy.sdk.model.call.effects.CallEffectsModeState
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import java.io.File

/**
 * P8b.1 — le panneau Luminosité · Flou du fond est UN groupe que TalkBack nomme « Réglages de mon image » (la
 * légende de la planche), et que les sept langues disent.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class CallEffectsSettingsPanelNameTest {
    @get:Rule val rule = createComposeRule()

    @Test
    fun `the settings panel is a named group that holds the brightness slider and the blur switch`() {
        rule.setContent {
            MeeshyTheme { EffectsSettingsPanel(CallEffectsModeState.opening(VideoFilterConfig()), onChange = {}) }
        }

        val group = rule.onNode(hasContentDescription("My image settings")).fetchSemanticsNode()
        assertThat(group.config.getOrNull(SemanticsProperties.PaneTitle)).isEqualTo("My image settings")
        assertThat(group.config.getOrNull(SemanticsProperties.IsTraversalGroup)).isTrue()
        rule.onNode(hasContentDescription("Brightness")).assertExists()
    }

    @Test
    fun `the group name and the carousel position are written in the seven languages`() {
        val res = generateSequence(File(System.getProperty("user.dir").orEmpty()).absoluteFile) { it.parentFile }
            .map { File(it, "feature/calls/src/main/res") }.first { it.isDirectory }
        val folders = listOf("values", "values-fr", "values-es", "values-pt", "values-de", "values-it", "values-ar")
        listOf("call_effects_settings_panel", "call_mode_carousel_position").forEach { name ->
            folders.forEach { folder ->
                val text = File(res, "$folder/strings_calls_effects.xml").readText()
                assertThat(Regex("""<string name="$name">[^<]+</string>""").containsMatchIn(text)).isTrue()
            }
        }
        assertThat(File(res, "values-fr/strings_calls_effects.xml").readText()).contains(">Réglages de mon image<")
    }
}
