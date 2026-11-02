package me.meeshy.sdk.model.media

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class PlaybackStretchTrackerTest {

    private fun tracker() = PlaybackStretchTracker()

    @Test fun `pause, saut de curseur puis fin produisent trois plages motivees`() {
        val (stretches, _) = tracker()
            .begin(0)
            .pause(2_000)
            .begin(2_000)
            .seek(from = 4_000, to = 8_000)
            .completed(10_000)
            .drain()

        assertThat(stretches).containsExactly(
            PlaybackStretch(0, 2_000, StretchEnd.PAUSE),
            PlaybackStretch(2_000, 4_000, StretchEnd.SEEK),
            PlaybackStretch(8_000, 10_000, StretchEnd.COMPLETED),
        ).inOrder()
    }

    @Test fun `deplacer le curseur a l'arret n'ouvre aucune plage`() {
        val (stretches, after) = tracker().seek(from = 0, to = 5_000).drain()

        assertThat(stretches).isEmpty()
        assertThat(after.hasOpenStretch).isFalse()
    }

    @Test fun `une ouverture sur une plage ouverte conserve l'orpheline`() {
        val (stretches, after) = tracker().begin(1_000).begin(6_000).drain()

        assertThat(stretches).containsExactly(PlaybackStretch(1_000, 6_000, StretchEnd.SUPERSEDED))
        assertThat(after.hasOpenStretch).isTrue()
    }

    @Test fun `quitter l'ecran cloture avec la derniere position observee`() {
        val (stretches, _) = tracker().begin(0).observe(3_500).dismissed().drain()

        assertThat(stretches).containsExactly(PlaybackStretch(0, 3_500, StretchEnd.DISMISSED))
    }

    @Test fun `couper le son cloture la plage`() {
        val (stretches, _) = tracker().begin(500).muted(1_500).drain()

        assertThat(stretches).containsExactly(PlaybackStretch(500, 1_500, StretchEnd.MUTED))
    }

    @Test fun `une duree nulle ou negative ne fabrique aucune plage`() {
        val (stretches, _) = tracker().begin(2_000).pause(2_000).begin(5_000).pause(4_000).drain()

        assertThat(stretches).isEmpty()
    }

    @Test fun `le drain vide la file et garde la plage ouverte`() {
        val (_, after) = tracker().begin(0).pause(1_000).begin(1_000).drain()

        assertThat(after.hasOpenStretch).isTrue()
        assertThat(after.drain().first).isEmpty()
    }

    @Test fun `fermer sans plage ouverte ne fait rien`() {
        assertThat(tracker().pause(1_000).drain().first).isEmpty()
    }

    @Test fun `une plage remplacee est motivee superseded`() {
        val (stretches, after) = tracker().begin(0).superseded(900).drain()

        assertThat(stretches).containsExactly(PlaybackStretch(0, 900, StretchEnd.SUPERSEDED))
        assertThat(after.hasOpenStretch).isFalse()
    }
}
