package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class MessageWindowReducerTest {

    private val latest = MessageWindowMode.Latest(limit = 30)
    private val jumped = MessageWindowMode.Jumped(anchorId = "m50", fromMillis = 1_000L, throughMillis = 5_000L)

    @Test
    fun `loadOlder sur le dernier grandit la limite de ce qui vient d etre pagine`() {
        assertThat(MessageWindowReducer.loadOlder(latest, pagedCount = 30, oldestPagedMillis = 10L))
            .isEqualTo(MessageWindowMode.Latest(limit = 60))
    }

    @Test
    fun `loadOlder sans rien de pagine rend le meme mode`() {
        assertThat(MessageWindowReducer.loadOlder(latest, pagedCount = 0, oldestPagedMillis = null)).isSameInstanceAs(latest)
    }

    @Test
    fun `loadOlder sur un saut abaisse le bord ancien sans jamais le relever`() {
        val lowered = MessageWindowReducer.loadOlder(jumped, pagedCount = 20, oldestPagedMillis = 400L) as MessageWindowMode.Jumped
        assertThat(lowered.fromMillis).isEqualTo(400L)
        assertThat(lowered.throughMillis).isEqualTo(5_000L)
        val unchanged = MessageWindowReducer.loadOlder(jumped, pagedCount = 20, oldestPagedMillis = 2_000L) as MessageWindowMode.Jumped
        assertThat(unchanged.fromMillis).isEqualTo(1_000L)
    }

    @Test
    fun `loadOlder ne touche pas une recherche`() {
        val search = MessageWindowMode.Search(listOf("a", "b"))
        assertThat(MessageWindowReducer.loadOlder(search, pagedCount = 5, oldestPagedMillis = 1L)).isSameInstanceAs(search)
    }

    @Test
    fun `jump ouvre une fenetre ancree depuis n importe quel mode`() {
        val target = MessageWindowReducer.jump("m9", fromMillis = 100L, throughMillis = null)
        assertThat(target).isEqualTo(MessageWindowMode.Jumped("m9", 100L, null))
        assertThat(target.hasNewer).isFalse()
        assertThat(jumped.hasNewer).isTrue()
    }

    @Test
    fun `loadNewer deplace le bord recent puis le libere au present`() {
        val moved = MessageWindowReducer.loadNewer(jumped, newestPagedMillis = 9_000L, reachedPresent = false) as MessageWindowMode.Jumped
        assertThat(moved.throughMillis).isEqualTo(9_000L)
        val released = MessageWindowReducer.loadNewer(moved, newestPagedMillis = 9_500L, reachedPresent = true) as MessageWindowMode.Jumped
        assertThat(released.throughMillis).isNull()
        assertThat(released.hasNewer).isFalse()
    }

    @Test
    fun `loadNewer ne recule jamais le bord recent et ignore les autres modes`() {
        val same = MessageWindowReducer.loadNewer(jumped, newestPagedMillis = 3_000L, reachedPresent = false) as MessageWindowMode.Jumped
        assertThat(same.throughMillis).isEqualTo(5_000L)
        assertThat(MessageWindowReducer.loadNewer(latest, 1L, false)).isSameInstanceAs(latest)
    }

    @Test
    fun `restoreLatest revient au dernier depuis un saut ou une recherche`() {
        assertThat(MessageWindowReducer.restoreLatest(jumped)).isEqualTo(MessageWindowMode.Latest())
        assertThat(MessageWindowReducer.restoreLatest(MessageWindowMode.Search(listOf("a")))).isEqualTo(MessageWindowMode.Latest())
        assertThat(MessageWindowReducer.restoreLatest(latest)).isSameInstanceAs(latest)
    }

    @Test
    fun `enterSearch deduplique les ids et une liste vide ne quitte pas le mode courant`() {
        assertThat(MessageWindowReducer.enterSearch(latest, listOf("a", "b", "a")))
            .isEqualTo(MessageWindowMode.Search(listOf("a", "b")))
        assertThat(MessageWindowReducer.enterSearch(jumped, emptyList())).isSameInstanceAs(jumped)
    }
}
