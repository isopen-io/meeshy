package me.meeshy.ui.component.video

import android.content.Context
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.performClick
import androidx.compose.runtime.CompositionLocalProvider
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import me.meeshy.ui.R
import me.meeshy.ui.component.fullscreen.LocalFullscreenChromeInteractive
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class ReelSoundButtonSemanticsTest {

    @get:Rule
    val compose = createComposeRule()

    private val context get() = ApplicationProvider.getApplicationContext<Context>()

    @Test
    fun `son audible le libelle propose de couper le son de la video`() {
        compose.setContent { ReelSoundButton(isSoundAudible = true, onToggle = {}) }
        compose.onNodeWithContentDescription(context.getString(R.string.a11y_feed_video_sound_mute)).assertExists()
    }

    @Test
    fun `son coupe le libelle propose d activer le son de la video`() {
        compose.setContent { ReelSoundButton(isSoundAudible = false, onToggle = {}) }
        compose.onNodeWithContentDescription(context.getString(R.string.a11y_feed_video_sound_unmute)).assertExists()
    }

    @Test
    fun `le toucher bascule`() {
        var toggles = 0
        compose.setContent {
            CompositionLocalProvider(LocalFullscreenChromeInteractive provides true) {
                ReelSoundButton(isSoundAudible = true, onToggle = { toggles += 1 })
            }
        }
        compose.onNodeWithContentDescription(context.getString(R.string.a11y_feed_video_sound_mute)).performClick()
        assertThat(toggles).isEqualTo(1)
    }
}
