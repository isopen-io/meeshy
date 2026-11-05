package me.meeshy.ui.component.audio

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.hasTestTag
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.AudioPlayerChrome
import me.meeshy.sdk.model.media.MediaPlayerContext
import me.meeshy.sdk.model.playback.AudioLanguageStripLaw
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class AudioLanguageStripTest {
    @get:Rule val compose = createComposeRule()

    private fun pills(selected: String?) = AudioLanguageStripLaw.pills(listOf("fr", "es"), selected).map {
        AudioLanguagePill(it.code, flag = "F", label = if (it.isOriginal) "Original" else it.code, isSelected = it.isSelected)
    }

    private fun showStrip(selected: String? = "fr", taps: MutableList<String> = mutableListOf()) {
        compose.setContent {
            MeeshyTheme(darkTheme = false) {
                AudioLanguageStrip(pills = pills(selected), accent = Color(0xFF6366F1), isDark = false, onSelect = { taps += it })
            }
        }
    }

    private fun showPlayer(context: MediaPlayerContext, chrome: AudioPlayerChrome = AudioPlayerChrome.Card, taps: MutableList<String> = mutableListOf()) {
        compose.setContent {
            MeeshyTheme(darkTheme = false) {
                AudioPlayerView(
                    state = AudioPlayerState(durationSeconds = 10.0),
                    context = context,
                    accent = Color(0xFF6366F1),
                    actions = RecordedActions().actions(),
                    chrome = chrome,
                    languageStrip = AudioLanguageStripSpec(pills("fr"), onSelect = { taps += it }),
                )
            }
        }
    }

    @Test
    fun `le bandeau montre l'original puis une pastille par piste traduite`() {
        showStrip()

        compose.onNodeWithTag(audioLanguagePillTag(AudioLanguageStripLaw.ORIGINAL)).assertExists()
        compose.onNodeWithTag(audioLanguagePillTag("fr")).assertExists()
        compose.onNodeWithTag(audioLanguagePillTag("es")).assertExists()
    }

    @Test
    fun `seule la langue jouee est selectionnee`() {
        showStrip(selected = "es")

        fun selected(code: String) = compose.onNodeWithTag(audioLanguagePillTag(code)).fetchSemanticsNode().config[SemanticsProperties.Selected]
        assertThat(selected("es")).isTrue()
        assertThat(selected("fr")).isFalse()
        assertThat(selected(AudioLanguageStripLaw.ORIGINAL)).isFalse()
    }

    @Test
    fun `un toucher rend le code de la pastille, la sentinelle pour l'original`() {
        val taps = mutableListOf<String>()
        showStrip(taps = taps)

        compose.onNodeWithTag(audioLanguagePillTag("es")).performClick()
        compose.onNodeWithTag(audioLanguagePillTag(AudioLanguageStripLaw.ORIGINAL)).performClick()

        assertThat(taps).containsExactly("es", AudioLanguageStripLaw.ORIGINAL).inOrder()
    }

    @Test
    fun `le lecteur montre le bandeau en carte hors contexte compact`() {
        showPlayer(MediaPlayerContext.FEED_POST)

        compose.onNodeWithTag(AUDIO_LANGUAGE_STRIP_TAG).assertExists()
    }

    @Test
    fun `le lecteur masque le bandeau dans la bulle compacte et en posture minimale`() {
        showPlayer(MediaPlayerContext.MESSAGE_BUBBLE)
        compose.onAllNodes(hasTestTag(AUDIO_LANGUAGE_STRIP_TAG)).assertCountEquals(0)
    }

    @Test
    fun `la posture minimale ne montre pas le bandeau`() {
        showPlayer(MediaPlayerContext.FEED_POST, chrome = AudioPlayerChrome.FlatMinimal)
        compose.onAllNodes(hasTestTag(AUDIO_LANGUAGE_STRIP_TAG)).assertCountEquals(0)
    }
}
