package me.meeshy.ui.component.bubble

import android.content.Context
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithContentDescription
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.test.core.app.ApplicationProvider
import me.meeshy.ui.R
import me.meeshy.ui.component.audio.AUDIO_CONSENT_NOTICE_TAG
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/** iOS `AudioStackView` : les vocaux d'un message s'empilent, chaque rangée dit sa place, l'avis de consentement ferme la pile. */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class BubbleAudioStackSemanticsTest {

    @get:Rule val compose = createComposeRule()
    private val context = ApplicationProvider.getApplicationContext<Context>()

    private fun show(content: BubbleContent) {
        compose.setContent {
            MeeshyTheme {
                BubbleAudioStack(
                    content = content,
                    playback = null,
                    onColor = Color.Black,
                    accent = Color(0xFF6366F1),
                    callbacks = BubbleCallbacks(onAudioClick = {}),
                )
            }
        }
        compose.waitForIdle()
    }

    @Test
    fun `chaque rangee d'une pile de trois vocaux dit sa place a TalkBack`() {
        show(voiceBubble(listOf(voiceNote("a"), voiceNote("b"), voiceNote("c"))))

        compose.onAllNodesWithTag("$BUBBLE_AUDIO_STACK_ROW_TAG-1").assertCountEquals(1)
        compose.onAllNodesWithTag("$BUBBLE_AUDIO_STACK_ROW_TAG-3").assertCountEquals(1)
        compose.onNodeWithContentDescription(context.getString(R.string.bubble_audio_stack_position, 2, 3)).assertExists()
    }

    @Test
    fun `chaque rangee porte son lecteur complet`() {
        show(voiceBubble(listOf(voiceNote("a"), voiceNote("b"))))

        compose.onAllNodesWithContentDescription(context.getString(R.string.media_audio_play)).assertCountEquals(2)
        compose.onAllNodesWithContentDescription(context.getString(R.string.audio_player_waveform)).assertCountEquals(2)
    }

    @Test
    fun `un vocal seul ne dit pas de place`() {
        show(voiceBubble(listOf(voiceNote("a"))))

        compose.onAllNodesWithContentDescription(context.getString(R.string.bubble_audio_stack_position, 1, 1)).assertCountEquals(0)
    }

    @Test
    fun `l'avis de consentement vocal ferme la pile de mon vocal une seule fois`() {
        show(voiceBubble(listOf(voiceNote("a"), voiceNote("b")), voiceConsentMissing = true, isOutgoing = true))

        compose.onAllNodesWithTag(AUDIO_CONSENT_NOTICE_TAG).assertCountEquals(1)
    }

    @Test
    fun `l'avis de consentement ne se pose jamais sous le vocal d'un tiers`() {
        show(voiceBubble(listOf(voiceNote("a")), voiceConsentMissing = true, isOutgoing = false))

        compose.onAllNodesWithTag(AUDIO_CONSENT_NOTICE_TAG).assertCountEquals(0)
    }
}
