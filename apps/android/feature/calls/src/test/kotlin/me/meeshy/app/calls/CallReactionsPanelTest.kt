package me.meeshy.app.calls

import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.performClick
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.call.CallReactionEmoji
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], qualifiers = "w411dp-h891dp")
class CallReactionsPanelTest {
    @get:Rule val rule = createComposeRule()

    @Test
    fun `chaque emoji de la passerelle est un bouton qui envoie cette reaction`() {
        val sent = mutableListOf<CallReactionEmoji>()
        rule.setContent { MeeshyTheme { CallReactionsPanel(onReact = { sent += it }) } }

        rule.onNodeWithContentDescription(CallReactionEmoji.THUMBS_UP.glyph).performClick()
        rule.onNodeWithContentDescription(CallReactionEmoji.FIRE.glyph).performClick()

        assertThat(sent).containsExactly(CallReactionEmoji.THUMBS_UP, CallReactionEmoji.FIRE).inOrder()
    }
}
