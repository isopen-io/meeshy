package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class StoryDraftIndexTest {

    private fun summary(id: String, at: Long) =
        StoryDraftSummary(id, at, 1, null, null, null, null)

    private fun snapshot(text: String = "salut", updatedAt: String? = null) = StoryComposerDraftSnapshot(
        slides = listOf(StoryDraftSlideSnapshot(id = "s1", text = text)),
        selectedId = "s1",
        updatedAt = updatedAt,
    )

    @Test
    fun `le plus recent vient en premier et l'identifiant departage les dates egales`() {
        val sorted = StoryDraftIndex.sorted(listOf(summary("b", 5), summary("a", 5), summary("c", 9), summary("d", 1)))
        assertThat(sorted.map { it.id }).containsExactly("c", "a", "b", "d").inOrder()
    }

    @Test
    fun `un identifiant n'apparait qu'une fois`() {
        val sorted = StoryDraftIndex.sorted(listOf(summary("a", 9), summary("a", 1)))
        assertThat(sorted).hasSize(1)
    }

    @Test
    fun `le brouillon unique d'avant se range comme un brouillon de la bibliotheque`() {
        val slot = StoryDraftIndex.slotSummary(snapshot("ancien", "2026-10-01T10:00:00Z"), nowMillis = 99L)!!
        val merged = StoryDraftIndex.merged(listOf(summary("x", 5)), slot)
        assertThat(merged.map { it.id }).containsExactly(StoryDraftIndex.SLOT_ID, "x").inOrder()
        assertThat(slot.title).isEqualTo("ancien")
    }

    @Test
    fun `un emplacement vide ou sans contenu n'ajoute rien`() {
        assertThat(StoryDraftIndex.slotSummary(null, 1L)).isNull()
        assertThat(StoryDraftIndex.slotSummary(snapshot(text = " "), 1L)).isNull()
        assertThat(StoryDraftIndex.merged(listOf(summary("x", 1)), null)).hasSize(1)
    }

    @Test
    fun `sans date lisible l'emplacement prend l'instant present`() {
        assertThat(StoryDraftIndex.slotSummary(snapshot(), nowMillis = 4242L)!!.updatedAtMillis).isEqualTo(4242L)
    }

    @Test
    fun `l'emplacement l'emporte sur un brouillon de meme identifiant`() {
        val slot = summary(StoryDraftIndex.SLOT_ID, 1)
        val merged = StoryDraftIndex.merged(listOf(summary(StoryDraftIndex.SLOT_ID, 9)), slot)
        assertThat(merged.single().updatedAtMillis).isEqualTo(1)
    }

    @Test
    fun `un identifiant neuf evite les identifiants pris et celui de l'emplacement`() {
        val candidates = ArrayDeque(listOf("a", StoryDraftIndex.SLOT_ID, "b", "c"))
        assertThat(StoryDraftIndex.freshId(setOf("a", "b")) { candidates.removeFirst() }).isEqualTo("c")
    }

    @Test
    fun `un echec devient un brouillon d'une slide qui garde texte audience et medias`() {
        val draft = StoryFailureDraft.snapshotOf("s", "bonjour", listOf("m1", " ", "m1", "m2"), "FRIENDS", listOf("u1"), null, "2026-10-30T00:00:00Z")!!
        assertThat(draft.slides.single().text).isEqualTo("bonjour")
        assertThat(draft.slides.single().mediaIds).containsExactly("m1", "m2").inOrder()
        assertThat(draft.visibility).isEqualTo("FRIENDS")
        assertThat(draft.visibilityUserIds).containsExactly("u1")
        assertThat(draft.isWorthRestoring).isTrue()
    }

    @Test
    fun `un echec sans texte ni media ne devient pas un brouillon`() {
        assertThat(StoryFailureDraft.snapshotOf("s", "  ", emptyList(), "PUBLIC", emptyList(), null, "x")).isNull()
    }

    @Test
    fun `un echec sans audience lisible retombe sur public`() {
        assertThat(StoryFailureDraft.snapshotOf("s", "a", emptyList(), "", emptyList(), null, "x")!!.visibility).isEqualTo("PUBLIC")
    }
}
