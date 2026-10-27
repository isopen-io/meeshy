package me.meeshy.sdk.model.composer

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.StoryVisibility
import org.junit.Test

class ComposerPublicationAudienceTest {

    @Test
    fun `une publication privee ne sert personne, meme sans identifiant`() {
        assertThat(ComposerAudienceReach.resolve(null, StoryVisibility.PRIVATE, emptyList()))
            .isEqualTo(ComposerAudienceReach.EXCLUDED)
        assertThat(ComposerAudienceReach.resolve("u1", StoryVisibility.PRIVATE, listOf("u1")))
            .isEqualTo(ComposerAudienceReach.EXCLUDED)
    }

    @Test
    fun `ONLY sert la liste et exclut les autres avec certitude`() {
        assertThat(ComposerAudienceReach.resolve("u1", StoryVisibility.ONLY, listOf("u1")))
            .isEqualTo(ComposerAudienceReach.REACHES)
        assertThat(ComposerAudienceReach.resolve("u2", StoryVisibility.ONLY, listOf("u1")))
            .isEqualTo(ComposerAudienceReach.EXCLUDED)
    }

    @Test
    fun `EXCEPT exclut la liste et sert les autres`() {
        assertThat(ComposerAudienceReach.resolve("u1", StoryVisibility.EXCEPT, listOf("u1")))
            .isEqualTo(ComposerAudienceReach.EXCLUDED)
        assertThat(ComposerAudienceReach.resolve("u2", StoryVisibility.EXCEPT, listOf("u1")))
            .isEqualTo(ComposerAudienceReach.REACHES)
    }

    @Test
    fun `une mention sans identifiant sous ONLY ou EXCEPT reste inconnue`() {
        assertThat(ComposerAudienceReach.resolve(null, StoryVisibility.ONLY, listOf("u1")))
            .isEqualTo(ComposerAudienceReach.UNKNOWN)
        assertThat(ComposerAudienceReach.resolve(null, StoryVisibility.EXCEPT, listOf("u1")))
            .isEqualTo(ComposerAudienceReach.UNKNOWN)
    }

    @Test
    fun `public amis et communaute se taisent, le client ignore le graphe`() {
        listOf(StoryVisibility.PUBLIC, StoryVisibility.FRIENDS, StoryVisibility.COMMUNITY).forEach {
            assertThat(ComposerAudienceReach.resolve("u1", it, emptyList()))
                .isEqualTo(ComposerAudienceReach.UNKNOWN)
        }
    }

    @Test
    fun `seule une exclusion certaine avertit`() {
        assertThat(ComposerAudienceReach.EXCLUDED.warns).isTrue()
        assertThat(ComposerAudienceReach.REACHES.warns).isFalse()
        assertThat(ComposerAudienceReach.UNKNOWN.warns).isFalse()
    }

    @Test
    fun `le sous-titre ne fabrique jamais un effectif la ou le client n'en a pas`() {
        assertThat(ComposerAudienceSubtitle.of(StoryVisibility.PUBLIC, 0))
            .isEqualTo(ComposerAudienceSubtitle.Kind.PUBLIC)
        assertThat(ComposerAudienceSubtitle.of(StoryVisibility.ONLY, 0))
            .isEqualTo(ComposerAudienceSubtitle.Kind.PICK)
        assertThat(ComposerAudienceSubtitle.of(StoryVisibility.EXCEPT, 3))
            .isEqualTo(ComposerAudienceSubtitle.Kind.COUNT)
        assertThat(ComposerAudienceSubtitle.of(StoryVisibility.PRIVATE, 3))
            .isEqualTo(ComposerAudienceSubtitle.Kind.PRIVATE)
    }

    @Test
    fun `la liste n'est envoyee que sous ONLY et EXCEPT, jamais une liste orpheline`() {
        assertThat(ComposerAudienceSelection.wireUserIds(StoryVisibility.PUBLIC, listOf("u1"))).isNull()
        assertThat(ComposerAudienceSelection.wireUserIds(StoryVisibility.FRIENDS, listOf("u1"))).isNull()
        assertThat(ComposerAudienceSelection.wireUserIds(StoryVisibility.ONLY, listOf("u1", "u1", "u2")))
            .containsExactly("u1", "u2").inOrder()
    }

    @Test
    fun `ONLY et EXCEPT sans personne ne sont pas publiables`() {
        assertThat(ComposerAudienceSelection.isPublishable(StoryVisibility.ONLY, emptyList())).isFalse()
        assertThat(ComposerAudienceSelection.isPublishable(StoryVisibility.EXCEPT, emptyList())).isFalse()
        assertThat(ComposerAudienceSelection.isPublishable(StoryVisibility.ONLY, listOf("u1"))).isTrue()
        assertThat(ComposerAudienceSelection.isPublishable(StoryVisibility.PUBLIC, emptyList())).isTrue()
    }

    @Test
    fun `la selection ne garde que des amis autorises, ni bloques ni soi, plafonnee a 500`() {
        val kept = ComposerAudienceSelection.sanitize(
            selected = listOf("a", "b", "blocked", "me", "stranger", "a"),
            eligible = setOf("a", "b", "blocked", "me"),
            blocked = setOf("blocked"),
            selfId = "me",
        )
        assertThat(kept).containsExactly("a", "b").inOrder()

        val many = (1..600).map { "u$it" }
        val capped = ComposerAudienceSelection.sanitize(many, many.toSet(), emptySet(), "me")
        assertThat(capped).hasSize(ComposerAudienceSelection.MAX_USERS)
    }

    @Test
    fun `les modes proposes sont les six du serveur dans l'ordre de la feuille`() {
        assertThat(ComposerAudienceSelection.offered.map { it.wire })
            .containsExactly("PUBLIC", "FRIENDS", "COMMUNITY", "ONLY", "EXCEPT", "PRIVATE").inOrder()
    }

    @Test
    fun `fromWire decroit vers PUBLIC pour une valeur inconnue`() {
        assertThat(StoryVisibility.fromWire("ONLY")).isEqualTo(StoryVisibility.ONLY)
        assertThat(StoryVisibility.fromWire("legacy")).isEqualTo(StoryVisibility.PUBLIC)
    }
}
