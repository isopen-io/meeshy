package me.meeshy.app.settings

import androidx.compose.ui.test.assertIsOff
import androidx.compose.ui.test.assertIsOn
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.VoiceProfile
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/** La gestion du profil vocal (#16420) : le clonage et la transcription s'y basculent ; sans profil, elle propose l'assistant. */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class VoiceProfileManageContentTest {

    @get:Rule
    val compose = createComposeRule()

    private class Taps {
        var created = 0
        var retried = 0
        var deleted = 0
        val cloning = mutableListOf<Boolean>()
        val transcription = mutableListOf<Boolean>()
    }

    private fun show(state: VoiceProfileManageUiState, autoTranscribe: Boolean = true): Taps {
        val taps = Taps()
        compose.setContent {
            MeeshyTheme(darkTheme = false) {
                VoiceProfileManageContent(
                    state = state,
                    autoTranscribe = autoTranscribe,
                    onClose = {},
                    onCreate = { taps.created++ },
                    onRetry = { taps.retried++ },
                    onCloningChange = { taps.cloning += it },
                    onAutoTranscribeChange = { taps.transcription += it },
                    onDelete = { taps.deleted++ },
                )
            }
        }
        return taps
    }

    private val loaded = VoiceProfileManageUiState(
        phase = VoiceProfileManagePhase.Loaded(VoiceProfile(id = "p1", sampleCount = 3, totalDurationMs = 75_000)),
        isCloningEnabled = true,
    )

    @Test
    fun `un profil existant montre le clonage actif et le coupe d'un toucher`() {
        val taps = show(loaded)

        compose.onNodeWithText("Voice cloning active", useUnmergedTree = true).assertExists()
        compose.onNodeWithText("1:15").assertExists()
        compose.onNodeWithText("Audio translations will use your voice").performScrollTo().performClick()

        assertThat(taps.cloning).containsExactly(false)
    }

    @Test
    fun `la transcription automatique se regle depuis le profil vocal`() {
        val taps = show(loaded, autoTranscribe = false)

        compose.onNodeWithText("Automatic transcription").performScrollTo().performClick()

        assertThat(taps.transcription).containsExactly(true)
    }

    @Test
    fun `supprimer le profil demande confirmation`() {
        val taps = show(loaded)

        compose.onNodeWithText("Delete voice profile", useUnmergedTree = true).performScrollTo().performClick()
        assertThat(taps.deleted).isEqualTo(0)
        compose.onNodeWithText("Delete").performClick()

        assertThat(taps.deleted).isEqualTo(1)
    }

    @Test
    fun `sans profil l'ecran propose de creer son profil vocal`() {
        val taps = show(VoiceProfileManageUiState(phase = VoiceProfileManagePhase.Empty))

        compose.onNodeWithText("No voice profile").assertExists()
        compose.onNodeWithText("Create a voice profile").performClick()

        assertThat(taps.created).isEqualTo(1)
    }

    @Test
    fun `une lecture en echec se rejoue`() {
        val taps = show(VoiceProfileManageUiState(phase = VoiceProfileManagePhase.Failed))

        compose.onNodeWithText("Try again").performClick()

        assertThat(taps.retried).isEqualTo(1)
    }

    @Test
    fun `la duree totale se lit en minutes et secondes, quelle que soit la langue`() {
        assertThat(clockLabel(0)).isEqualTo("0:00")
        assertThat(clockLabel(75)).isEqualTo("1:15")
    }
}
