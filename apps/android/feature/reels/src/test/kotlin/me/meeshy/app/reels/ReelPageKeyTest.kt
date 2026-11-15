package me.meeshy.app.reels

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.ReelPlaybackElection
import org.junit.Test

class ReelPageKeyTest {

    @Test
    fun `deux cles de memes primitives sont egales`() {
        assertThat(ReelPageKey("a", isElected = true, isSettled = false, chromeHidden = false))
            .isEqualTo(ReelPageKey("a", isElected = true, isSettled = false, chromeHidden = false))
    }

    @Test
    fun `chaque primitive distingue la cle`() {
        val base = ReelPageKey("a", isElected = true, isSettled = true, chromeHidden = false)
        assertThat(base.copy(reelId = "b")).isNotEqualTo(base)
        assertThat(base.copy(isElected = false)).isNotEqualTo(base)
        assertThat(base.copy(isSettled = false)).isNotEqualTo(base)
        assertThat(base.copy(chromeHidden = true)).isNotEqualTo(base)
    }

    @Test
    fun `une election ne change la cle que des deux pages touchees`() {
        val ids = listOf("a", "b", "c", "d")
        val before = ReelPlaybackElection(activeId = "b")
        val after = before.majority("c").scrolling(true)

        val changed = ids.filter { ReelPageKey.of(it, before, false) != ReelPageKey.of(it, after, false) }

        assertThat(changed).containsExactly("b", "c")
    }

    @Test
    fun `elue sans etre posee pendant le geste puis posee a l'arret`() {
        var election = ReelPlaybackElection(activeId = "a")
        election = ReelElectionReducer.reduce(election, majorityId = "b", isScrolling = true, settledId = "a")
        assertThat(ReelPageKey.of("b", election, false).isElected).isTrue()
        assertThat(ReelPageKey.of("b", election, false).isSettled).isFalse()
        assertThat(ReelPageKey.of("a", election, false).isElected).isFalse()

        election = ReelElectionReducer.reduce(election, majorityId = "b", isScrolling = false, settledId = "b")
        assertThat(ReelPageKey.of("b", election, false).isSettled).isTrue()
    }

    @Test
    fun `revenir sous la moitie sans relacher rend la main au reel d'avant`() {
        var election = ReelPlaybackElection(activeId = "a")
        election = ReelElectionReducer.reduce(election, "b", isScrolling = true, settledId = "a")
        election = ReelElectionReducer.reduce(election, "a", isScrolling = true, settledId = "a")
        assertThat(election.activeId).isEqualTo("a")
        assertThat(election.restingId).isEqualTo("a")
    }
}
