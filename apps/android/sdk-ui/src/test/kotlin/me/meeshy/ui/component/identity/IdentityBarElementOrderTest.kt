package me.meeshy.ui.component.identity

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.MemberRole
import me.meeshy.ui.component.bubble.LanguageChip
import org.junit.Test

class IdentityBarElementOrderTest {

    private fun kinds(list: List<IdentityBarElement>) = list.map { it::class.simpleName }

    private val chips = listOf(LanguageChip("fr", null, isOriginal = false, isActive = true))

    @Test
    fun `bulle directe garde l heure et le statut a droite`() {
        val slots = IdentityBarPresets.messageBubble(
            role = MemberRole.ADMIN, time = "12:45", delivery = IdentityDeliveryStatus.Read,
            flags = chips, onFlagTap = {}, onTranslateTap = {}, username = "atabeth", inlineTime = false,
        )
        assertThat(kinds(slots.leadingPrimary)).containsExactly("Name", "RoleBadge", "Text", "Flags", "TranslateButton").inOrder()
        assertThat(kinds(slots.trailingPrimary)).containsExactly("Time", "Delivery").inOrder()
        assertThat(kinds(slots.leadingSecondary)).containsExactly("Username")
    }

    @Test
    fun `bulle de groupe place l heure en ligne avec l auteur`() {
        val slots = IdentityBarPresets.messageBubble(
            role = null, time = "12:45", delivery = null, flags = emptyList(),
            onFlagTap = null, onTranslateTap = null, username = null, inlineTime = true,
        )
        assertThat(kinds(slots.leadingPrimary)).containsExactly("Name", "Text", "Time").inOrder()
        assertThat(slots.trailingPrimary).isEmpty()
    }

    @Test
    fun `le role membre n affiche aucun badge`() {
        val slots = IdentityBarPresets.messageBubble(
            role = MemberRole.MEMBER, time = "", delivery = null, flags = emptyList(),
            onFlagTap = null, onTranslateTap = null, username = null, inlineTime = false,
        )
        assertThat(kinds(slots.leadingPrimary)).containsExactly("Name")
        assertThat(slots.trailingPrimary).isEmpty()
    }

    @Test
    fun `commentaire range drapeaux et traduire sur la seconde ligne`() {
        val slots = IdentityBarPresets.comment(
            role = MemberRole.CREATOR, time = "2 h", flags = chips, onFlagTap = {}, onTranslateTap = {}, username = "u",
        )
        assertThat(kinds(slots.leadingPrimary)).containsExactly("Name", "RoleBadge").inOrder()
        assertThat(kinds(slots.trailingPrimary)).containsExactly("Time")
        assertThat(kinds(slots.trailingSecondary)).containsExactly("Flags", "TranslateButton").inOrder()
    }

    @Test
    fun `le nom se tronque en premier puis le pseudo, le reste jamais`() {
        assertThat(IdentityBarElement.Name.truncation).isEqualTo(IdentityTruncation.First)
        assertThat(IdentityBarElement.Username("a").truncation).isEqualTo(IdentityTruncation.Second)
        assertThat(IdentityBarElement.Time("1").truncation).isEqualTo(IdentityTruncation.Never)
        assertThat(IdentityBarElement.RoleBadge(MemberRole.ADMIN).truncation).isEqualTo(IdentityTruncation.Never)
        assertThat(IdentityBarElement.Delivery(IdentityDeliveryStatus.Sent).truncation).isEqualTo(IdentityTruncation.Never)
    }

    @Test
    fun `le badge de role suit la table createur ambre admin indigo 500 moderateur indigo 400`() {
        assertThat(RoleBadgeStyle.of(MemberRole.CREATOR)).isEqualTo(RoleBadgeStyle.Creator)
        assertThat(RoleBadgeStyle.of(MemberRole.ADMIN)).isEqualTo(RoleBadgeStyle.Admin)
        assertThat(RoleBadgeStyle.of(MemberRole.MODERATOR)).isEqualTo(RoleBadgeStyle.Moderator)
        assertThat(RoleBadgeStyle.of(MemberRole.MEMBER)).isNull()
    }

    @Test
    fun `les identifiants distinguent les elements`() {
        assertThat(IdentityBarElement.Text("·", "time").id).isNotEqualTo(IdentityBarElement.Text("·", "flags").id)
    }
}
