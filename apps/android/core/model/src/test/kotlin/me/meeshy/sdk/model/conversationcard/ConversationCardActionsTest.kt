package me.meeshy.sdk.model.conversationcard

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.deeplink.ConversationCardTarget
import org.junit.Test

class ConversationCardActionsTest {

    private val share = ConversationCardTarget.ShareLink("from_url")
    private val direct = ConversationCardTarget.Direct("c-direct")

    private fun card(
        kind: ConversationCardKind = ConversationCardKind.SHARE_LINK,
        conversationId: String? = null,
        viewer: ConversationCardViewer = ConversationCardViewer(),
        link: ConversationCardLink? = ConversationCardLink(identifier = "served_id", isActive = true),
    ) = ConversationCard(kind = kind, conversationId = conversationId, title = "Club", viewer = viewer, link = link)

    @Test
    fun `an expired link offers nothing, even to a member`() {
        val expired = ConversationCardLink(identifier = "l", isActive = false)

        assertThat(ConversationCardActions.resolve(card(link = expired, viewer = ConversationCardViewer(canJoin = true)), share))
            .isEqualTo(ConversationCardActions.None)
        assertThat(ConversationCardActions.resolve(card(link = expired, conversationId = "c1", viewer = ConversationCardViewer(isMember = true)), share))
            .isEqualTo(ConversationCardActions.None)
    }

    @Test
    fun `a member may leave or open, by the served id`() {
        val member = card(conversationId = "c1", viewer = ConversationCardViewer(isMember = true))

        assertThat(ConversationCardActions.resolve(member, share)).isEqualTo(ConversationCardActions.LeaveOrOpen("c1"))
    }

    @Test
    fun `a member of a direct link falls back to the id of the url`() {
        val member = card(kind = ConversationCardKind.DIRECT, link = null, viewer = ConversationCardViewer(isMember = true))

        assertThat(ConversationCardActions.resolve(member, direct)).isEqualTo(ConversationCardActions.LeaveOrOpen("c-direct"))
    }

    @Test
    fun `a non member of an open share link may join with the served identifier`() {
        val outsider = card(viewer = ConversationCardViewer(canJoin = true))

        assertThat(ConversationCardActions.resolve(outsider, share))
            .isEqualTo(ConversationCardActions.Join(identifier = "served_id", allowsAnonymous = false))
    }

    @Test
    fun `anonymous follows the link verdict alone`() {
        val outsider = card(viewer = ConversationCardViewer(canJoin = true, canJoinAnonymously = true))

        assertThat(ConversationCardActions.resolve(outsider, share))
            .isEqualTo(ConversationCardActions.Join(identifier = "served_id", allowsAnonymous = true))
    }

    @Test
    fun `a link that only allows anonymous still offers to join`() {
        val outsider = card(viewer = ConversationCardViewer(canJoin = false, canJoinAnonymously = true))

        assertThat(ConversationCardActions.resolve(outsider, share))
            .isEqualTo(ConversationCardActions.Join(identifier = "served_id", allowsAnonymous = true))
    }

    @Test
    fun `without a served link the identifier of the url is used`() {
        val outsider = card(link = null, viewer = ConversationCardViewer(canJoin = true))

        assertThat(ConversationCardActions.resolve(outsider, share))
            .isEqualTo(ConversationCardActions.Join(identifier = "from_url", allowsAnonymous = false))
    }

    @Test
    fun `a refused join offers nothing`() {
        assertThat(ConversationCardActions.resolve(card(viewer = ConversationCardViewer()), share))
            .isEqualTo(ConversationCardActions.None)
    }

    @Test
    fun `a direct card never offers to join`() {
        val outsider = card(kind = ConversationCardKind.DIRECT, link = null, viewer = ConversationCardViewer(canJoin = true))

        assertThat(ConversationCardActions.resolve(outsider, direct)).isEqualTo(ConversationCardActions.None)
    }
}
