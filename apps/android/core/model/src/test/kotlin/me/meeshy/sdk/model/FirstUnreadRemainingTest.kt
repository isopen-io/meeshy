package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * #19662 — le miroir Kotlin de `FirstUnreadBoundary.remainingUnread` (Swift, #7350 I-2) : ce qui RESTE
 * non lu après une lecture PARTIELLE, borné par la MÊME frontière que `resolve`. Le serveur n'avance son
 * curseur que jusqu'au bout du PRÉFIXE CONTIGU de messages vus depuis la frontière
 * (`MessageReadStatusService.ts`, mode exact) : la loi le rejoue, pour que la ligne de liste montre 94 —
 * et non 0 — dès la fermeture d'un fil où 5 des 99 non-lus ont été affichés.
 *
 * Les dix cas sont ceux de `FirstUnreadRemainingTests.swift`, repris un pour un : un miroir se prouve sur
 * les mêmes données que son modèle, sans quoi « miroir » n'est qu'une intention.
 */
class FirstUnreadRemainingTest {

    private val viewer = "viewer-1"
    private val other = "other-2"
    private val t0 = 1_700_000_000_000L

    private fun unreadWindow(count: Int): List<FirstUnreadCandidate> =
        (0 until count).map { FirstUnreadCandidate("m$it", other, t0 + it * 1_000L) }

    private fun remaining(
        window: List<FirstUnreadCandidate>,
        seen: Set<String>,
        unreadAtOpen: Int,
        windowIsAtTip: Boolean,
        caughtUp: String? = null,
    ): Int = FirstUnreadBoundary.remainingUnread(
        messages = window,
        lastReadMessageId = null,
        lastReadAtMillis = null,
        lastReadMessageCreatedAtMillis = null,
        joinedAtMillis = null,
        viewerId = viewer,
        seenIds = seen,
        unreadAtOpen = unreadAtOpen,
        windowIsAtTip = windowIsAtTip,
        caughtUpMessageId = caughtUp,
    )

    @Test
    fun `after catching up the caught-up message is the frontier and a newer unseen one counts 1`() {
        val window = unreadWindow(100)
        val seen = setOf("m0", "m1", "m2", "m3", "m4", "m50", "m98")

        assertThat(remaining(window, seen, unreadAtOpen = 99, windowIsAtTip = true, caughtUp = "m98")).isEqualTo(1)
    }

    @Test
    fun `after catching up with nothing newer nothing remains`() {
        val window = unreadWindow(99)

        assertThat(remaining(window, setOf("m0", "m98"), 99, windowIsAtTip = true, caughtUp = "m98")).isEqualTo(0)
    }

    @Test
    fun `a caught-up message outside the window keeps the opening frontier`() {
        val window = unreadWindow(99)
        val seen = window.take(5).map { it.id }.toSet()

        assertThat(remaining(window, seen, 99, windowIsAtTip = true, caughtUp = "ailleurs")).isEqualTo(94)
    }

    @Test
    fun `ninety-nine unread five displayed leaves ninety-four when the window holds them all`() {
        val window = unreadWindow(99)
        val seen = window.take(5).map { it.id }.toSet()

        assertThat(remaining(window, seen, 99, windowIsAtTip = true)).isEqualTo(94)
    }

    @Test
    fun `ninety-nine unread five displayed leaves ninety-four on a window opened around the separator`() {
        val window = unreadWindow(30)
        val seen = window.take(5).map { it.id }.toSet()

        assertThat(remaining(window, seen, 99, windowIsAtTip = false)).isEqualTo(94)
    }

    @Test
    fun `only the contiguous prefix from the frontier counts a gap stops the cursor`() {
        val window = unreadWindow(10)
        val seen = setOf("m0", "m1", "m3", "m4")

        assertThat(remaining(window, seen, 10, windowIsAtTip = true)).isEqualTo(8)
    }

    @Test
    fun `nothing displayed returns the opening count untouched`() {
        assertThat(remaining(unreadWindow(12), emptySet(), 12, windowIsAtTip = true)).isEqualTo(12)
    }

    @Test
    fun `at the tip unread messages OLDER than the window hold the server cursor back`() {
        val window = unreadWindow(30)
        val seen = window.map { it.id }.toSet()

        assertThat(remaining(window, seen, 99, windowIsAtTip = true)).isEqualTo(99)
    }

    @Test
    fun `a message of the viewer is neither counted nor required in the prefix`() {
        val window = listOf(
            FirstUnreadCandidate("a", other, t0),
            FirstUnreadCandidate("mine", viewer, t0 + 1_000L),
            FirstUnreadCandidate("b", other, t0 + 2_000L),
            FirstUnreadCandidate("c", other, t0 + 3_000L),
        )

        assertThat(remaining(window, setOf("a", "b"), 3, windowIsAtTip = true)).isEqualTo(1)
    }

    @Test
    fun `never negative even when the server announced less than the window shows`() {
        val window = unreadWindow(8)

        assertThat(remaining(window, window.map { it.id }.toSet(), 3, windowIsAtTip = false)).isEqualTo(0)
    }
}
