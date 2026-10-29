package me.meeshy.app.calls

import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assert
import androidx.compose.ui.test.hasContentDescription
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.call.VideoFilterConfig
import me.meeshy.sdk.model.call.effects.CallEffectsCategory
import me.meeshy.sdk.model.call.effects.CallEffectsModeState
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class CallEffectsCarouselTest {
    @get:Rule val rule = createComposeRule()

    private fun opening() = CallEffectsModeState.opening(VideoFilterConfig())

    private fun carousel(title: String) = rule.onNode(hasContentDescription(title))

    private fun actions(title: String): List<String> =
        carousel(title).fetchSemanticsNode().config.getOrElse(SemanticsActions.CustomActions) { emptyList() }.map { it.label }

    private fun action(title: String, label: String): () -> Boolean =
        carousel(title).fetchSemanticsNode().config[SemanticsActions.CustomActions].first { it.label == label }.action

    @Test
    fun `l'effet centre se photographie et se filme depuis le carrousel, TalkBack trouve les deux prises`() {
        var photos = 0
        var films = 0
        rule.setContent {
            MeeshyTheme {
                EffectsCarousel(
                    mode = opening(),
                    reduceMotion = true,
                    shots = CallModeShots(isRecording = false, onCapturePhoto = { photos++ }, onStartRecording = { films++ }),
                    hint = "Double tap: photo · Long press: video",
                    onChange = {},
                )
            }
        }

        assertThat(actions("Face")).containsAtLeast("Take a photo", "Record")
        rule.onNodeWithText("Double tap: photo · Long press: video", useUnmergedTree = true).assertExists()
        rule.runOnIdle { action("Face", "Take a photo")() }
        rule.runOnIdle { action("Face", "Record")() }

        assertThat(photos).isEqualTo(1)
        assertThat(films).isEqualTo(1)
    }

    @Test
    fun `la couleur porte les memes prises, et pendant le film le carrousel dit qu'il filme sans les reproposer`() {
        val color = opening().showing(CallEffectsCategory.Color)
        rule.setContent {
            MeeshyTheme {
                EffectsCarousel(
                    mode = color,
                    reduceMotion = true,
                    shots = CallModeShots(isRecording = true, onCapturePhoto = {}, onStartRecording = {}),
                    hint = null,
                    onChange = {},
                )
            }
        }

        carousel("Colour").assert(SemanticsMatcher.expectValue(SemanticsProperties.StateDescription, "Recording"))
        assertThat(actions("Colour")).containsNoneOf("Take a photo", "Record")
        rule.onNodeWithText("Double tap: photo · Long press: video", useUnmergedTree = true).assertDoesNotExist()
    }

    @Test
    fun `la scene d'un mode ne porte aucune prise, seul le carrousel se declenche`() {
        val capture = CallCaptureController(
            frames = io.mockk.mockk(relaxed = true),
            painter = { _, _, _, _ -> null },
            saver = io.mockk.mockk(relaxed = true),
            recorders = { io.mockk.mockk(relaxed = true) },
            scope = kotlinx.coroutines.CoroutineScope(kotlinx.coroutines.Dispatchers.Unconfined),
            clock = { 0L },
            stamp = { "STAMP" },
        )
        rule.setContent { MeeshyTheme { CallMontageCaptureLayer(capture, emptyMap(), reduceMotion = true) } }

        assertThat(actions("Montage preview")).isEmpty()
        rule.onNodeWithText("Double tap: photo · Long press: video", useUnmergedTree = true).assertDoesNotExist()
    }
}
