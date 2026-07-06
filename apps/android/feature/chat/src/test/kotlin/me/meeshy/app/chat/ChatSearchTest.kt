package me.meeshy.app.chat

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class ChatSearchTest {

    private fun msg(id: String, vararg texts: String) = SearchableMessage(id, texts.toList())

    private val corpus = listOf(
        msg("m1", "Hello world"),
        msg("m2", "goodbye"),
        msg("m3", "Hello again", "Bonjour encore"),
        msg("m4", "unrelated"),
    )

    // ---- matchIds ----

    @Test
    fun `matchIds returns ids of every message containing the query in order`() {
        assertThat(ChatSearch.matchIds(corpus, "hello")).containsExactly("m1", "m3").inOrder()
    }

    @Test
    fun `matchIds is case insensitive`() {
        assertThat(ChatSearch.matchIds(corpus, "HELLO")).containsExactly("m1", "m3").inOrder()
    }

    @Test
    fun `matchIds trims surrounding whitespace before matching`() {
        assertThat(ChatSearch.matchIds(corpus, "  hello  ")).containsExactly("m1", "m3").inOrder()
    }

    @Test
    fun `matchIds matches against any of a message's texts (translation-aware)`() {
        assertThat(ChatSearch.matchIds(corpus, "bonjour")).containsExactly("m3")
    }

    @Test
    fun `matchIds includes a message once even when several of its texts match`() {
        val both = listOf(msg("m1", "hello there", "hello world"))
        assertThat(ChatSearch.matchIds(both, "hello")).containsExactly("m1")
    }

    @Test
    fun `matchIds returns empty for a blank query`() {
        assertThat(ChatSearch.matchIds(corpus, "")).isEmpty()
        assertThat(ChatSearch.matchIds(corpus, "   ")).isEmpty()
    }

    @Test
    fun `matchIds returns empty when nothing matches`() {
        assertThat(ChatSearch.matchIds(corpus, "zzz")).isEmpty()
    }

    @Test
    fun `matchIds ignores messages with no texts`() {
        val withEmpty = listOf(msg("e1"), msg("m1", "hello"))
        assertThat(ChatSearch.matchIds(withEmpty, "hello")).containsExactly("m1")
    }

    // ---- derived accessors ----

    @Test
    fun `an inactive default state exposes no matches and no highlight`() {
        val s = ChatSearchState()
        assertThat(s.isActive).isFalse()
        assertThat(s.hasMatches).isFalse()
        assertThat(s.matchCount).isEqualTo(0)
        assertThat(s.activeMessageId).isNull()
        assertThat(s.currentPosition).isEqualTo(0)
        assertThat(s.highlightTerm).isNull()
    }

    @Test
    fun `currentPosition is one-based over the match list`() {
        val s = ChatSearchState(isActive = true, query = "hello", matchIds = listOf("m1", "m3"), activeIndex = 1)
        assertThat(s.currentPosition).isEqualTo(2)
        assertThat(s.matchCount).isEqualTo(2)
        assertThat(s.activeMessageId).isEqualTo("m3")
    }

    @Test
    fun `highlightTerm is the trimmed query only while active and non-blank`() {
        assertThat(ChatSearchState(isActive = true, query = "  hi ").highlightTerm).isEqualTo("hi")
        assertThat(ChatSearchState(isActive = true, query = "   ").highlightTerm).isNull()
        assertThat(ChatSearchState(isActive = false, query = "hi").highlightTerm).isNull()
    }

    // ---- transitions ----

    @Test
    fun `activated turns an inactive state on and clears any stale query`() {
        val stale = ChatSearchState(isActive = false, query = "old", matchIds = listOf("x"), activeIndex = 1)
        val s = stale.activated()
        assertThat(s.isActive).isTrue()
        assertThat(s.query).isEmpty()
        assertThat(s.matchIds).isEmpty()
        assertThat(s.activeIndex).isEqualTo(0)
    }

    @Test
    fun `deactivated resets everything to the inert default`() {
        val active = ChatSearchState(isActive = true, query = "hi", matchIds = listOf("m1"), activeIndex = 0)
        assertThat(active.deactivated()).isEqualTo(ChatSearchState())
    }

    @Test
    fun `withQuery recomputes matches and resets the active index to the first hit`() {
        val s = ChatSearchState(isActive = true, matchIds = listOf("old"), activeIndex = 3)
            .withQuery("hello", corpus)
        assertThat(s.query).isEqualTo("hello")
        assertThat(s.matchIds).containsExactly("m1", "m3").inOrder()
        assertThat(s.activeIndex).isEqualTo(0)
        assertThat(s.activeMessageId).isEqualTo("m1")
    }

    @Test
    fun `withQuery on a no-match query empties the matches`() {
        val s = ChatSearchState(isActive = true, matchIds = listOf("m1"), activeIndex = 0)
            .withQuery("zzz", corpus)
        assertThat(s.matchIds).isEmpty()
        assertThat(s.activeMessageId).isNull()
    }

    @Test
    fun `movedToNext advances the active index`() {
        val s = ChatSearchState(isActive = true, query = "hello", matchIds = listOf("m1", "m3"), activeIndex = 0)
        assertThat(s.movedToNext().activeIndex).isEqualTo(1)
        assertThat(s.movedToNext().activeMessageId).isEqualTo("m3")
    }

    @Test
    fun `movedToNext wraps around from the last match to the first`() {
        val s = ChatSearchState(isActive = true, query = "hello", matchIds = listOf("m1", "m3"), activeIndex = 1)
        assertThat(s.movedToNext().activeIndex).isEqualTo(0)
    }

    @Test
    fun `movedToPrev steps back and wraps from the first match to the last`() {
        val s = ChatSearchState(isActive = true, query = "hello", matchIds = listOf("m1", "m3"), activeIndex = 0)
        assertThat(s.movedToPrev().activeIndex).isEqualTo(1)
        assertThat(s.movedToPrev().movedToPrev().activeIndex).isEqualTo(0)
    }

    @Test
    fun `next and prev on a single match keep the index at zero`() {
        val s = ChatSearchState(isActive = true, query = "goodbye", matchIds = listOf("m2"), activeIndex = 0)
        assertThat(s.movedToNext().activeIndex).isEqualTo(0)
        assertThat(s.movedToPrev().activeIndex).isEqualTo(0)
    }

    @Test
    fun `next and prev on an empty match set are inert`() {
        val s = ChatSearchState(isActive = true, query = "zzz", matchIds = emptyList(), activeIndex = 0)
        assertThat(s.movedToNext()).isEqualTo(s)
        assertThat(s.movedToPrev()).isEqualTo(s)
    }

    // ---- reconciled (message stream churn while searching) ----

    @Test
    fun `reconciled is a no-op when search is inactive`() {
        val s = ChatSearchState(isActive = false, query = "hello", matchIds = listOf("stale"))
        assertThat(s.reconciled(corpus)).isSameInstanceAs(s)
    }

    @Test
    fun `reconciled keeps the active match on the same message when it survives a new stream`() {
        val s = ChatSearchState(isActive = true, query = "hello", matchIds = listOf("m1", "m3"), activeIndex = 1)
        // A newly-arrived message m0 also matches and sorts first.
        val grown = listOf(msg("m0", "hello newest")) + corpus
        val r = s.reconciled(grown)
        assertThat(r.matchIds).containsExactly("m0", "m1", "m3").inOrder()
        assertThat(r.activeMessageId).isEqualTo("m3")
        assertThat(r.activeIndex).isEqualTo(2)
    }

    @Test
    fun `reconciled falls back to the first match when the active message disappears`() {
        val s = ChatSearchState(isActive = true, query = "hello", matchIds = listOf("m1", "m3"), activeIndex = 1)
        val shrunk = listOf(msg("m1", "Hello world")) // m3 gone
        val r = s.reconciled(shrunk)
        assertThat(r.matchIds).containsExactly("m1")
        assertThat(r.activeIndex).isEqualTo(0)
    }

    @Test
    fun `reconciled empties matches when nothing matches anymore`() {
        val s = ChatSearchState(isActive = true, query = "hello", matchIds = listOf("m1"), activeIndex = 0)
        val r = s.reconciled(listOf(msg("x", "nothing")))
        assertThat(r.matchIds).isEmpty()
        assertThat(r.activeIndex).isEqualTo(0)
        assertThat(r.activeMessageId).isNull()
    }
}
