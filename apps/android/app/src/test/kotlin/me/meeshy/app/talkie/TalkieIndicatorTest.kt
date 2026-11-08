package me.meeshy.app.talkie

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.relation.TalkieSpeaker
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/** L'indicateur non modal d'un talkie reçu (#16675, iso `TalkieIndicator.swift`) : qui parle, et UN geste pour couper. */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [28], qualifiers = "fr")
class TalkieIndicatorTest {

    @get:Rule
    val compose = createComposeRule()

    private fun speaker(name: String?) = TalkieSpeaker("t1", "alice", openedAtMs = 0, maxDurationMs = 30_000, name = name)

    @Test
    fun `l'indicateur dit qui parle et coupe d'un seul geste, nomme pour TalkBack`() {
        val muted = mutableListOf<String>()
        compose.setContent { MeeshyTheme { TalkieIndicatorHost(speaker = speaker("Alice"), onMute = { muted += it }) } }

        compose.onNodeWithText("Alice vous parle").assertIsDisplayed()
        compose.onNodeWithContentDescription("Couper la voix de Alice").performClick()

        assertThat(muted).containsExactly("t1")
    }

    @Test
    fun `sans nom dans les caches, la voix sort sous Quelqu'un`() {
        compose.setContent { MeeshyTheme { TalkieIndicatorHost(speaker = speaker(null), onMute = {}) } }

        compose.onNodeWithText("Quelqu’un vous parle").assertIsDisplayed()
    }

    @Test
    fun `sans prise de parole, rien ne s'affiche`() {
        compose.setContent { MeeshyTheme { TalkieIndicatorHost(speaker = null, onMute = {}) } }

        compose.onNodeWithTag(TALKIE_INDICATOR_TAG).assertDoesNotExist()
    }
}
