package me.meeshy.ui.component.fullscreen

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshots.Snapshot
import androidx.compose.ui.test.junit4.createComposeRule
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.fullscreen.FullscreenChromeState
import me.meeshy.sdk.model.fullscreen.FullscreenOverlay
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * L'effacement automatique du chrome : trois secondes, seulement pendant une lecture, jamais sur
 * une image, jamais quand une surface est ouverte — la règle est celle de [FullscreenChromeState],
 * ce composable ne fait que l'attendre.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class FullscreenChromeAutoHideTest {

    @get:Rule
    val compose = createComposeRule()

    private class Stage(initial: FullscreenChromeState = FullscreenChromeState.Initial) {
        val chrome = mutableStateOf(initial)
        val isPlaying = mutableStateOf(true)
        var autoHides = 0
    }

    private fun show(stage: Stage) {
        compose.mainClock.autoAdvance = false
        compose.setContent {
            val chrome by stage.chrome
            FullscreenChromeAutoHide(
                state = chrome,
                isPlaying = stage.isPlaying.value,
                onAutoHide = {
                    stage.autoHides++
                    stage.chrome.value = stage.chrome.value.autoHiding()
                },
            )
        }
        compose.mainClock.advanceTimeByFrame()
    }

    private fun elapse(millis: Long) {
        val until = compose.mainClock.currentTime + millis
        while (compose.mainClock.currentTime < until) {
            compose.mainClock.advanceTimeByFrame()
        }
    }

    @Test
    fun `pendant une lecture le chrome s'efface apres trois secondes, pas avant`() {
        val stage = Stage()
        show(stage)

        elapse(2_800)
        assertThat(stage.chrome.value.showsChrome).isTrue()

        elapse(400)
        assertThat(stage.chrome.value.isImmersive).isTrue()
        assertThat(stage.autoHides).isEqualTo(1)
    }

    @Test
    fun `a l'arret le chrome ne s'efface jamais`() {
        val stage = Stage()
        stage.isPlaying.value = false
        show(stage)

        elapse(30_000)

        assertThat(stage.chrome.value.showsChrome).isTrue()
        assertThat(stage.autoHides).isEqualTo(0)
    }

    @Test
    fun `une surface ouverte n'est jamais effacee d'elle-meme`() {
        val stage = Stage(FullscreenChromeState.of(overlay = FullscreenOverlay.Reactions))
        show(stage)

        elapse(30_000)

        assertThat(stage.chrome.value.isOpen(FullscreenOverlay.Reactions)).isTrue()
        assertThat(stage.autoHides).isEqualTo(0)
    }

    @Test
    fun `mettre en pause avant le terme annule l'effacement`() {
        val stage = Stage()
        show(stage)
        elapse(2_000)

        stage.isPlaying.value = false
        Snapshot.sendApplyNotifications()
        compose.mainClock.advanceTimeByFrame()
        compose.mainClock.advanceTimeByFrame()
        elapse(10_000)

        assertThat(stage.chrome.value.showsChrome).isTrue()
        assertThat(stage.autoHides).isEqualTo(0)
    }
}
