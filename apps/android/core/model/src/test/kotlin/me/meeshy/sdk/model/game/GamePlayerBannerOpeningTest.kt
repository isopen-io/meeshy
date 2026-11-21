package me.meeshy.sdk.model.game

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/** Miroir des témoins d'ouverture de `GamePlayerBannerMeaningTests` iOS (#9536, #19921). */
class GamePlayerBannerOpeningTest {

    private val launch = 1_700_000_000_000L

    private fun at(seconds: Double): Long = launch + (seconds * 1000).toLong()

    @Test
    fun `le bandeau s'ouvre avec l'application et reste trente secondes`() {
        val opening = GamePlayerBannerOpening(openedAtMs = launch)
        assertThat(opening.isOpen(launch)).isTrue()
        assertThat(opening.remainingMs(launch)).isEqualTo(30_000L)
        assertThat(opening.remainingMs(at(12.0))).isEqualTo(18_000L)
        assertThat(opening.isOpen(at(29.9))).isTrue()
        assertThat(opening.isOpen(at(30.0))).isFalse()
        assertThat(opening.remainingMs(at(500.0))).isEqualTo(0L)
    }

    @Test
    fun `une horloge qui recule ne prolonge jamais le bandeau`() {
        assertThat(GamePlayerBannerOpening(openedAtMs = launch).remainingMs(at(-60.0))).isEqualTo(30_000L)
    }

    @Test
    fun `un retour apres quelques secondes ne le rouvre pas`() {
        val away = GamePlayerBannerOpening(openedAtMs = launch).wentAway(at(40.0))
        assertThat(away.reopensOnReturn(at(100.0))).isFalse()
        val back = away.cameBack(at(100.0))
        assertThat(back.isOpen(at(100.0))).isFalse()
        assertThat(back.awaySinceMs).isNull()
    }

    @Test
    fun `une vraie absence le rouvre pour trente secondes`() {
        val away = GamePlayerBannerOpening(openedAtMs = launch).wentAway(at(40.0))
        val backAt = at(40.0) + GamePlayerBannerOpening.REAL_ABSENCE_MS
        assertThat(away.reopensOnReturn(backAt)).isTrue()
        val back = away.cameBack(backAt)
        assertThat(back.isOpen(backAt)).isTrue()
        assertThat(back.remainingMs(backAt)).isEqualTo(30_000L)
    }

    @Test
    fun `un second depart ne repousse pas l'instant du depart`() {
        val away = GamePlayerBannerOpening(openedAtMs = launch).wentAway(at(40.0)).wentAway(at(300.0))
        assertThat(away.reopensOnReturn(at(40.0) + GamePlayerBannerOpening.REAL_ABSENCE_MS)).isTrue()
    }

    @Test
    fun `un retour sans depart, le demarrage a froid, ne rouvre rien`() {
        val opening = GamePlayerBannerOpening(openedAtMs = launch)
        assertThat(opening.reopensOnReturn(at(1_000.0))).isFalse()
        assertThat(opening.cameBack(at(1_000.0)).openedAtMs).isEqualTo(launch)
    }

    @Test
    fun `les durees sont celles d'iOS et du web`() {
        assertThat(GamePlayerBannerOpening.LINGERS_MS).isEqualTo(30_000L)
        assertThat(GamePlayerBannerOpening.REAL_ABSENCE_MS).isEqualTo(300_000L)
        assertThat(GamePlayerBannerOpening.EXIT_MS).isAtLeast(800L)
        assertThat(GamePlayerBannerOpening.EXIT_MS).isAtMost(1_200L)
    }
}
