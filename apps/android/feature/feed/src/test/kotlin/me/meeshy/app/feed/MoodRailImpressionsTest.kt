package me.meeshy.app.feed

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class MoodRailImpressionsTest {

    @Test
    fun `une humeur vue sur le rail compte une fois, pas a chaque retour a l ecran`() {
        val rail = MoodRailImpressions()
        assertThat(rail.firstSight("s1")).isTrue()
        assertThat(rail.firstSight("s1")).isFalse()
    }

    @Test
    fun `une nouvelle humeur du meme ami est une autre impression`() {
        val rail = MoodRailImpressions()
        rail.firstSight("s1")
        assertThat(rail.firstSight("s2")).isTrue()
    }

    @Test
    fun `un identifiant vide ne compte pas`() {
        assertThat(MoodRailImpressions().firstSight("")).isFalse()
    }
}
