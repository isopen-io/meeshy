package me.meeshy.sdk.model.game

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class GameTimelineTest {

    private val eps = 1e-9

    @Test
    fun `window borne la fraction a zero et un`() {
        assertThat(GameTimeline.window(-1.0, 0.0, 1.0)).isEqualTo(0.0)
        assertThat(GameTimeline.window(0.5, 0.0, 1.0)).isEqualTo(0.5)
        assertThat(GameTimeline.window(9.0, 0.0, 1.0)).isEqualTo(1.0)
    }

    @Test
    fun `window degenere saute d'un coup a la borne`() {
        assertThat(GameTimeline.window(0.4, 0.5, 0.5)).isEqualTo(0.0)
        assertThat(GameTimeline.window(0.5, 0.5, 0.5)).isEqualTo(1.0)
    }

    @Test
    fun `smooth demarre et finit en douceur`() {
        assertThat(GameTimeline.smooth(0.0)).isEqualTo(0.0)
        assertThat(GameTimeline.smooth(1.0)).isEqualTo(1.0)
        assertThat(GameTimeline.smooth(0.5)).isWithin(eps).of(0.5)
        assertThat(GameTimeline.smooth(0.1)).isLessThan(0.1)
        assertThat(GameTimeline.smooth(2.0)).isEqualTo(1.0)
    }

    @Test
    fun `les durees sont celles de la planche`() {
        assertThat(GameTimeline.STRIKE_DURATION).isEqualTo(1.2)
        assertThat(GameTimeline.STRIKE_IMPACT).isEqualTo(0.45)
        assertThat(GameTimeline.RANK_DURATION).isEqualTo(1.6)
        assertThat(GameTimeline.LEVEL_GAIN_DURATION).isEqualTo(0.6)
        assertThat(GameTimeline.LEVEL_LOSS_DURATION).isEqualTo(0.8)
        assertThat(GameTimeline.BADGE_DURATION).isEqualTo(0.7)
        assertThat(GameTimeline.CHEST_DURATION).isEqualTo(1.4)
        assertThat(GameTimeline.REDUCED_DURATION).isEqualTo(0.25)
    }

    @Test
    fun `le marteau est en bas a 0,45 s et remonte ensuite`() {
        assertThat(GameTimeline.strike(0.45).hammer).isWithin(eps).of(1.0)
        assertThat(GameTimeline.strike(0.0).hammer).isEqualTo(0.0)
        assertThat(GameTimeline.strike(0.62).hammer).isWithin(eps).of(0.0)
    }

    @Test
    fun `la frappe pose le flan puis retourne la piece`() {
        assertThat(GameTimeline.strike(0.3).plate).isEqualTo(1.0)
        assertThat(GameTimeline.strike(0.45).wave).isEqualTo(0.0)
        assertThat(GameTimeline.strike(0.95).wave).isEqualTo(1.0)
        assertThat(GameTimeline.strike(1.2).flip).isEqualTo(1.0)
        assertThat(GameTimeline.strike(1.2).sheen).isEqualTo(1.0)
    }

    @Test
    fun `le tchak culmine entre l'impact et 0,8 s`() {
        assertThat(GameTimeline.strike(0.45).burst).isWithin(eps).of(0.0)
        assertThat(GameTimeline.strike(0.625).burst).isWithin(1e-6).of(1.0)
        assertThat(GameTimeline.strike(0.8).burst).isWithin(1e-6).of(0.0)
    }

    @Test
    fun `chaque trait du rang s'eclaire a son instant`() {
        val atSecondStroke = GameTimeline.rank(0.8 + 0.15)
        assertThat(atSecondStroke.strokes[1]).isWithin(1e-6).of(1.0)
        assertThat(GameTimeline.rank(0.0).strokes).containsExactly(0.0, 0.0, 0.0).inOrder()
        assertThat(GameTimeline.rank(1.6).rise).isEqualTo(1.0)
        assertThat(GameTimeline.rank(1.6).tenants).isEqualTo(1.0)
    }

    @Test
    fun `l'anneau se remplit en 0,6 s et se vide en 0,8 s`() {
        assertThat(GameTimeline.ringProgress(0.2, 0.8, 0.0, 0.6)).isEqualTo(0.2)
        assertThat(GameTimeline.ringProgress(0.2, 0.8, 0.6, 0.6)).isWithin(eps).of(0.8)
        assertThat(GameTimeline.ringProgress(0.8, 0.2, 0.8, 0.8)).isWithin(eps).of(0.2)
        assertThat(GameTimeline.ringProgress(0.8, 0.2, 0.4, 0.8)).isWithin(eps).of(0.5)
    }

    @Test
    fun `le badge monte en s'allumant et redescend en s'eteignant`() {
        assertThat(GameTimeline.badgeFill(lighting = true, atSeconds = 0.7)).isEqualTo(1.0)
        assertThat(GameTimeline.badgeFill(lighting = false, atSeconds = 0.7)).isEqualTo(0.0)
        assertThat(GameTimeline.badgeFill(lighting = false, atSeconds = 0.0)).isEqualTo(1.0)
    }

    @Test
    fun `le couvercle s'ouvre puis les recompenses montent une a une`() {
        assertThat(GameTimeline.chestLid(0.4)).isEqualTo(1.0)
        assertThat(GameTimeline.rewardStart(0)).isEqualTo(0.5)
        assertThat(GameTimeline.rewardStart(2)).isWithin(eps).of(1.1)
        assertThat(GameTimeline.reward(1, 0.8)).isEqualTo(0.0)
        assertThat(GameTimeline.reward(1, 1.1)).isEqualTo(1.0)
        assertThat(GameTimeline.reward(2, 1.4)).isEqualTo(1.0)
    }
}
