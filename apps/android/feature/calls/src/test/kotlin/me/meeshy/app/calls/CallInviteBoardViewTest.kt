package me.meeshy.app.calls

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.PresenceState
import me.meeshy.sdk.model.call.CallInviteOutcome
import me.meeshy.sdk.model.call.group.CallInviteBoard
import me.meeshy.sdk.model.call.group.CallPendingInvite
import me.meeshy.ui.component.AvatarPresenceDotTestTag
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * Pendant un appel, les invitations qui sonnent s'affichent au-dessus de la pilule et un refus ou une absence de
 * réponse se dit, puis s'efface seul au bout de 4 s — comme iOS `CallInviteStrip` + `CallControlsNoticePill` (#13753).
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class CallInviteBoardViewTest {
    @get:Rule val rule = createComposeRule()

    private val ringing = CallInviteBoard()
        .ringing(CallPendingInvite("bob", "Bob"))
        .ringing(CallPendingInvite("carol", "Carol"))

    @Test
    fun `the ringing invitations show above the pill, each read as name then Ringing`() {
        rule.setContent { MeeshyTheme { CallInviteBoardView(board = ringing, onDismissNotice = {}) } }

        rule.onAllNodesWithTag(INVITE_STRIP_TAG).assertCountEquals(1)
        rule.onNodeWithContentDescription("Bob, Ringing…").assertExists()
        rule.onNodeWithContentDescription("Carol, Ringing…").assertExists()
        rule.onAllNodesWithTag(INVITE_NOTICE_TAG).assertCountEquals(0)
    }

    @Test
    fun `a decline says who and the close button dismisses it`() {
        var board by mutableStateOf(ringing.settled("bob", CallInviteOutcome.DECLINED))
        rule.setContent { MeeshyTheme { CallInviteBoardView(board = board, onDismissNotice = { board = board.dismissingNotice() }) } }

        rule.onNodeWithText("Bob declined").assertExists()
        rule.onNodeWithContentDescription("Close").performClick()
        rule.onAllNodesWithTag(INVITE_NOTICE_TAG).assertCountEquals(0)
        rule.onNodeWithContentDescription("Carol, Ringing…").assertExists()
    }

    @Test
    fun `a missing answer says who, then goes away by itself after 4 s`() {
        var board = ringing.settled("carol", CallInviteOutcome.EXPIRED)
        rule.mainClock.autoAdvance = false
        rule.setContent { MeeshyTheme { CallInviteBoardView(board = board, onDismissNotice = { board = board.dismissingNotice() }) } }
        rule.mainClock.advanceTimeBy(FRAME_MILLIS)

        rule.onNodeWithText("Carol didn’t answer").assertExists()
        rule.mainClock.advanceTimeBy(CallInviteBoard.NOTICE_DISPLAY_MILLIS - 500)
        assertThat(board.notice).isNotNull()
        rule.mainClock.advanceTimeBy(1_000)
        assertThat(board.notice).isNull()
    }

    private companion object {
        const val FRAME_MILLIS = 32L
    }

    @Test
    fun `each ringing invitation reads its own served presence, by user id`() {
        val asked = mutableListOf<String>()
        rule.setContent {
            MeeshyTheme {
                CallInviteStrip(ringing.invites, presenceOf = { userId -> asked += userId; null })
            }
        }
        rule.waitForIdle()
        assertThat(asked.distinct()).containsExactly("bob", "carol").inOrder()
    }

    @Test
    fun `an invitee's avatar carries a dot when present, none offline or unserved`() {
        var presence by mutableStateOf<PresenceState?>(PresenceState.ONLINE)
        rule.setContent { MeeshyTheme { CallInviteAvatar(CallPendingInvite("bob", "Bob"), presence) } }
        rule.onAllNodesWithTag(AvatarPresenceDotTestTag, useUnmergedTree = true).assertCountEquals(1)

        presence = PresenceState.OFFLINE
        rule.waitForIdle()
        rule.onAllNodesWithTag(AvatarPresenceDotTestTag, useUnmergedTree = true).assertCountEquals(0)

        presence = null
        rule.waitForIdle()
        rule.onAllNodesWithTag(AvatarPresenceDotTestTag, useUnmergedTree = true).assertCountEquals(0)
    }
}
