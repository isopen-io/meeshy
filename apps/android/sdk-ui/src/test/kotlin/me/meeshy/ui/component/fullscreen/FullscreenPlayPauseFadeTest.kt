package me.meeshy.ui.component.fullscreen

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.mutableStateOf
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.test.assertHasClickAction
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performSemanticsAction
import com.google.common.truth.Truth.assertThat
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * Le bouton lecture/pause central s'efface une seconde après le début de la lecture, revient au
 * toucher sur le média, reste visible en pause — et TalkBack l'atteint même effacé (#9577).
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class FullscreenPlayPauseFadeTest {

    @get:Rule
    val compose = createComposeRule()

    private class Stage {
        val isPlaying = mutableStateOf(true)
        var toggles = 0
        var mediaTaps = 0
        var isButtonVisible = true
    }

    private fun show(stage: Stage) {
        compose.mainClock.autoAdvance = false
        compose.setContent {
            MeeshyTheme {
                val fade = rememberFullscreenPlayPauseFade(isPlaying = stage.isPlaying.value)
                stage.isButtonVisible = fade.isVisible
                Box(Modifier.fillMaxSize()) {
                    Box(
                        Modifier
                            .fillMaxSize()
                            .testTag(MEDIA_TAG)
                            .clickable {
                                stage.mediaTaps++
                                fade.onMediaTap()
                            },
                    )
                    FullscreenPlayPauseButton(
                        isPlaying = stage.isPlaying.value,
                        visible = fade.isVisible,
                        onToggle = { stage.toggles++ },
                        modifier = Modifier.align(Alignment.Center),
                    )
                }
            }
        }
        compose.mainClock.advanceTimeByFrame()
    }

    private fun elapse(millis: Long) {
        compose.mainClock.advanceTimeBy(millis)
        compose.mainClock.advanceTimeByFrame()
    }

    @Test
    fun `au debut de la lecture le bouton est visible et ne porte pas de relais`() {
        show(Stage())

        compose.onNodeWithTag(PLAY_PAUSE_RELAY_TAG).assertDoesNotExist()
    }

    @Test
    fun `une seconde apres le debut de la lecture le bouton s'efface et le relais prend sa place`() {
        val stage = Stage()
        show(stage)

        elapse(900)
        assertThat(stage.isButtonVisible).isTrue()

        elapse(300)
        assertThat(stage.isButtonVisible).isFalse()
        compose.onNodeWithTag(PLAY_PAUSE_RELAY_TAG).assertExists()
    }

    @Test
    fun `un toucher sur le media ramene le bouton puis il s'efface de nouveau une seconde plus tard`() {
        val stage = Stage()
        show(stage)
        elapse(1_100)
        assertThat(stage.isButtonVisible).isFalse()

        compose.onNodeWithTag(MEDIA_TAG).performClick()
        compose.mainClock.advanceTimeByFrame()
        assertThat(stage.mediaTaps).isEqualTo(1)
        assertThat(stage.isButtonVisible).isTrue()

        elapse(1_100)
        assertThat(stage.isButtonVisible).isFalse()
    }

    @Test
    fun `en pause le bouton reste visible aussi longtemps qu'on veut`() {
        val stage = Stage()
        show(stage)
        elapse(1_100)

        stage.isPlaying.value = false
        elapse(100)
        elapse(10_000)

        assertThat(stage.isButtonVisible).isTrue()
        compose.onNodeWithTag(PLAY_PAUSE_RELAY_TAG).assertDoesNotExist()
        compose.onNodeWithContentDescription("Play").assertHasClickAction()
    }

    @Test
    fun `efface, le bouton reste atteignable par TalkBack avec le meme libelle et la meme action`() {
        val stage = Stage()
        show(stage)
        elapse(1_100)

        compose.onNodeWithContentDescription("Pause")
            .assertHasClickAction()
            .performSemanticsAction(SemanticsActions.OnClick)

        assertThat(stage.toggles).isEqualTo(1)
    }

    @Test
    fun `visible, un toucher sur le bouton met en pause sans atteindre le media`() {
        val stage = Stage()
        show(stage)

        compose.onNodeWithContentDescription("Pause").performClick()

        assertThat(stage.toggles).isEqualTo(1)
        assertThat(stage.mediaTaps).isEqualTo(0)
    }

    @Test
    fun `efface, le bouton ne prend aucun toucher - le media le recoit`() {
        val stage = Stage()
        show(stage)
        elapse(1_100)

        compose.onNodeWithTag(PLAY_PAUSE_RELAY_TAG).performClick()

        assertThat(stage.toggles).isEqualTo(0)
        assertThat(stage.mediaTaps).isEqualTo(1)
    }

    private companion object {
        const val MEDIA_TAG = "media"
    }
}
