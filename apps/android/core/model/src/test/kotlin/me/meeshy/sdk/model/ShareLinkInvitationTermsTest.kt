package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class ShareLinkInvitationTermsTest {
    private val now = 1_000_000_000L
    private val day = 86_400_000L

    private fun info(
        expiresAt: Long? = null,
        maxUses: Int? = null,
        currentUses: Int = 0,
        rights: ShareLinkGuestRights = ShareLinkGuestRights.SCHEMA_DEFAULTS,
        languages: List<String> = emptyList(),
        nickname: Boolean = false,
    ) = ShareLinkInfo(
        id = "1", expiresAt = expiresAt, maxUses = maxUses, currentUses = currentUses,
        guestRights = rights, allowedLanguages = languages, requireNickname = nickname,
    )

    @Test
    fun `les droits suivent l'ordre messages images historique fichiers`() {
        val terms = ShareLinkInvitationTerms.from(info(), now)
        assertThat(terms.rights.map { it.right }).containsExactly(
            InviteGuestRight.MESSAGES, InviteGuestRight.IMAGES, InviteGuestRight.HISTORY, InviteGuestRight.FILES,
        ).inOrder()
        assertThat(terms.rights.map { it.allowed }).containsExactly(true, true, true, false).inOrder()
    }

    @Test
    fun `sans echeance le lien est sans limite de duree`() {
        assertThat(ShareLinkInvitationTerms.from(info(), now).validity).isEqualTo(InviteValidity.NoExpiry)
    }

    @Test
    fun `une echeance atteinte est expiree`() {
        assertThat(ShareLinkInvitationTerms.from(info(expiresAt = now), now).validity).isEqualTo(InviteValidity.Expired)
    }

    @Test
    fun `les jours restants arrondissent au dessus`() {
        assertThat(ShareLinkInvitationTerms.from(info(expiresAt = now + 5 * 3_600_000L), now).validity)
            .isEqualTo(InviteValidity.DaysLeft(1))
        assertThat(ShareLinkInvitationTerms.from(info(expiresAt = now + 2 * day + 1), now).validity)
            .isEqualTo(InviteValidity.DaysLeft(3))
    }

    @Test
    fun `les places restantes et le maximum voyagent ensemble`() {
        val terms = ShareLinkInvitationTerms.from(info(maxUses = 10, currentUses = 4), now)
        assertThat(terms.remainingPlaces).isEqualTo(6)
        assertThat(terms.maxUses).isEqualTo(10)
        assertThat(ShareLinkInvitationTerms.from(info(), now).remainingPlaces).isNull()
    }

    @Test
    fun `le nom est toujours demande puis ce que le lien ajoute`() {
        val terms = ShareLinkInvitationTerms.from(info(nickname = true, languages = listOf("fr", "ko")), now)
        assertThat(terms.requestedFields).containsExactly(InviteRequestedField.NAME, InviteRequestedField.NICKNAME).inOrder()
        assertThat(terms.acceptedLanguages).containsExactly("fr", "ko").inOrder()
    }
}
