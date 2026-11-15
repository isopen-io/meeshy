package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class ReelPlaybackElectionTest {
    private fun scrollingFrom(id: String) = ReelPlaybackElection(activeId = id).scrolling(true)

    @Test
    fun `le reel qui passe la moitie pendant le geste est elu sans etre pose`() {
        val election = scrollingFrom("a").majority("b")
        assertThat(election.activeId).isEqualTo("b")
        assertThat(election.restingId).isEqualTo("a")
    }

    @Test
    fun `revenir sous la moitie rend la main a l ancien`() {
        val election = scrollingFrom("a").majority("b").majority("a")
        assertThat(election.activeId).isEqualTo("a")
        assertThat(election.restingId).isEqualTo("a")
    }

    @Test
    fun `l arret du defilement pose l elu`() {
        val election = scrollingFrom("a").majority("b").scrolling(false)
        assertThat(election.restingId).isEqualTo("b")
    }

    @Test
    fun `une page posee hors defilement s impose et un id nul est ignore`() {
        val election = ReelPlaybackElection(activeId = "a").settled("c")
        assertThat(election.activeId).isEqualTo("c")
        assertThat(election.restingId).isEqualTo("c")
        assertThat(election.settled(null)).isEqualTo(election)
    }

    @Test
    fun `confirmer pendant le defilement elit sans poser`() {
        val election = scrollingFrom("a").settled("b")
        assertThat(election.activeId).isEqualTo("b")
        assertThat(election.restingId).isEqualTo("a")
    }
}
