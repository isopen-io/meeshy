package me.meeshy.ui.component.fullscreen

import android.content.Context
import android.provider.Settings
import androidx.compose.foundation.layout.Box
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.test.assertHasClickAction
import androidx.compose.ui.test.assertHeightIsAtLeast
import androidx.compose.ui.test.assertWidthIsAtLeast
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.compose.ui.unit.dp
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.fullscreen.AudioOutputRoute
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config

/**
 * « Sortie audio » remplace AirPlay : le bouton choisit sa route d'après la version du système,
 * porte le libellé « Audio output » (« Sortie audio » en français) et n'existe pas sous le
 * bouclier de capture.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class AudioOutputPickerTest {

    @get:Rule
    val compose = createComposeRule()

    private class RecordingLauncher : AudioOutputLauncher {
        val routes = mutableListOf<AudioOutputRoute>()

        override fun open(context: Context, route: AudioOutputRoute): Boolean {
            routes += route
            return true
        }
    }

    private fun show(launcher: RecordingLauncher, sdkInt: Int, shielded: Boolean = false) {
        compose.setContent {
            MeeshyTheme {
                Box(Modifier.testTag(SLOT_TAG)) {
                    AudioOutputPicker(isCaptureShielded = shielded, sdkInt = sdkInt, launcher = launcher)
                }
            }
        }
        compose.waitForIdle()
    }

    @Test
    fun `le bouton porte le libelle Sortie audio et une cible de 48 dp`() {
        show(RecordingLauncher(), sdkInt = 34)

        compose.onNodeWithContentDescription(AUDIO_OUTPUT)
            .assertHasClickAction()
            .assertWidthIsAtLeast(48.dp)
            .assertHeightIsAtLeast(48.dp)
    }

    @Test
    fun `des l'API 34 un toucher ouvre le selecteur de sortie du systeme`() {
        val launcher = RecordingLauncher()
        show(launcher, sdkInt = 34)

        compose.onNodeWithContentDescription(AUDIO_OUTPUT).performClick()

        assertThat(launcher.routes).containsExactly(AudioOutputRoute.SystemOutputSwitcher)
    }

    @Test
    fun `avant l'API 34 un toucher ouvre les reglages Bluetooth`() {
        val launcher = RecordingLauncher()
        show(launcher, sdkInt = 33)

        compose.onNodeWithContentDescription(AUDIO_OUTPUT).performClick()

        assertThat(launcher.routes).containsExactly(AudioOutputRoute.BluetoothSettings)
    }

    @Test
    fun `sous le bouclier de capture le bouton n'existe pas et rien ne s'ouvre`() {
        val launcher = RecordingLauncher()
        show(launcher, sdkInt = 34, shielded = true)

        compose.onNodeWithContentDescription(AUDIO_OUTPUT).assertDoesNotExist()
        assertThat(launcher.routes).isEmpty()
    }

    @Test
    fun `sous le bouclier la place du bouton reste reservee - le chrome ne se reorganise pas`() {
        show(RecordingLauncher(), sdkInt = 34, shielded = true)

        compose.onNodeWithTag(SLOT_TAG)
            .assertWidthIsAtLeast(48.dp)
            .assertHeightIsAtLeast(48.dp)
    }

    @Test
    fun `le lanceur du systeme ouvre les reglages Bluetooth sur la route Bluetooth`() {
        val application = RuntimeEnvironment.getApplication()

        val opened = SystemAudioOutputLauncher.open(application, AudioOutputRoute.BluetoothSettings)

        assertThat(opened).isTrue()
        assertThat(shadowOf(application).nextStartedActivity.action).isEqualTo(Settings.ACTION_BLUETOOTH_SETTINGS)
    }

    private companion object {
        const val SLOT_TAG = "slot"
        const val AUDIO_OUTPUT = "Audio output"
    }
}
