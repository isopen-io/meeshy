package me.meeshy.sdk.model.composer

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.StoryVisibility
import me.meeshy.sdk.model.composer.StoryRepublishAudience.Change
import me.meeshy.sdk.model.composer.StoryRepublishAudience.Choice
import org.junit.Test

class StoryRepublishAudienceTest {

    private fun proposal(raw: String?, ids: List<String>? = null, blocked: Set<String> = emptySet()) =
        StoryRepublishAudience.proposal(raw, ids, selfId = "me", blocked = blocked)

    @Test
    fun `la proposition est l'audience precedente`() {
        assertThat(proposal("FRIENDS")).isEqualTo(Choice(StoryVisibility.FRIENDS))
        assertThat(proposal("public")).isEqualTo(Choice(StoryVisibility.PUBLIC))
    }

    @Test
    fun `une audience absente ou perimee decroit vers PRIVATE jamais vers PUBLIC`() {
        assertThat(proposal(null).visibility).isEqualTo(StoryVisibility.PRIVATE)
        assertThat(proposal("GALAXY").visibility).isEqualTo(StoryVisibility.PRIVATE)
    }

    @Test
    fun `sous ONLY la liste perd soi et les bloques, sous EXCEPT seulement soi`() {
        val only = proposal("ONLY", listOf("a", "me", "b", "a"), blocked = setOf("b"))
        assertThat(only.userIds).containsExactly("a")
        val except = proposal("EXCEPT", listOf("a", "me", "b"), blocked = setOf("b"))
        assertThat(except.userIds).containsExactly("a", "b").inOrder()
    }

    @Test
    fun `hors ONLY et EXCEPT aucune liste ne survit`() {
        assertThat(proposal("FRIENDS", listOf("a")).userIds).isEmpty()
        val moved = StoryRepublishAudience.choose(Choice(StoryVisibility.ONLY, listOf("a")), StoryVisibility.PUBLIC, "me", emptySet())
        assertThat(moved.userIds).isEmpty()
    }

    @Test
    fun `passer de ONLY a EXCEPT garde la liste`() {
        val moved = StoryRepublishAudience.choose(Choice(StoryVisibility.ONLY, listOf("a")), StoryVisibility.EXCEPT, "me", emptySet())
        assertThat(moved).isEqualTo(Choice(StoryVisibility.EXCEPT, listOf("a")))
    }

    @Test
    fun `un choix nomme vide ne part pas`() {
        assertThat(StoryRepublishAudience.isPublishable(Choice(StoryVisibility.ONLY))).isFalse()
        assertThat(StoryRepublishAudience.isPublishable(Choice(StoryVisibility.EXCEPT, listOf("a")))).isTrue()
        assertThat(StoryRepublishAudience.isPublishable(Choice(StoryVisibility.PRIVATE))).isTrue()
    }

    @Test
    fun `le serveur n'est pas ecrit quand l'audience ne change pas, l'ordre de la liste n'y change rien`() {
        val before = Choice(StoryVisibility.ONLY, listOf("a", "b"))
        assertThat(StoryRepublishAudience.change(before, Choice(StoryVisibility.ONLY, listOf("b", "a")))).isEqualTo(Change.None)
    }

    @Test
    fun `un changement part avec sa liste, vide quand le mode n'en a pas`() {
        val before = Choice(StoryVisibility.ONLY, listOf("a"))
        assertThat(StoryRepublishAudience.change(before, Choice(StoryVisibility.FRIENDS)))
            .isEqualTo(Change.Apply(StoryVisibility.FRIENDS, emptyList()))
    }
}
