package me.meeshy.sdk.model.story

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.story.StoryOptionsMenuEntry.*
import org.junit.Test

class StoryOptionsMenuPlanTest {

    private fun plan(
        hasStory: Boolean = true,
        isOwn: Boolean = false,
        transcript: Boolean = false,
        compose: Boolean = true,
        remove: Boolean = false,
    ) = StoryOptionsMenuPlan.resolve(hasStory, isOwn, transcript, compose, remove)

    @Test
    fun `la story d un autre se signale`() {
        assertThat(plan(transcript = true).sections)
            .containsExactly(listOf(Fullscreen, Transcript), listOf(Share, Compose, ExportVideo, Imager), listOf(Report), listOf(Close))
            .inOrder()
    }

    @Test
    fun `sa propre story se supprime`() {
        assertThat(plan(isOwn = true).sections[2]).containsExactly(Delete)
    }

    @Test
    fun `la moderation retire ou rend privee la story d un autre avec un motif`() {
        assertThat(plan(remove = true).sections[2]).containsExactly(Report, MakePrivate, Remove).inOrder()
    }

    @Test
    fun `la moderation ne retire jamais sa propre story`() {
        assertThat(plan(isOwn = true, remove = true).sections[2]).containsExactly(Delete)
    }

    @Test
    fun `Fermer est la derniere entree pour tout lecteur`() {
        for (bits in 0 until 16) {
            val p = plan(isOwn = bits and 1 != 0, transcript = bits and 2 != 0, compose = bits and 4 != 0, remove = bits and 8 != 0)
            assertThat(p.entries.last()).isEqualTo(Close)
            assertThat(p.sections.last()).containsExactly(Close)
            assertThat(p.entries.toSet()).hasSize(p.entries.size)
            assertThat(p.sections.none { it.isEmpty() }).isTrue()
        }
    }

    @Test
    fun `sans composer la story n offre pas Composer`() {
        assertThat(plan(compose = false).entries).doesNotContain(Compose)
    }

    @Test
    fun `sans story le menu ne garde que la lecture et Fermer`() {
        assertThat(plan(hasStory = false).sections).containsExactly(listOf(Fullscreen), listOf(Close)).inOrder()
    }

    @Test
    fun `une entree non branchee est masquee et sa section vide disparait`() {
        val p = plan(isOwn = true).onlyWired(setOf(Share, Delete))
        assertThat(p.sections).containsExactly(listOf(Share), listOf(Delete), listOf(Close)).inOrder()
    }

    @Test
    fun `rien de branche ne laisse Fermer seul`() {
        assertThat(plan().onlyWired(emptySet()).sections).containsExactly(listOf(Close))
    }
}
