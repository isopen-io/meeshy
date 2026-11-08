package me.meeshy.app.chat.conversationcard

import androidx.compose.foundation.layout.width
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.assertHeightIsAtLeast
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.getUnclippedBoundsInRoot
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.conversationcard.ConversationCardActions
import me.meeshy.sdk.model.conversationcard.ConversationLinkCardState.CardError
import me.meeshy.sdk.model.conversationcard.ConversationLinkCardState.Pending
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], qualifiers = "w1000dp-h1000dp")
class ConversationLinkCardActionsRowTest {

    @get:Rule
    val compose = createComposeRule()

    private val join = ConversationCardActions.Join(identifier = "club", allowsAnonymous = true)
    private val member = ConversationCardActions.LeaveOrOpen(conversationId = "c1")

    private fun show(
        actions: ConversationCardActions,
        width: Dp = 320.dp,
        pending: Pending = Pending.NONE,
        error: CardError? = null,
        isExpired: Boolean = false,
        onOpen: (String) -> Unit = {},
    ) {
        compose.setContent {
            MeeshyTheme(darkTheme = false) {
                ConversationLinkCardActionsRow(
                    actions = actions,
                    joinAccount = null,
                    isExpired = isExpired,
                    pending = pending,
                    error = error,
                    accent = MeeshyPalette.Indigo500,
                    onJoin = {},
                    onJoinAnonymously = {},
                    onLeave = {},
                    onOpen = onOpen,
                    modifier = Modifier.width(width),
                )
            }
        }
    }

    private fun top(description: String) =
        compose.onNodeWithContentDescription(description).getUnclippedBoundsInRoot().top

    @Test
    fun `member buttons sit side by side when they fit`() {
        show(member, width = 320.dp)

        assertThat(top("Leave")).isEqualTo(top("Open"))
    }

    @Test
    fun `member buttons stack when the width is too narrow`() {
        show(member, width = 110.dp)

        assertThat(top("Open")).isGreaterThan(top("Leave"))
    }

    @Test
    fun `every button offers at least a 44 dp target`() {
        show(join)

        compose.onNodeWithContentDescription("Join anonymously").assertHeightIsAtLeast(44.dp)
        compose.onNodeWithContentDescription("Join with my account").assertHeightIsAtLeast(44.dp)
    }

    @Test
    fun `while joining the account button spins and every button is disabled`() {
        show(join, pending = Pending.JOINING)

        compose.onNodeWithContentDescription("In progress…").assertExists()
        compose.onNodeWithContentDescription("Join anonymously").assertIsNotEnabled()
    }

    @Test
    fun `an expired link shows only its mention`() {
        show(join, isExpired = true)

        compose.onNodeWithText("Link expired").assertExists()
        compose.onNodeWithContentDescription("Join with my account").assertDoesNotExist()
    }

    @Test
    fun `a refusal is said under the buttons`() {
        show(join, error = CardError.FORBIDDEN)

        compose.onNodeWithText("Access denied to this conversation").assertExists()
    }

    @Test
    fun `open hands over the conversation id`() {
        val opened = mutableListOf<String>()
        show(member, onOpen = { opened += it })

        compose.onNodeWithContentDescription("Open").performClick()

        assertThat(opened).containsExactly("c1")
    }
}
