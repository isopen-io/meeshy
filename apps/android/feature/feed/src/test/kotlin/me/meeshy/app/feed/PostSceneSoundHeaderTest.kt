package me.meeshy.app.feed

import androidx.compose.runtime.mutableStateOf
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.performClick
import com.google.common.truth.Truth.assertThat
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/** #5602 — l'en-tête du son de fond AGIT : toucher joue ou met en pause la scène, et le coupe-son bascule. */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], qualifiers = "w360dp-h800dp-xhdpi")
class PostSceneSoundHeaderTest {

    @get:Rule
    val compose = createComposeRule()

    @Test
    fun `touching the play pause control toggles the playback and says what it will do`() {
        val paused = mutableStateOf(false)
        var toggles = 0
        compose.setContent {
            PostSceneSoundHeader(
                credit = SceneSoundCredit.Original,
                muted = false,
                paused = paused.value,
                onToggleMute = {},
                onTogglePlayback = { toggles++; paused.value = !paused.value },
            )
        }

        compose.onNodeWithContentDescription("Stops the scene playback").performClick()
        compose.onNodeWithContentDescription("Resumes the scene playback").assertExists()
        compose.onNodeWithContentDescription("Resumes the scene playback").performClick()

        assertThat(toggles).isEqualTo(2)
        assertThat(paused.value).isFalse()
    }

    @Test
    fun `the mute control reports the toggle and names the credited library sound`() {
        var mutes = 0
        compose.setContent {
            PostSceneSoundHeader(
                credit = SceneSoundCredit.Library(title = "Nuits d'été", author = "belva", duration = "0:12"),
                muted = false,
                paused = false,
                onToggleMute = { mutes++ },
                onTogglePlayback = {},
            )
        }

        compose.onNodeWithContentDescription("Mute the sound").performClick()
        compose.onNodeWithContentDescription("Background sound · Nuits d'été · @belva · 0:12", useUnmergedTree = true).assertExists()

        assertThat(mutes).isEqualTo(1)
    }
}
