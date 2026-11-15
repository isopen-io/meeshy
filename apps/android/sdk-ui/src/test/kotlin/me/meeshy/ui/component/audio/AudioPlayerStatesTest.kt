package me.meeshy.ui.component.audio

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.media.AudioAvailability
import me.meeshy.sdk.model.media.MediaPlayerContext
import me.meeshy.ui.R
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class AudioPlayerStatesTest {
    @get:Rule val compose = createComposeRule()
    private val recorded = RecordedActions()

    private fun str(id: Int) =
        ApplicationProvider.getApplicationContext<android.content.Context>().getString(id)

    private fun show(state: AudioPlayerState, context: MediaPlayerContext = MediaPlayerContext.FEED_POST, composer: Boolean = false) {
        compose.setContent { PlayerUnderTest(state, recorded, context, composer) }
        compose.waitForIdle()
    }

    @Test
    fun `pret montre les timecodes ecoule et duree`() {
        show(AudioPlayerState(durationSeconds = 65.0, restingFraction = 0.5))
        compose.onNodeWithText("0:32").assertIsDisplayed()
        compose.onNodeWithText("1:05").assertIsDisplayed()
    }

    @Test
    fun `a telecharger montre la taille et un tap telecharge sans lire`() {
        show(AudioPlayerState(availability = AudioAvailability.NeedsDownload, fileSizeBytes = 410 * 1024L, durationSeconds = 10.0))
        compose.onNodeWithText("410 KB").assertIsDisplayed()
        compose.onNodeWithContentDescription(str(R.string.media_audio_play)).performClick()
        assertThat(recorded.downloads).isEqualTo(1)
        assertThat(recorded.plays).isEqualTo(0)
    }

    @Test
    fun `telechargement montre les octets et ignore le tap`() {
        show(AudioPlayerState(availability = AudioAvailability.Downloading(0.5, 410 * 1024L, 850 * 1024L), durationSeconds = 10.0))
        compose.onNodeWithText("410 KB / 850 KB").assertIsDisplayed()
        compose.onNodeWithContentDescription(str(R.string.media_audio_play)).performClick()
        assertThat(recorded.downloads + recorded.plays).isEqualTo(0)
    }

    @Test
    fun `erreur propose de reessayer`() {
        show(AudioPlayerState(hasError = true, durationSeconds = 10.0))
        compose.onNodeWithText(str(R.string.audio_player_retry)).performClick()
        assertThat(recorded.retries).isEqualTo(1)
    }

    @Test
    fun `le composeur montre editer et supprimer, la bulle non`() {
        show(AudioPlayerState(durationSeconds = 10.0), MediaPlayerContext.COMPOSER_ATTACHMENT, composer = true)
        compose.onNodeWithContentDescription(str(R.string.audio_player_edit)).assertIsDisplayed()
        compose.onNodeWithContentDescription(str(R.string.audio_player_delete)).assertIsDisplayed()
    }

    @Test
    fun `hors composeur aucune action d edition`() {
        show(AudioPlayerState(durationSeconds = 10.0), MediaPlayerContext.MESSAGE_BUBBLE, composer = true)
        compose.onNodeWithContentDescription(str(R.string.audio_player_edit)).assertDoesNotExist()
    }
}
