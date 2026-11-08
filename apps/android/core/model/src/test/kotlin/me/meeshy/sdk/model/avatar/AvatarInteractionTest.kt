package me.meeshy.sdk.model.avatar

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class AvatarInteractionTest {
    private fun target(unread: Boolean = false, story: Boolean = false, tap: Boolean = false, profile: Boolean = false) =
        AvatarInteraction.tapTarget(unread, story, tap, profile)

    @Test
    fun `une story non lue ouvre la story avant tout autre geste`() {
        assertThat(target(unread = true, story = true, tap = true, profile = true)).isEqualTo(AvatarTapTarget.STORY)
    }

    @Test
    fun `une story non lue sans ouvreur retombe sur le toucher puis le profil`() {
        assertThat(target(unread = true, tap = true, profile = true)).isEqualTo(AvatarTapTarget.TAP)
        assertThat(target(unread = true, profile = true)).isEqualTo(AvatarTapTarget.PROFILE)
    }

    @Test
    fun `une story lue ne detourne pas le toucher`() {
        assertThat(target(unread = false, story = true, tap = true)).isEqualTo(AvatarTapTarget.TAP)
    }

    @Test
    fun `aucun geste donne aucune cible`() {
        assertThat(target()).isEqualTo(AvatarTapTarget.NONE)
    }

    @Test
    fun `tactile demande le contexte et un geste`() {
        assertThat(AvatarInteraction.isTappable(true, hasTap = false, hasViewProfile = false, hasViewStory = true)).isTrue()
        assertThat(AvatarInteraction.isTappable(false, hasTap = true, hasViewProfile = true, hasViewStory = true)).isFalse()
        assertThat(AvatarInteraction.isTappable(true, false, false, false)).isFalse()
    }

    private fun menu(
        tappable: Boolean = true,
        isUser: Boolean = true,
        hasStory: Boolean = true,
        profile: Boolean = true,
        story: Boolean = true,
        custom: List<AvatarMenuEntry> = emptyList(),
    ) = AvatarInteraction.menu(tappable, isUser, hasStory, profile, story, "Voir le profil", "Voir la story", custom)

    @Test
    fun `le menu liste profil puis story puis les entrees de l hote`() {
        val mute = AvatarMenuEntry(AvatarMenuKind.CUSTOM, "Mettre en sourdine", "mute")
        assertThat(menu(custom = listOf(mute)).map { it.label })
            .containsExactly("Voir le profil", "Voir la story", "Mettre en sourdine").inOrder()
    }

    @Test
    fun `une entree hote au libelle du profil n est pas dupliquee`() {
        val dup = AvatarMenuEntry(AvatarMenuKind.CUSTOM, "Voir le profil", "profile")
        assertThat(menu(custom = listOf(dup)).map { it.label }).containsExactly("Voir le profil", "Voir la story").inOrder()
    }

    @Test
    fun `la story n apparait que pour un utilisateur qui en a une`() {
        assertThat(menu(hasStory = false).map { it.kind }).containsExactly(AvatarMenuKind.PROFILE)
        assertThat(menu(isUser = false).map { it.kind }).containsExactly(AvatarMenuKind.PROFILE)
    }

    @Test
    fun `hors contexte tactile le menu est vide`() {
        assertThat(menu(tappable = false)).isEmpty()
    }
}
