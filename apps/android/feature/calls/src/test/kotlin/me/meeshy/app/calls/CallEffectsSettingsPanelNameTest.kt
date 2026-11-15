package me.meeshy.app.calls

import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.semantics.getOrNull
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

    /**
     * #18246 — le nom du groupe et le rang du carrousel sont les clés du catalogue iOS (`call.mode.effects.settings.panel`,
     * `call.mode.carousel.position`, #18197) : adoptées par le manifeste, générées dans les sept langues, et plus écrites à la
     * main côté Android (ce témoin évolue : il lisait `strings_calls_effects.xml`).
     */
    @Test
    fun `the group name and the carousel position are the iOS catalog keys, generated in the seven languages`() {
        val android = generateSequence(File(System.getProperty("user.dir").orEmpty()).absoluteFile) { it.parentFile }
            .first { File(it, "feature/calls/src/main/res").isDirectory }
        val res = File(android, "feature/calls/src/main/res")
        val folders = listOf("values", "values-fr", "values-es", "values-pt", "values-de", "values-it", "values-ar")
        listOf("call_effects_settings_panel", "call_mode_carousel_position").forEach { name ->
            folders.forEach { folder ->
                val generated = File(res, "$folder/strings_generated.xml").readText()
                assertThat(Regex("""<string name="$name">[^<]+</string>""").containsMatchIn(generated)).isTrue()
                assertThat(File(res, "$folder/strings_calls_effects.xml").readText()).doesNotContain("name=\"$name\"")
            }
        }
        assertThat(File(res, "values-fr/strings_generated.xml").readText()).contains(">Réglages de mon image<")
        assertThat(File(res, "values-fr/strings_generated.xml").readText()).contains("<string name=\"call_mode_carousel_position\">%1\$d sur %2\$d<")
        val manifest = File(android, "i18n/manifest/calls.d/calls-effects-mode.json").readText().replace(Regex("""\s+"""), "")
        assertThat(manifest).contains("\"iosKey\":\"call.mode.effects.settings.panel\",\"androidName\":\"call_effects_settings_panel\",\"status\":\"adopted\"")
        assertThat(manifest).contains("\"iosKey\":\"call.mode.carousel.position\",\"androidName\":\"call_mode_carousel_position\",\"status\":\"adopted\"")
    }
}
