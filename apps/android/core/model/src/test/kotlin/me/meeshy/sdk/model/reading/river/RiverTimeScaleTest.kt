package me.meeshy.sdk.model.reading.river

import com.google.common.truth.Truth.assertThat
import java.time.ZoneId
import java.util.Locale
import org.junit.Test

/**
 * R-3 — l'axe des ordonnées est le temps : fuseau (UTC) et locale (français) FIXÉS pour que les
 * libellés ne dépendent ni de la machine ni de l'heure du test. Miroir de `RiverTimeScaleTests.swift`.
 */
class RiverTimeScaleTest {

    private val utc = ZoneId.of("UTC")
    private val french = Locale.FRANCE

    /** 2026-08-01 00:00 UTC */
    private val t0 = 1_785_542_400_000.0
    private val hour = RiverTimeScale.HOUR_MS
    private val day = RiverTimeScale.DAY_MS

    private fun scale(vararg offsetsMs: Double) = RiverTimeScale.resolve(
        offsetsMs.mapIndexed { rank, offset -> RiverTimeScale.RankTime(rank, t0 + offset) }, utc, french,
    )

    @Test
    fun `l unite suit l amplitude reelle`() {
        assertThat(RiverTimeScale.unit(5 * hour)).isEqualTo(RiverTimeScale.Grain.HOUR)
        assertThat(RiverTimeScale.unit(3 * day)).isEqualTo(RiverTimeScale.Grain.DAY)
        assertThat(RiverTimeScale.unit(40 * day)).isEqualTo(RiverTimeScale.Grain.WEEK)
        assertThat(RiverTimeScale.unit(300 * day)).isEqualTo(RiverTimeScale.Grain.MONTH)
        assertThat(RiverTimeScale.unit(1000 * day)).isEqualTo(RiverTimeScale.Grain.YEAR)
    }

    @Test
    fun `sans deux instants distincts il n y a rien a graduer`() {
        assertThat(scale()).isNull()
        assertThat(scale(0.0)).isNull()
        assertThat(scale(0.0, 0.0, 0.0)).isNull()
    }

    @Test
    fun `fraction et rang sont lineaires dans le TEMPS, pas dans les rangs`() {
        val s = scale(0.0, day / 24, day / 12, 10 * day)!!
        assertThat(s.fraction(0)).isEqualTo(0.0)
        assertThat(s.fraction(3)).isEqualTo(1.0)
        assertThat(s.fraction(1)).isWithin(1e-9).of((day / 24) / (10 * day))
        assertThat(s.rank(0.5)).isEqualTo(3)
        assertThat(s.rank(0.0)).isEqualTo(0)
        assertThat(s.rank(1.7)).isEqualTo(3)
    }

    @Test
    fun `les graduations de jour tombent a minuit avec des libelles francais`() {
        val s = scale(0.0, day / 2, day + day / 3, 2 * day + day / 2)!!
        assertThat(s.unit).isEqualTo(RiverTimeScale.Grain.DAY)
        assertThat(s.ticks.map { it.label }).containsExactly("2 août", "3 août").inOrder()
        assertThat(s.ticks.map { it.rank }).containsExactly(2, 3).inOrder()
        assertThat(s.ticks[0].fraction).isWithin(1e-9).of(day / (2 * day + day / 2))
    }

    @Test
    fun `les graduations ne depassent jamais le plafond`() {
        val s = scale(*(0..40).map { it * day / 2 }.toDoubleArray())!!
        assertThat(s.unit).isEqualTo(RiverTimeScale.Grain.DAY)
        assertThat(s.ticks.size).isAtMost(RiverTimeScale.MAX_TICKS)
        assertThat(s.ticks).isNotEmpty()
    }

    @Test
    fun `le libelle sous la poignee suit le format de l unite`() {
        assertThat(scale(0.0, 5 * hour)!!.label(0.5)).isEqualTo("02:30")
        val months = scale(0.0, 300 * day)!!
        assertThat(months.unit).isEqualTo(RiverTimeScale.Grain.MONTH)
        assertThat(months.label(0.0)).isEqualTo("août 2026")
    }

    @Test
    fun `les semaines commencent le lundi en francais`() {
        val s = scale(0.0, 40 * day)!!
        assertThat(s.unit).isEqualTo(RiverTimeScale.Grain.WEEK)
        // 2026-08-01 est un samedi : la première frontière est le lundi 3 août.
        assertThat(s.ticks.first().label).isEqualTo("3 août")
    }
}
