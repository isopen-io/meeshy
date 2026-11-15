package me.meeshy.sdk.model.game

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class BadgeStageFrameTest {

    private val eps = 1e-9

    @Test
    fun `au repos un badge allume est plein et un badge eteint est vide sans mouvement`() {
        val lit = BadgeStageFrame.at(lit = true, seconds = null, reduceMotion = false)
        val off = BadgeStageFrame.at(lit = false, seconds = null, reduceMotion = false)
        assertThat(lit.fill).isEqualTo(1.0)
        assertThat(off.fill).isEqualTo(0.0)
        assertThat(lit.moving).isFalse()
        assertThat(lit.sheen).isEqualTo(0.0)
    }

    @Test
    fun `la matiere remonte du bas aux instants zero, mi-course et fin`() {
        assertThat(BadgeStageFrame.at(true, 0.0, false).fill).isEqualTo(0.0)
        assertThat(BadgeStageFrame.at(true, 0.35, false).fill).isWithin(eps).of(0.5)
        assertThat(BadgeStageFrame.at(true, 0.7, false).fill).isEqualTo(1.0)
        assertThat(BadgeStageFrame.at(true, 0.35, false).moving).isTrue()
    }

    @Test
    fun `un badge qui s'eteint voit la matiere se retirer`() {
        assertThat(BadgeStageFrame.at(false, 0.0, false).fill).isEqualTo(1.0)
        assertThat(BadgeStageFrame.at(false, 0.7, false).fill).isEqualTo(0.0)
    }

    @Test
    fun `le reflet ne parcourt la face qu'a l'allumage, apres 0,3 s`() {
        assertThat(BadgeStageFrame.at(true, 0.2, false).sheen).isEqualTo(0.0)
        assertThat(BadgeStageFrame.at(true, 0.5, false).sheen).isWithin(eps).of(0.5)
        assertThat(BadgeStageFrame.at(true, 0.7, false).sheen).isEqualTo(1.0)
        assertThat(BadgeStageFrame.at(false, 0.5, false).sheen).isEqualTo(0.0)
    }

    @Test
    fun `sous mouvement reduit un fondu empreinte matiere sans reflet`() {
        val half = BadgeStageFrame.at(true, GameTimeline.REDUCED_DURATION / 2, true)
        assertThat(half.fill).isWithin(eps).of(0.5)
        assertThat(half.moving).isFalse()
        assertThat(half.sheen).isEqualTo(0.0)
        assertThat(half.crossfade).isTrue()
        assertThat(BadgeStageFrame.at(false, GameTimeline.REDUCED_DURATION, true).fill).isEqualTo(0.0)
        assertThat(BadgeStageFrame.at(false, 0.0, true).fill).isEqualTo(1.0)
    }
}
