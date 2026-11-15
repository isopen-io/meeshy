package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class CommunityDraftsTest {

    @Test
    fun `un nom vide ou blanc rend le brouillon invalide`() {
        assertThat(CommunityCreateDraft().isValid).isFalse()
        assertThat(CommunityCreateDraft(name = "   ").isValid).isFalse()
        assertThat(CommunityCreateDraft(name = " Club ").isValid).isTrue()
    }

    @Test
    fun `la requete rogne le nom et omet identifiant et description vides`() {
        val request = CommunityCreateDraft(name = " Club ", description = "  ", isPrivate = false).toRequest()
        assertThat(request).isEqualTo(CreateCommunityRequest("Club", null, null, false))
    }

    @Test
    fun `l'identifiant ne garde que les caracteres que la passerelle accepte`() {
        val draft = CommunityCreateDraft().withIdentifier("mon groupe!#é_1-@x")
        assertThat(draft.identifier).isEqualTo("mongroupe_1-@x")
    }

    @Test
    fun `le nom est borne a 100 caracteres`() {
        assertThat(CommunityCreateDraft().withName("a".repeat(150)).name).hasLength(100)
    }

    @Test
    fun `choisir deux fois le meme emoji le retire`() {
        val once = CommunityCreateDraft().withEmojiToggled("🚀")
        assertThat(once.emoji).isEqualTo("🚀")
        assertThat(once.withEmojiToggled("🚀").emoji).isEmpty()
        assertThat(once.withEmojiToggled("🔥").emoji).isEqualTo("🔥")
    }

    @Test
    fun `un membre se choisit puis se retire sans doublon`() {
        val draft = CommunityCreateDraft().withMemberToggled("a").withMemberToggled("b")
        assertThat(draft.memberIds).containsExactly("a", "b").inOrder()
        assertThat(draft.withMemberToggled("a").memberIds).containsExactly("b")
    }

    @Test
    fun `rendre privee une communaute publique se confirme, pas la rouvrir ni un autre changement`() {
        val publique = CommunitySettingsDraft.of(fields().copy(isPrivate = false))
        assertThat(publique.needsPrivacyConfirmation).isFalse()
        assertThat(publique.edit { it.copy(isPrivate = true) }.needsPrivacyConfirmation).isTrue()
        assertThat(publique.edit { it.copy(name = "Club du jeudi") }.needsPrivacyConfirmation).isFalse()
        val privee = CommunitySettingsDraft.of(fields())
        assertThat(privee.edit { it.copy(isPrivate = false) }.needsPrivacyConfirmation).isFalse()
    }

    private fun fields() = CommunitySettingsFields("Club", "desc", true, "", "", "6366F1", "")

    @Test
    fun `un brouillon intact n'a aucun changement ni requete`() {
        val draft = CommunitySettingsDraft.of(fields())
        assertThat(draft.hasChanges).isFalse()
        assertThat(draft.toUpdateRequest()).isNull()
    }

    @Test
    fun `seule la couleur locale change - enregistrable sans requete serveur`() {
        val draft = CommunitySettingsDraft.of(fields()).edit { it.copy(color = "FF2E63") }
        assertThat(draft.hasChanges).isTrue()
        assertThat(draft.hasLocalChanges).isTrue()
        assertThat(draft.canSave).isTrue()
        assertThat(draft.toUpdateRequest()).isNull()
    }

    @Test
    fun `la requete ne porte que les champs modifies`() {
        val draft = CommunitySettingsDraft.of(fields()).edit { it.copy(name = " Nouveau ", isPrivate = false, bannerUrl = "https://b") }
        assertThat(draft.toUpdateRequest())
            .isEqualTo(UpdateCommunityRequest(name = "Nouveau", isPrivate = false, banner = "https://b"))
    }

    @Test
    fun `un nom vide interdit l'enregistrement`() {
        val draft = CommunitySettingsDraft.of(fields()).edit { it.copy(name = " ") }
        assertThat(draft.canSave).isFalse()
    }

    @Test
    fun `la fusion de pages remplace puis ajoute sans doublon`() {
        assertThat(CommunityPaging.merge(listOf("a"), listOf("b"), append = false) { it }).containsExactly("b")
        assertThat(CommunityPaging.merge(listOf("a", "b"), listOf("b", "c", "c"), append = true) { it })
            .containsExactly("a", "b", "c").inOrder()
    }

    @Test
    fun `la recherche ne part qu'a partir de deux caracteres`() {
        assertThat(CommunityPaging.searchQuery("a")).isNull()
        assertThat(CommunityPaging.searchQuery(" ab ")).isEqualTo("ab")
    }

    private fun convo(id: String, communityId: String? = null, role: String? = null) =
        ApiConversation(id = id, type = "group", communityId = communityId, currentUserRole = role)

    @Test
    fun `le selecteur de channel exclut celles de la communaute et celles qu'on n'administre pas`() {
        val all = listOf(
            convo("a", role = "admin"),
            convo("b", communityId = "c1", role = "admin"),
            convo("c", role = "member"),
            convo("d", communityId = "c2", role = "creator"),
            convo("e"),
        )
        assertThat(CommunityChannelPicker.candidates(all, "c1").map { it.id }).containsExactly("a", "d", "e").inOrder()
    }

    @Test
    fun `rattacher une conversation d'une autre communaute demande confirmation`() {
        assertThat(CommunityChannelPicker.requiresMoveConfirmation(convo("a", "c2"), "c1")).isTrue()
        assertThat(CommunityChannelPicker.requiresMoveConfirmation(convo("a"), "c1")).isFalse()
    }

    @Test
    fun `la recherche de channel ignore la casse`() {
        val items = listOf(convo("a"), convo("b"))
        val titles = mapOf("a" to "Général", "b" to "Design")
        assertThat(CommunityChannelPicker.filter(items, titles, "gÉn").map { it.id }).containsExactly("a")
        assertThat(CommunityChannelPicker.filter(items, titles, " ")).hasSize(2)
    }
}

class CommunityChannelPagingTest {
    @org.junit.Test
    fun `pages of twenty reveal the list progressively and stop at its end`() {
        com.google.common.truth.Truth.assertThat(CommunityPaging.shownCount(45, 1)).isEqualTo(20)
        com.google.common.truth.Truth.assertThat(CommunityPaging.shownCount(45, 3)).isEqualTo(45)
        com.google.common.truth.Truth.assertThat(CommunityPaging.hasMore(45, 2)).isTrue()
        com.google.common.truth.Truth.assertThat(CommunityPaging.hasMore(45, 3)).isFalse()
        com.google.common.truth.Truth.assertThat(CommunityPaging.shownCount(5, 1)).isEqualTo(5)
    }
}
