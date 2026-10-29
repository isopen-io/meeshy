package me.meeshy.sdk.model.presence

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.UserPresence
import org.junit.Test
import java.time.Instant

/**
 * L'ordre des parcours de pages de conversations (#13798) : chaque page parle depuis ses marques — ce
 * qu'elle sert depuis sa DEMANDE, ce qu'elle masque depuis son ARRIVÉE —, et seul le serveur, par le socket
 * ou par une page plus récente, défait un masque.
 */
class PresenceSweepTest {

    private val now = 1_700_000_000_000L
    private fun iso(offsetMs: Long) = Instant.ofEpochMilli(now + offsetMs).toString()
    private val online = UserPresence(true, iso(0))

    private fun sweep(
        map: PresenceMap = emptyMap(),
        marks: PresenceMarks = PresenceMarks(),
        nowMark: Long = 100,
        restored: Set<String> = emptySet(),
        vararg pages: ServedPresencePage,
    ) = PresenceSweep.seed(map, restored, pages.toList(), "me", marks, nowMark)

    @Test
    fun `a page asked for before a mask never seeds back what the mask withdrew, even when it lands after it`() {
        val swept = sweep(
            marks = PresenceMarks(masked = mapOf("ex" to 5)),
            pages = arrayOf(ServedPresencePage(served = mapOf("ex" to online), requested = 3, receipt = 7)),
        )

        assertThat(swept.entries).doesNotContainKey("ex")
        assertThat(swept.admitted).doesNotContain("ex")
        assertThat(swept.marks.masked).containsEntry("ex", 5L)
    }

    @Test
    fun `a page asked for after the mask puts the peer back and lifts the mask`() {
        val swept = sweep(
            marks = PresenceMarks(masked = mapOf("friend" to 5)),
            pages = arrayOf(ServedPresencePage(served = mapOf("friend" to online), requested = 6, receipt = 7)),
        )

        assertThat(swept.entries).containsEntry("friend", online)
        assertThat(swept.admitted).containsExactly("friend")
        assertThat(swept.marks.masked).isEmpty()
        assertThat(swept.marks.seeded).containsEntry("friend", 6L)
    }

    @Test
    fun `a mask spares only what the server said on the socket after the page that masks it arrived`() {
        val swept = sweep(
            map = mapOf("before" to online, "after" to online),
            marks = PresenceMarks(heard = mapOf("before" to 4, "after" to 8)),
            pages = arrayOf(ServedPresencePage(masked = setOf("before", "after"), receipt = 6)),
        )

        assertThat(swept.entries.keys).containsExactly("after")
    }

    @Test
    fun `an older mask never withdraws what a newer page served, an older page's entry it does`() {
        val swept = sweep(
            map = mapOf("newer" to online, "older" to online),
            marks = PresenceMarks(seeded = mapOf("newer" to 9, "older" to 5)),
            pages = arrayOf(ServedPresencePage(masked = setOf("newer", "older"), receipt = 7)),
        )

        assertThat(swept.entries.keys).containsExactly("newer")
    }

    @Test
    fun `in one sweep a status heard between two pages answers to the last page that masked the peer`() {
        val swept = sweep(
            map = mapOf("once" to online, "twice" to online),
            marks = PresenceMarks(heard = mapOf("once" to 4, "twice" to 4)),
            pages = arrayOf(
                ServedPresencePage(masked = setOf("once", "twice"), receipt = 2),
                ServedPresencePage(masked = setOf("twice"), receipt = 6),
            ),
        )

        assertThat(swept.entries.keys).containsExactly("once")
        assertThat(swept.marks.masked).containsExactly("once", 2L, "twice", 6L)
    }

    @Test
    fun `in one sweep a peer served by one page is masked by none, and answers to the earliest page that served it`() {
        val swept = sweep(
            marks = PresenceMarks(masked = mapOf("peer" to 5)),
            pages = arrayOf(
                ServedPresencePage(served = mapOf("peer" to online), requested = 4, receipt = 6),
                ServedPresencePage(served = mapOf("peer" to online), requested = 8, receipt = 9),
                ServedPresencePage(masked = setOf("peer"), requested = 10, receipt = 11),
            ),
        )

        assertThat(swept.entries).doesNotContainKey("peer")
        assertThat(swept.marks.masked).containsEntry("peer", 5L)
    }

    @Test
    fun `a page without marks speaks at the instant it is seeded`() {
        val swept = sweep(
            map = mapOf("masked" to online),
            marks = PresenceMarks(heard = mapOf("masked" to 40), masked = mapOf("served" to 50)),
            nowMark = 60,
            pages = arrayOf(ServedPresencePage(served = mapOf("served" to online), masked = setOf("masked"))),
        )

        assertThat(swept.entries.keys).containsExactly("served")
        assertThat(swept.marks.masked).containsExactly("masked", 60L)
        assertThat(swept.marks.seeded).containsExactly("served", 60L)
    }

    @Test
    fun `the mask outlives the entry it withdrew, what was heard and seeded follows the map`() {
        val swept = sweep(
            map = mapOf("gone" to online, "kept" to online),
            marks = PresenceMarks(heard = mapOf("gone" to 1, "kept" to 1), seeded = mapOf("gone" to 1)),
            pages = arrayOf(ServedPresencePage(masked = setOf("gone"), receipt = 3)),
        )

        assertThat(swept.marks.masked).containsExactly("gone", 3L)
        assertThat(swept.marks.heard).containsExactly("kept", 1L)
        assertThat(swept.marks.seeded).isEmpty()
    }

    @Test
    fun `the server speaking on the socket lifts the masks of those it spoke of`() {
        val marks = PresenceMarks(masked = mapOf("a" to 3, "b" to 3)).heard(listOf("a"), 9)

        assertThat(marks.heard).containsExactly("a", 9L)
        assertThat(marks.masked).containsExactly("b", 3L)
    }

    @Test
    fun `the pages of a sweep combine without their marks, a served account is masked by none`() {
        val combined = listOf(
            ServedPresencePage(served = mapOf("a" to UserPresence(false, iso(-5_000))), masked = setOf("m"), receipt = 1),
            ServedPresencePage(served = mapOf("a" to UserPresence(true, iso(-1_000))), masked = setOf("a", "n"), receipt = 2),
        ).combined()

        assertThat(combined).isEqualTo(ServedPresencePage(mapOf("a" to UserPresence(true, iso(-1_000))), setOf("m", "n")))
    }
}
