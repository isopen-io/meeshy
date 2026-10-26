package me.meeshy.app.chat

import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.hasSetTextAction
import androidx.compose.ui.test.onNodeWithText
import com.google.common.truth.Truth.assertThat
import me.meeshy.feature.chat.R
import me.meeshy.sdk.composer.ComposerAffordances
import me.meeshy.sdk.composer.SlowModeState
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config

/** Non-regression of the composer's doors after the glass-plate rewrite. */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class ChatComposerParityTest {

    @get:Rule
    val compose = createComposeRule()

    private val everything = ComposerAffordances(
        canSendText = true, canSendImages = true, canSendFiles = true, canSendVideos = true,
        canSendAudios = true, canSendLocations = true, canSendLinks = true,
    )

    private fun string(id: Int, vararg args: Any): String = RuntimeEnvironment.getApplication().getString(id, *args)

    @Composable
    private fun Composer(
        affordances: ComposerAffordances = everything,
        slowMode: SlowModeState = SlowModeState.UNTHROTTLED,
        draft: String = "",
        onSend: () -> Unit = {},
        canMinimize: Boolean = true,
    ) {
        MeeshyTheme(darkTheme = false) {
            ChatComposer(
                draft = draft, draftRevision = 0, canSend = draft.isNotBlank(), isEditing = false,
                affordances = affordances, slowMode = slowMode, replyBanner = null,
                clipboardContent = null, languageCode = "fr", accentColor = Color.Blue,
                onDraftChange = {}, onPickLanguage = {}, onSend = onSend, onCancelEdit = {},
                onCancelReply = {}, onRemoveClipboard = {}, onPickFile = { _, _, _ -> }, canMinimize = canMinimize,
            )
        }
    }

    @Test
    fun `a read-only guest sees the lock notice and no input`() {
        compose.setContent { Composer(affordances = everything.copy(canSendText = false)) }
        compose.onNodeWithText(string(R.string.chat_composer_read_only)).assertIsDisplayed()
        compose.onNodeWithContentDescription(string(R.string.chat_send)).assertDoesNotExist()
    }

    @Test
    fun `slow mode shows the countdown above the field`() {
        compose.setContent {
            Composer(slowMode = SlowModeState(isActive = true, canSend = false, remainingSeconds = 7), draft = "x")
        }
        compose.onNodeWithText(string(R.string.chat_slow_mode_wait, 7)).assertIsDisplayed()
    }

    @Test
    fun `the field, the attach door and the effects door are present`() {
        compose.setContent { Composer() }
        compose.onNode(hasSetTextAction()).assertIsDisplayed()
        compose.onNodeWithContentDescription(string(R.string.chat_attach_open)).assertIsDisplayed()
        compose.onNodeWithContentDescription(string(R.string.chat_effects_open)).assertIsDisplayed()
    }

    @Test
    fun `the send door sends a non-blank draft`() {
        var sent = 0
        compose.setContent { Composer(draft = "Bonjour", onSend = { sent += 1 }) }
        compose.onNodeWithContentDescription(string(R.string.chat_send)).performClick()
        assertThat(sent).isEqualTo(1)
    }
}

