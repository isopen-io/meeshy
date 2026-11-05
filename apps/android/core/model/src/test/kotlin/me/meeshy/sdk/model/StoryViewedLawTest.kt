package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class StoryViewedLawTest {

    private fun post(id: String, authorId: String = "other", viewed: Boolean? = null, editedAt: String? = null) =
        ApiPost(id = id, author = ApiAuthor(id = authorId), isViewedByMe = viewed, contentEditedAt = editedAt)

    @Test
    fun `sans edition connue la vue locale tient`() {
        assertThat(StoryViewedLaw.shouldKeepLocalViewed(1_000L, null)).isTrue()
        assertThat(StoryViewedLaw.shouldKeepLocalViewed(null, null)).isTrue()
    }

    @Test
    fun `une edition posterieure a la vue la fait ceder`() {
        assertThat(StoryViewedLaw.shouldKeepLocalViewed(1_000L, 2_000L)).isFalse()
        assertThat(StoryViewedLaw.shouldKeepLocalViewed(2_000L, 2_000L)).isTrue()
        assertThat(StoryViewedLaw.shouldKeepLocalViewed(3_000L, 2_000L)).isTrue()
    }

    @Test
    fun `une vue sans horodatage cede devant une edition`() {
        assertThat(StoryViewedLaw.shouldKeepLocalViewed(null, 2_000L)).isFalse()
    }

    @Test
    fun `le registre grise une story que le serveur dit non vue`() {
        val out = StoryViewedLaw.reinject(listOf(post("s1")), mapOf("s1" to 5_000L), selfId = "me")
        assertThat(out.single().isViewedByMe).isTrue()
    }

    @Test
    fun `une edition de contenu posterieure a la vue rallume l'anneau`() {
        val edited = post("s1", editedAt = "2026-10-22T09:00:00Z")
        val viewedBefore = StoryViewedLaw.reinject(listOf(edited), mapOf("s1" to 1_000L), selfId = "me")
        assertThat(viewedBefore.single().isViewedByMe).isNotEqualTo(true)
        val viewedAfter = StoryViewedLaw.reinject(listOf(edited), mapOf("s1" to Long.MAX_VALUE), selfId = "me")
        assertThat(viewedAfter.single().isViewedByMe).isTrue()
    }

    @Test
    fun `l'auteur ne repasse jamais en non vu meme apres edition`() {
        val own = post("s1", authorId = "me", editedAt = "2026-10-22T09:00:00Z")
        val out = StoryViewedLaw.reinject(listOf(own), mapOf("s1" to 1_000L), selfId = "me")
        assertThat(out.single().isViewedByMe).isTrue()
    }

    @Test
    fun `une story hors registre ou deja vue passe telle quelle`() {
        val untouched = post("s2")
        val seen = post("s3", viewed = true)
        val out = StoryViewedLaw.reinject(listOf(untouched, seen), mapOf("s1" to 1L, "s3" to 1L), selfId = null)
        assertThat(out).containsExactly(untouched, seen).inOrder()
    }

    @Test
    fun `le registre garde la vue la plus recente et oublie les anciennes`() {
        val entries = StoryViewedEntries().recording("a", 100L).recording("a", 50L).recording("b", 10L)
        assertThat(entries.viewedAt).containsExactly("a", 100L, "b", 10L)
        assertThat(entries.recording("a", 200L).viewedAt["a"]).isEqualTo(200L)
        assertThat(entries.pruned(olderThanMillis = 50L).viewedAt).containsExactly("a", 100L)
        assertThat(entries.pruned(olderThanMillis = 0L)).isSameInstanceAs(entries)
    }
}
