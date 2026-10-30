package me.meeshy.app.stories

import android.content.Context
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.luminance
import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.semantics.getOrNull
import androidx.compose.ui.test.SemanticsNodeInteraction
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.text.TextLayoutResult
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import me.meeshy.feature.stories.R
import me.meeshy.sdk.model.composer.capture.SceneQuickCapture
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/**
 * Recette du compositeur « scène d'abord » sur appareil (2026-10-30) : ce que la scène et ses feuilles DISENT doit se lire
 * en entier, sur un téléphone de 360 dp (S8), et quelle que soit la couleur que l'auteur a donnée à la scène. Le rendu
 * natif mesure le texte comme l'appareil (le rendu par défaut de Robolectric le compte en caractères).
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], qualifiers = "fr-w360dp-h740dp-xxhdpi")
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class StoryComposerSceneLegibilityUiTest {

    @get:Rule
    val compose = createComposeRule()

    private fun string(id: Int): String = ApplicationProvider.getApplicationContext<Context>().getString(id)

    private fun SemanticsNodeInteraction.layout(): TextLayoutResult {
        val results = mutableListOf<TextLayoutResult>()
        fetchSemanticsNode().config.getOrNull(SemanticsActions.GetTextLayoutResult)?.action?.invoke(results)
        return results.single()
    }

    @Test
    fun `the empty scene hint is light ink with a shadow, legible on a dark scene as on a pale one`() {
        compose.setContent {
            MeeshyTheme { StorySceneCaptureHint(SceneQuickCapture.Offer(allowsPhoto = true, allowsVideo = true)) }
        }

        val style = compose.onNodeWithText(string(R.string.composer_capture_hint_tap_or_hold)).layout().layoutInput.style

        assertThat(style.color.luminance()).isGreaterThan(Color(0xFFBBBBBB).luminance())
        assertThat(style.shadow).isNotNull()
    }

    @Test
    fun `the three sound sources say their whole name on a 360 dp phone`() {
        compose.setContent {
            MeeshyTheme { StorySoundSources(onRecord = {}, onFiles = {}, onLibrary = {}) }
        }

        listOf(
            R.string.story_sound_sheet_source_record,
            R.string.story_sound_sheet_source_files,
            R.string.story_sound_sheet_source_library,
        ).forEach { label ->
            val layout = compose.onNodeWithText(string(label)).layout()
            assertThat(layout.multiParagraph.intrinsics.maxIntrinsicWidth).isAtMost(layout.layoutInput.constraints.maxWidth.toFloat())
        }
    }

    @Test
    fun `the sound sheet is dark like the scene, as the sheets that name the publication`() {
        val dark = StoryComposerSheet.entries.filter { it.isDarkOnScene }

        assertThat(dark).containsAtLeast(StoryComposerSheet.SOUND, StoryComposerSheet.MENTION, StoryComposerSheet.HASHTAGS, StoryComposerSheet.PLACE)
    }
}
