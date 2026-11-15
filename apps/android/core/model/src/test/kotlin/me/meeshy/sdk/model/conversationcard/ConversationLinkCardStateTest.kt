package me.meeshy.sdk.model.conversationcard

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.conversationcard.ConversationLinkCardState.CardError
import me.meeshy.sdk.model.conversationcard.ConversationLinkCardState.Pending
import me.meeshy.sdk.model.conversationcard.ConversationLinkCardState.Phase
import me.meeshy.sdk.model.deeplink.ConversationCardTarget
import org.junit.Test

class ConversationLinkCardStateTest {

    private val share = ConversationCardTarget.ShareLink("l1")
    private val direct = ConversationCardTarget.Direct("c1")

    private val outsider = ConversationCard(
        kind = ConversationCardKind.SHARE_LINK,
        title = "Club",
        stats = ConversationCardStats(memberCount = 3),
        viewer = ConversationCardViewer(canJoin = true),
        link = ConversationCardLink(identifier = "l1", isActive = true),
    )

    private val member = ConversationCard(
        kind = ConversationCardKind.DIRECT,
        conversationId = "c1",
        title = "Club",
        stats = ConversationCardStats(memberCount = 3),
        viewer = ConversationCardViewer(isMember = true),
    )

    private fun showing(card: ConversationCard) = ConversationLinkCardState(Phase.Card(card))

    @Test
    fun `a cold card is loading and offers nothing`() {
        val state = ConversationLinkCardState()

        assertThat(state.phase).isEqualTo(Phase.Loading)
        assertThat(state.actions(share)).isEqualTo(ConversationCardActions.None)
    }

    @Test
    fun `a cached card shows at once, fresh or stale`() {
        val cached = ConversationCardResolution.Card(outsider)

        assertThat(ConversationLinkCardState().served(cached, isFresh = true).phase).isEqualTo(Phase.Card(outsider))
        assertThat(ConversationLinkCardState().served(cached, isFresh = false).phase).isEqualTo(Phase.Card(outsider))
    }

    @Test
    fun `a stale unavailable verdict is never served, the card keeps loading`() {
        val state = ConversationLinkCardState().served(ConversationCardResolution.Unavailable, isFresh = false)

        assertThat(state.phase).isEqualTo(Phase.Loading)
    }

    @Test
    fun `a fresh unavailable verdict falls back to the plain preview`() {
        val state = ConversationLinkCardState().served(ConversationCardResolution.Unavailable, isFresh = true)

        assertThat(state.phase).isEqualTo(Phase.Unavailable)
    }

    @Test
    fun `an unavailable verdict never replaces a card already shown`() {
        val state = showing(outsider).served(ConversationCardResolution.Unavailable, isFresh = true)

        assertThat(state.phase).isEqualTo(Phase.Card(outsider))
    }

    @Test
    fun `a private verdict replaces the card`() {
        val state = showing(member).served(ConversationCardResolution.PrivateConversation, isFresh = true)

        assertThat(state.phase).isEqualTo(Phase.PrivateConversation)
    }

    @Test
    fun `a failed refresh on an empty cache gives up to the plain preview`() {
        assertThat(ConversationLinkCardState().refreshFailed().phase).isEqualTo(Phase.Unavailable)
    }

    @Test
    fun `a failed refresh keeps the cached card`() {
        assertThat(showing(outsider).refreshFailed().phase).isEqualTo(Phase.Card(outsider))
    }

    @Test
    fun `joining marks the card busy without lying about membership`() {
        val joining = showing(outsider).joinStarted(share)

        assertThat(joining).isNotNull()
        assertThat(joining!!.pending).isEqualTo(Pending.JOINING)
        assertThat(joining.phase).isEqualTo(Phase.Card(outsider))
        assertThat(joining.error).isNull()
    }

    @Test
    fun `a join cannot start twice, nor on a card that offers no join`() {
        assertThat(showing(outsider).joinStarted(share)!!.joinStarted(share)).isNull()
        assertThat(showing(member).joinStarted(direct)).isNull()
        assertThat(ConversationLinkCardState().joinStarted(share)).isNull()
    }

    @Test
    fun `a confirmed join makes the reader a member and offers leave or open`() {
        val joined = showing(outsider).joinStarted(share)!!.joined("c7")

        assertThat(joined.pending).isEqualTo(Pending.NONE)
        val card = (joined.phase as Phase.Card).card
        assertThat(card.viewer.isMember).isTrue()
        assertThat(card.stats.memberCount).isEqualTo(4)
        assertThat(joined.actions(share)).isEqualTo(ConversationCardActions.LeaveOrOpen("c7"))
    }

    @Test
    fun `a refused join keeps the card and says why`() {
        val joining = showing(outsider).joinStarted(share)!!

        assertThat(joining.joinFailed(404).error).isEqualTo(CardError.LINK_NOT_FOUND)
        assertThat(joining.joinFailed(410).error).isEqualTo(CardError.LINK_INACTIVE)
        assertThat(joining.joinFailed(403).error).isEqualTo(CardError.FORBIDDEN)
        assertThat(joining.joinFailed(null).error).isEqualTo(CardError.JOIN_FAILED)
        assertThat(joining.joinFailed(500).pending).isEqualTo(Pending.NONE)
        assertThat(joining.joinFailed(500).phase).isEqualTo(Phase.Card(outsider))
    }

    @Test
    fun `leaving is optimistic`() {
        val leaving = showing(member).leaveStarted(direct)!!

        assertThat(leaving.pending).isEqualTo(Pending.LEAVING)
        assertThat((leaving.phase as Phase.Card).card.viewer.isMember).isFalse()
        assertThat((leaving.phase as Phase.Card).card.stats.memberCount).isEqualTo(2)
    }

    @Test
    fun `leave only starts for a member`() {
        assertThat(showing(outsider).leaveStarted(share)).isNull()
        assertThat(showing(member).leaveStarted(direct)!!.leaveStarted(direct)).isNull()
    }

    @Test
    fun `after leaving a direct link the conversation is private`() {
        val left = showing(member).leaveStarted(direct)!!.left()

        assertThat(left.phase).isEqualTo(Phase.PrivateConversation)
        assertThat(left.pending).isEqualTo(Pending.NONE)
    }

    @Test
    fun `after leaving a share link the card offers to join again`() {
        val shareMember = outsider.copy(conversationId = "c7", viewer = ConversationCardViewer(isMember = true))

        val left = showing(shareMember).leaveStarted(share)!!.left()

        assertThat(left.actions(share)).isEqualTo(ConversationCardActions.Join(identifier = "l1", allowsAnonymous = false))
    }

    @Test
    fun `a refused leave restores the card before and says so`() {
        val failed = showing(member).leaveStarted(direct)!!.leaveFailed()

        assertThat(failed.phase).isEqualTo(Phase.Card(member))
        assertThat(failed.pending).isEqualTo(Pending.NONE)
        assertThat(failed.error).isEqualTo(CardError.LEAVE_FAILED)
    }

    @Test
    fun `a busy card ignores what the cache serves meanwhile`() {
        val joining = showing(outsider).joinStarted(share)!!

        assertThat(joining.served(ConversationCardResolution.PrivateConversation, isFresh = true)).isEqualTo(joining)
    }

    @Test
    fun `the conversation a card designates is its direct target or the served id`() {
        assertThat(showing(member).designates("c1", direct)).isTrue()
        assertThat(showing(outsider.copy(conversationId = "c7")).designates("c7", share)).isTrue()
        assertThat(showing(outsider).designates("c7", share)).isFalse()
        assertThat(ConversationLinkCardState().designates("c1", direct)).isTrue()
    }
}
