package me.meeshy.sdk.model.call.group

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.call.CallInviteOutcome
import me.meeshy.sdk.model.call.CallInvitedUser
import org.junit.Test

/** Les invitations qui sonnent et le mot qui suit leur fin, miroir de iOS `CallControlsController` (#13753). */
class CallInviteBoardTest {

    private fun invite(id: String, name: String = id.replaceFirstChar(Char::uppercase)) = CallPendingInvite(id, name)

    @Test
    fun `an invitee rings once, in the order it started ringing`() {
        val board = CallInviteBoard()
            .ringing(invite("bob"))
            .ringing(invite("carol"))
            .ringing(invite("bob"))
            .ringing(invite(""))

        assertThat(board.invites.map { it.userId }).containsExactly("bob", "carol").inOrder()
        assertThat(board.ringingIds).containsExactly("bob", "carol")
    }

    @Test
    fun `a decline and a missing answer each say who, and leave the strip`() {
        val board = CallInviteBoard().ringing(invite("bob", "Bob")).ringing(invite("carol", "Carol"))

        val declined = board.settled("bob", CallInviteOutcome.DECLINED)
        assertThat(declined.notice).isEqualTo(CallInviteNotice.Declined("Bob"))
        assertThat(declined.ringingIds).containsExactly("carol")

        val unanswered = declined.settled("carol", CallInviteOutcome.EXPIRED)
        assertThat(unanswered.notice).isEqualTo(CallInviteNotice.Unanswered("Carol"))
        assertThat(unanswered.invites).isEmpty()
    }

    @Test
    fun `a settlement for nobody ringing says nothing`() {
        val board = CallInviteBoard().ringing(invite("bob"))

        assertThat(board.settled("dan", CallInviteOutcome.DECLINED)).isSameInstanceAs(board)
        assertThat(board.withdrawn("bob").settled("bob", CallInviteOutcome.EXPIRED).notice).isNull()
    }

    @Test
    fun `inviting clears the previous word, a gateway refusal says so, joining says nothing`() {
        val afterDecline = CallInviteBoard().ringing(invite("bob")).settled("bob", CallInviteOutcome.DECLINED)

        val inviting = afterDecline.inviting(invite("carol"))
        assertThat(inviting.notice).isNull()
        assertThat(inviting.ringingIds).containsExactly("carol")

        val refused = inviting.refused("carol")
        assertThat(refused.notice).isEqualTo(CallInviteNotice.Failed)
        assertThat(refused.invites).isEmpty()

        val joined = CallInviteBoard().ringing(invite("dan")).withdrawn("dan")
        assertThat(joined.invites).isEmpty()
        assertThat(joined.notice).isNull()
        assertThat(joined.dismissingNotice()).isSameInstanceAs(joined)
        assertThat(refused.dismissingNotice().notice).isNull()
    }

    @Test
    fun `the strip names the invitee by display name, else by username, like iOS`() {
        assertThat(CallPendingInvite.of(CallInvitedUser("u1", "ada", displayName = "Ada L.", avatar = "a.png")))
            .isEqualTo(CallPendingInvite("u1", "Ada L.", "a.png"))
        assertThat(CallPendingInvite.of(CallInvitedUser("u2", "bruno", displayName = " ", avatar = "")))
            .isEqualTo(CallPendingInvite("u2", "bruno", null))
    }
}
