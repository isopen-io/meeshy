package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test
import me.meeshy.sdk.model.InviteLandingChoice.*

class InviteChoicesPanelStateTest {
    private val now = 1_000L

    private fun link(requireAccount: Boolean = false, maxUses: Int? = null, uses: Int = 0) =
        ShareLinkInfo(id = "1", requireAccount = requireAccount, maxUses = maxUses, currentUses = uses)

    @Test
    fun `deconnecte avec anonyme - principal anonyme et legende sous le principal`() {
        val panel = InviteChoicesPanelState.from(link(), now, isSignedIn = false)
        assertThat(panel.primary).isEqualTo(JOIN_ANONYMOUSLY)
        assertThat(panel.secondary).containsExactly(SIGN_IN, SIGN_UP).inOrder()
        assertThat(panel.captionAfterPrimary).isEqualTo(InviteChoiceCaption.ANONYMOUS_SIGNED_OUT)
        assertThat(panel.captionAfterSecondary).isNull()
        assertThat(panel.notice).isNull()
    }

    @Test
    fun `deconnecte compte requis - avis et aucun anonyme`() {
        val panel = InviteChoicesPanelState.from(link(requireAccount = true), now, isSignedIn = false)
        assertThat(panel.primary).isEqualTo(SIGN_IN)
        assertThat(panel.notice).isEqualTo(InviteChoiceNotice.ACCOUNT_REQUIRED)
        assertThat(panel.captionAfterPrimary).isNull()
    }

    @Test
    fun `connecte - compte d'abord et legende sous les secondaires`() {
        val panel = InviteChoicesPanelState.from(link(), now, isSignedIn = true)
        assertThat(panel.primary).isEqualTo(JOIN_WITH_ACCOUNT)
        assertThat(panel.secondary).containsExactly(JOIN_ANONYMOUSLY)
        assertThat(panel.captionAfterSecondary).isEqualTo(InviteChoiceCaption.ANONYMOUS_SIGNED_IN)
        assertThat(panel.captionAfterPrimary).isNull()
        assertThat(panel.notice).isNull()
    }

    @Test
    fun `connecte compte requis - un seul choix sans legende ni avis`() {
        val panel = InviteChoicesPanelState.from(link(requireAccount = true), now, isSignedIn = true)
        assertThat(panel.primary).isEqualTo(JOIN_WITH_ACCOUNT)
        assertThat(panel.secondary).isEmpty()
        assertThat(panel.captionAfterSecondary).isNull()
        assertThat(panel.notice).isNull()
    }

    @Test
    fun `lien ferme - aucun choix et avis lien ferme`() {
        for (signed in listOf(true, false)) {
            val panel = InviteChoicesPanelState.from(link(maxUses = 1, uses = 1), now, isSignedIn = signed)
            assertThat(panel.primary).isNull()
            assertThat(panel.secondary).isEmpty()
            assertThat(panel.notice).isEqualTo(InviteChoiceNotice.CLOSED)
        }
    }

    @Test
    fun `reprise de session invitee - le libelle devient reprendre`() {
        val panel = InviteChoicesPanelState.from(link(), now, isSignedIn = true, resumesGuestSession = true)
        assertThat(panel.titleKey(JOIN_ANONYMOUSLY)).isEqualTo("inviteLanding.choice.resumeAnonymously")
        assertThat(panel.titleKey(JOIN_WITH_ACCOUNT)).isEqualTo("inviteLanding.choice.joinWithAccount")
    }

    @Test
    fun `le visage du compte n'est montre que sur rejoindre avec mon compte`() {
        val face = InviteAccountFace("Camille Durand", null)
        assertThat(InviteChoicesPanelState.from(link(), now, true, accountFace = face).showsAccountFace).isTrue()
        assertThat(InviteChoicesPanelState.from(link(), now, false, accountFace = face).showsAccountFace).isFalse()
    }

    @Test
    fun `initiales - deux premieres lettres de mots`() {
        assertThat(InviteAccountFace("camille durand", null).initials).isEqualTo("CD")
        assertThat(InviteAccountFace("Théo (foot)", null).initials).isEqualTo("TF")
        assertThat(InviteAccountFace("  ", null).initials).isEqualTo("?")
    }
}
