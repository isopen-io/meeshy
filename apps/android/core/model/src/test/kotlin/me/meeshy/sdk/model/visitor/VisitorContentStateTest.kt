package me.meeshy.sdk.model.visitor

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.ApiPost
import me.meeshy.sdk.model.ContentFetchFailure
import me.meeshy.sdk.model.TrackedLinkSharer
import org.junit.Test

class VisitorContentStateTest {
    private val served = VisitorContentState.Served(ApiPost(id = "p"), sharer = null)

    @Test
    fun `les gestes de la carte suivent l etat comme iOS`() {
        assertThat(VisitorInvitationAction.actions(VisitorContentState.Pending)).isEmpty()
        assertThat(VisitorInvitationAction.actions(served))
            .containsExactly(VisitorInvitationAction.SIGN_UP, VisitorInvitationAction.SIGN_IN, VisitorInvitationAction.KEEP_WATCHING).inOrder()
        assertThat(VisitorInvitationAction.actions(VisitorContentState.Refused))
            .containsExactly(VisitorInvitationAction.SIGN_UP, VisitorInvitationAction.SIGN_IN).inOrder()
        assertThat(VisitorInvitationAction.actions(VisitorContentState.Failed(ContentFetchFailure.NETWORK)))
            .containsExactly(VisitorInvitationAction.RETRY, VisitorInvitationAction.SIGN_UP, VisitorInvitationAction.SIGN_IN).inOrder()
    }

    @Test
    fun `un refus ou une panne ne laissent jamais une page vide mais le fond neutre`() {
        assertThat(VisitorContentSurface.of(VisitorContentState.Pending)).isEqualTo(VisitorContentSurface.LOADING)
        assertThat(VisitorContentSurface.of(served)).isEqualTo(VisitorContentSurface.READER)
        assertThat(VisitorContentSurface.of(VisitorContentState.Refused)).isEqualTo(VisitorContentSurface.NEUTRAL_BACKDROP)
        assertThat(VisitorContentSurface.of(VisitorContentState.Failed(ContentFetchFailure.SERVER))).isEqualTo(VisitorContentSurface.NEUTRAL_BACKDROP)
    }

    @Test
    fun `la carte n apparait pas pendant le chargement et se referme sur continuer a regarder`() {
        assertThat(VisitorContentState.Pending.showsCard(dismissed = false)).isFalse()
        assertThat(served.showsCard(dismissed = false)).isTrue()
        assertThat(served.showsCard(dismissed = true)).isFalse()
        assertThat(VisitorContentState.Refused.showsCard(dismissed = true)).isTrue()
    }

    @Test
    fun `le nom du partageur est le nom affiche sinon le pseudo precede d un arobase`() {
        assertThat(VisitorSharerName.of(TrackedLinkSharer(displayName = " Ada ", username = "ada"))).isEqualTo("Ada")
        assertThat(VisitorSharerName.of(TrackedLinkSharer(displayName = "  ", username = "ada"))).isEqualTo("@ada")
        assertThat(VisitorSharerName.of(TrackedLinkSharer(displayName = null, username = "ada"))).isEqualTo("@ada")
    }
}
