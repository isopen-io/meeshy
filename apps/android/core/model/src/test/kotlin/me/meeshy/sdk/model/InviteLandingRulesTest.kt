package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test
import me.meeshy.sdk.model.InviteLandingChoice.*

class InviteLandingRulesTest {
    private val now = 1_000_000L

    @Test
    fun `connecte - compte d'abord puis anonyme si autorise`() {
        assertThat(InviteLandingRules.choices(true, requireAccount = false)).containsExactly(JOIN_WITH_ACCOUNT, JOIN_ANONYMOUSLY).inOrder()
        assertThat(InviteLandingRules.choices(true, requireAccount = true)).containsExactly(JOIN_WITH_ACCOUNT)
    }

    @Test
    fun `deconnecte - anonyme d'abord sauf compte requis`() {
        assertThat(InviteLandingRules.choices(false, false)).containsExactly(JOIN_ANONYMOUSLY, SIGN_IN, SIGN_UP).inOrder()
        assertThat(InviteLandingRules.choices(false, true)).containsExactly(SIGN_IN, SIGN_UP).inOrder()
    }

    @Test
    fun `lien ferme - aucun choix quelle que soit la combinaison`() {
        for (signed in listOf(true, false)) for (req in listOf(true, false)) {
            assertThat(InviteLandingRules.choices(signed, req, isOpen = false)).isEmpty()
        }
    }

    @Test
    fun `landingChoices ferme un lien expire ou plein`() {
        val expired = ShareLinkInfo(id = "1", expiresAt = now)
        val full = ShareLinkInfo(id = "1", maxUses = 2, currentUses = 2)
        val open = ShareLinkInfo(id = "1", maxUses = 2, currentUses = 1, expiresAt = now + 1)
        assertThat(expired.landingChoices(true, now)).isEmpty()
        assertThat(full.landingChoices(false, now)).isEmpty()
        assertThat(open.landingChoices(false, now)).containsExactly(JOIN_ANONYMOUSLY, SIGN_IN, SIGN_UP).inOrder()
    }

    @Test
    fun `champs demandes dans l'ordre d'affichage`() {
        assertThat(InviteLandingRules.requestedFields(false, false, false)).containsExactly(InviteRequestedField.NAME)
        assertThat(InviteLandingRules.requestedFields(true, true, true))
            .containsExactly(InviteRequestedField.NAME, InviteRequestedField.NICKNAME, InviteRequestedField.EMAIL, InviteRequestedField.BIRTHDAY).inOrder()
        assertThat(ShareLinkInfo(id = "1", requireBirthday = true).requestedFields)
            .containsExactly(InviteRequestedField.NAME, InviteRequestedField.BIRTHDAY).inOrder()
    }

    @Test
    fun `libelle du choix anonyme - reprendre rejoindre ou continuer`() {
        assertThat(InviteLandingRules.titleKey(JOIN_ANONYMOUSLY, isSignedIn = true, resumesGuestSession = true)).isEqualTo("inviteLanding.choice.resumeAnonymously")
        assertThat(InviteLandingRules.titleKey(JOIN_ANONYMOUSLY, true, false)).isEqualTo("inviteLanding.choice.joinAnonymously")
        assertThat(InviteLandingRules.titleKey(JOIN_ANONYMOUSLY, false, false)).isEqualTo("inviteLanding.choice.continueAnonymously")
        assertThat(InviteLandingRules.titleKey(SIGN_UP, false, false)).isEqualTo("inviteLanding.choice.signUp")
    }
}
