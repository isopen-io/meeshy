package me.meeshy.ui.component.audio

import androidx.compose.runtime.MutableState
import androidx.compose.runtime.mutableStateOf
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.playback.AudioLanguageStripLaw
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * Les langues du vocal au pied du plein écran (iOS `inlineLanguageFlags`) : le bandeau « Original » + les pistes traduites, le
 * disque « Traduire l'audio », et ce que choisir une langue fait — changer la piste jouée sans perdre ni la page ni la file.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class AudioFullscreenLanguagesTest {

    @get:Rule
    val compose = createComposeRule()

    private fun voice(
        translated: List<String> = listOf("en", "es"),
        playing: String? = null,
    ) = audioSource("a", 1_000L).copy(
        originalLanguage = "fr",
        translatedLanguages = translated,
        trackLanguage = playing ?: "fr",
        isTranslatedTrack = playing != null,
    )

    private fun showStrip(source: AudioFullscreenSource, port: AudioFullscreenTranscriptPort?, interactions: MutableList<Unit> = mutableListOf()) {
        compose.setContent {
            MeeshyTheme {
                AudioFullscreenLanguages(source, port, Color.Magenta, onInteraction = { interactions += Unit })
            }
        }
    }

    private fun selected(code: String): Boolean =
        compose.onNodeWithTag(audioLanguagePillTag(code)).fetchSemanticsNode().config[SemanticsProperties.Selected]

    @Test
    fun `le bandeau montre l original puis une pastille par piste traduite`() {
        showStrip(voice(), FakeTranscriptPort())

        compose.onNodeWithTag(audioLanguagePillTag(AudioLanguageStripLaw.ORIGINAL)).assertExists()
        compose.onNodeWithTag(audioLanguagePillTag("en")).assertExists()
        compose.onNodeWithTag(audioLanguagePillTag("es")).assertExists()
    }

    @Test
    fun `la piste jouee est la pastille choisie, l original sinon`() {
        showStrip(voice(playing = "en"), FakeTranscriptPort())

        assertThat(selected("en")).isTrue()
        assertThat(selected(AudioLanguageStripLaw.ORIGINAL)).isFalse()
        assertThat(selected("es")).isFalse()
    }

    @Test
    fun `sur la voix d origine c est l original qui est choisi`() {
        showStrip(voice(), FakeTranscriptPort())

        assertThat(selected(AudioLanguageStripLaw.ORIGINAL)).isTrue()
        assertThat(selected("en")).isFalse()
    }

    @Test
    fun `choisir une langue passe par l hote et relance l effacement du chrome`() {
        val port = FakeTranscriptPort()
        val interactions = mutableListOf<Unit>()
        val source = voice()
        showStrip(source, port, interactions)

        compose.onNodeWithTag(audioLanguagePillTag("es")).performClick()
        compose.onNodeWithTag(audioLanguagePillTag(AudioLanguageStripLaw.ORIGINAL)).performClick()

        assertThat(port.selected).containsExactly("a" to "es", "a" to AudioLanguageStripLaw.ORIGINAL).inOrder()
        assertThat(interactions).hasSize(2)
    }

    @Test
    fun `le disque Traduire l audio ouvre la feuille des langues`() {
        val port = FakeTranscriptPort()
        showStrip(voice(), port)

        compose.onNodeWithTag(AUDIO_FULLSCREEN_TRANSLATE_TAG).performClick()

        assertThat(port.opened).containsExactly("a")
    }

    @Test
    fun `sans piste traduite le disque reste offert pour en demander une`() {
        showStrip(voice(translated = emptyList()), FakeTranscriptPort())

        compose.onNodeWithTag(AUDIO_FULLSCREEN_TRANSLATE_TAG).assertExists()
        compose.onNodeWithTag(audioLanguagePillTag(AudioLanguageStripLaw.ORIGINAL)).assertExists()
    }

    @Test
    fun `un hote qui n offre pas la traduction n a pas de disque`() {
        showStrip(voice(), FakeTranscriptPort(translatable = false))

        compose.onNodeWithTag(AUDIO_FULLSCREEN_TRANSLATE_TAG).assertDoesNotExist()
        compose.onNodeWithTag(audioLanguagePillTag("en")).assertExists()
    }

    @Test
    fun `ni piste ni offre : la ligne n existe pas`() {
        showStrip(voice(translated = emptyList()), FakeTranscriptPort(translatable = false))

        compose.onNodeWithTag(AUDIO_LANGUAGE_STRIP_TAG).assertDoesNotExist()
        compose.onNodeWithTag(AUDIO_FULLSCREEN_TRANSLATE_TAG).assertDoesNotExist()
    }

    @Test
    fun `sans hote le bandeau n existe pas`() {
        showStrip(voice(), port = null)

        compose.onNodeWithTag(AUDIO_LANGUAGE_STRIP_TAG).assertDoesNotExist()
    }

    private fun showPage(source: MutableState<AudioFullscreenSource>, player: FakeAudioFullscreenPlayer, port: AudioFullscreenTranscriptPort?) {
        compose.setContent {
            MeeshyTheme {
                AudioFullscreenPage(
                    source = source.value,
                    pageIndex = 0,
                    pageCount = 1,
                    player = player,
                    heardPositionMs = null,
                    upcoming = { emptyList() },
                    accent = Color.Magenta,
                    chromeVisible = true,
                    onClose = {},
                    onToggleChrome = {},
                    onRevealChrome = {},
                    onChromeInteraction = {},
                    onDownload = null,
                    onNext = null,
                    onPrevious = null,
                    transcripts = port,
                )
            }
        }
    }

    @Test
    fun `une langue choisie recharge la piste de la page sans relancer ni remplacer la file`() {
        val player = FakeAudioFullscreenPlayer()
        val source = mutableStateOf(voice())
        showPage(source, player, FakeTranscriptPort())
        compose.waitForIdle()

        compose.runOnIdle { source.value = source.value.copy(url = "https://cdn.meeshy.me/a-en.m4a", trackLanguage = "en", isTranslatedTrack = true) }
        compose.waitForIdle()

        assertThat(player.switched.last()).isEqualTo("https://cdn.meeshy.me/a-en.m4a")
        assertThat(player.starts).isEmpty()
        assertThat(player.replaced).isEmpty()
    }

    @Test
    fun `la page porte le bandeau, le disque et l etat vide de la transcription`() {
        val source = mutableStateOf(voice())
        showPage(source, FakeAudioFullscreenPlayer(), FakeTranscriptPort())
        compose.waitForIdle()

        compose.onNodeWithTag(AUDIO_LANGUAGE_STRIP_TAG).assertExists()
        compose.onNodeWithTag(AUDIO_FULLSCREEN_TRANSLATE_TAG).assertExists()
        compose.onNodeWithTag(AUDIO_FULLSCREEN_TRANSCRIPT_EMPTY_TAG).assertExists()
    }
}
