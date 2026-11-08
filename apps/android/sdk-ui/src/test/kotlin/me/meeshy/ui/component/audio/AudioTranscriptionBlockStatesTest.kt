package me.meeshy.ui.component.audio

import androidx.compose.material3.Text
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.performClick
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.AudioPlayerChrome
import me.meeshy.sdk.model.AudioTranscriptionBlock
import me.meeshy.sdk.model.MessageTranscriptionSegment
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class AudioTranscriptionBlockStatesTest {

    @get:Rule
    val compose = createComposeRule()

    private fun words(count: Int) = List(count) { MessageTranscriptionSegment(text = "m$it", startTime = it.toDouble(), endTime = it + 1.0) }

    @Test
    fun `chaque etat montre sa vue et seulement elle`() {
        compose.setContent {
            MeeshyTheme {
                AudioTranscriptionSlot(
                    kind = AudioTranscriptionBlock.Kind.REQUEST,
                    skeleton = { Text("squelette") },
                    request = { Text("demande") },
                    transcript = { Text("texte") },
                )
            }
        }

        compose.onNodeWithText("demande").assertIsDisplayed()
        compose.onNodeWithText("squelette").assertDoesNotExist()
        compose.onNodeWithText("texte").assertDoesNotExist()
    }

    @Test
    fun `la bande minimale cite le texte a plat sans geste`() {
        compose.setContent {
            MeeshyTheme {
                AudioTranscriptionText(
                    segments = listOf(MessageTranscriptionSegment(text = "bonjour le monde")),
                    chrome = AudioPlayerChrome.FlatMinimal,
                    activeIndex = null,
                    ink = Color.White,
                    accent = Color.Red,
                    onSeek = null,
                    onFullscreen = null,
                    cardText = { _, _ -> Text("carte") },
                )
            }
        }

        compose.onNodeWithText(flatTranscriptionQuote("bonjour le monde")).assertIsDisplayed()
        compose.onNodeWithText("carte").assertDoesNotExist()
    }

    @Test
    fun `la bande enrichie coupe a 30 mots et voir plus ouvre le plein ecran`() {
        var opened = 0
        compose.setContent {
            MeeshyTheme {
                AudioTranscriptionText(
                    segments = words(45),
                    chrome = AudioPlayerChrome.FlatFocused,
                    activeIndex = null,
                    ink = Color.White,
                    accent = Color.Red,
                    onSeek = null,
                    onFullscreen = { opened++ },
                    cardText = { _, _ -> },
                )
            }
        }

        compose.onNodeWithText("m29…", substring = true).assertIsDisplayed()
        compose.onNodeWithText("m30", substring = true).assertDoesNotExist()
        compose.onNodeWithText("See more", substring = true, ignoreCase = true).performClick()

        assertThat(opened).isEqualTo(1)
    }

    @Test
    fun `la bande enrichie sans plein ecran garde la transcription entiere`() {
        compose.setContent {
            MeeshyTheme {
                AudioTranscriptionText(
                    segments = words(45),
                    chrome = AudioPlayerChrome.FlatFocused,
                    activeIndex = null,
                    ink = Color.White,
                    accent = Color.Red,
                    onSeek = null,
                    onFullscreen = null,
                    cardText = { _, _ -> },
                )
            }
        }

        compose.onNodeWithText("m44", substring = true).assertExists()
    }

    @Test
    fun `la carte coupe a 255 caracteres et voir plus la deplie en ligne`() {
        val long = listOf(MessageTranscriptionSegment(text = "a".repeat(300)))
        var expandedSeen = false
        compose.setContent {
            MeeshyTheme {
                AudioTranscriptionText(
                    segments = long,
                    chrome = AudioPlayerChrome.Card,
                    activeIndex = null,
                    ink = Color.White,
                    accent = Color.Red,
                    onSeek = null,
                    onFullscreen = null,
                    cardText = { shown, expanded ->
                        expandedSeen = expandedSeen || expanded
                        Text("n=" + shown.sumOf { it.text.length })
                    },
                )
            }
        }

        compose.onNodeWithText("n=258").assertIsDisplayed()
        compose.onNodeWithText("See more", substring = true, ignoreCase = true).performClick()
        compose.onNodeWithText("n=300").assertIsDisplayed()
        assertThat(expandedSeen).isTrue()
    }
}
