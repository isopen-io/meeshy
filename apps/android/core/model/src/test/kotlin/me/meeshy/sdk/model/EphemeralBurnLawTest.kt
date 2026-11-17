package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * #18556 — la loi de la combustion d'un éphémère, miroir de `packages/shared/utils/ephemeral-burn.ts` et de
 * `EphemeralBurnLaw.swift` (#17938). Les vecteurs de `ephemeral-burn.test.ts` sont rejoués à l'identique.
 */
class EphemeralBurnLawTest {

    @Test
    fun `brule 1,2 s, et fond en 0,25 s sous Reduire les animations`() {
        assertThat(EphemeralBurnLaw.FULL_MILLIS).isEqualTo(1200L)
        assertThat(EphemeralBurnLaw.FADE_MILLIS).isEqualTo(250L)
        assertThat(EphemeralBurnLaw.durationMillis(reduceMotion = false)).isEqualTo(1200L)
        assertThat(EphemeralBurnLaw.durationMillis(reduceMotion = true)).isEqualTo(250L)
    }

    @Test
    fun `le vent brut est absent sans capteur`() {
        assertThat(EphemeralBurnLaw.rawWind(rollTurns = null, lateralG = null)).isNull()
    }

    @Test
    fun `le vent brut est absent sous la zone morte - un telephone tenu en main n'est pas un geste`() {
        assertThat(EphemeralBurnLaw.WIND_DEAD_ZONE).isEqualTo(0.08)
        assertThat(EphemeralBurnLaw.rawWind(rollTurns = 0.01, lateralG = 0.0)).isNull()
        assertThat(EphemeralBurnLaw.rawWind(rollTurns = 0.0, lateralG = 0.03)).isNull()
    }

    @Test
    fun `le vent brut somme le roulis fois 4 et l'acceleration laterale fois 2`() {
        assertThat(EphemeralBurnLaw.rawWind(rollTurns = 0.1, lateralG = 0.0)!!).isWithin(1e-10).of(0.4)
        assertThat(EphemeralBurnLaw.rawWind(rollTurns = 0.0, lateralG = 0.1)!!).isWithin(1e-10).of(0.2)
        assertThat(EphemeralBurnLaw.rawWind(rollTurns = 0.1, lateralG = 0.1)!!).isWithin(1e-10).of(0.6)
        assertThat(EphemeralBurnLaw.rawWind(rollTurns = null, lateralG = 0.1)!!).isWithin(1e-10).of(0.2)
    }

    @Test
    fun `le vent brut est borne a plus ou moins 1`() {
        assertThat(EphemeralBurnLaw.rawWind(rollTurns = 0.5, lateralG = 1.0)).isEqualTo(1.0)
        assertThat(EphemeralBurnLaw.rawWind(rollTurns = -0.5, lateralG = -1.0)).isEqualTo(-1.0)
    }

    @Test
    fun `un capteur en defaut, NaN ou infini, compte comme absent`() {
        assertThat(EphemeralBurnLaw.rawWind(rollTurns = Double.NaN, lateralG = Double.POSITIVE_INFINITY)).isNull()
        assertThat(EphemeralBurnLaw.rawWind(rollTurns = Double.NaN, lateralG = 0.1)!!).isWithin(1e-10).of(0.2)
    }

    @Test
    fun `sans geste, le vent souffle a 0,35 vers le bord exterieur de la bulle`() {
        assertThat(EphemeralBurnLaw.DEFAULT_WIND).isEqualTo(0.35)
        assertThat(EphemeralBurnLaw.wind(raw = null, side = EphemeralBurnSide.MINE)).isEqualTo(0.35)
        assertThat(EphemeralBurnLaw.wind(raw = null, side = EphemeralBurnSide.THEIRS)).isEqualTo(-0.35)
    }

    @Test
    fun `avec un geste, le geste gagne quel que soit le cote`() {
        assertThat(EphemeralBurnLaw.wind(raw = -0.6, side = EphemeralBurnSide.MINE)).isEqualTo(-0.6)
        assertThat(EphemeralBurnLaw.wind(raw = 0.2, side = EphemeralBurnSide.THEIRS)).isEqualTo(0.2)
    }

    @Test
    fun `le feu s'allume du cote d'ou vient le vent - le front suit le signe du vent`() {
        assertThat(EphemeralBurnLaw.frontDirection(0.35)).isEqualTo(1)
        assertThat(EphemeralBurnLaw.frontDirection(-0.2)).isEqualTo(-1)
        assertThat(EphemeralBurnLaw.frontDirection(0.0)).isEqualTo(1)
    }

    @Test
    fun `ignition jusqu'a 0,15, propagation jusqu'a 0,8, cendres ensuite`() {
        assertThat(EphemeralBurnLaw.phaseOf(0.0)).isEqualTo(EphemeralBurnPhase.IGNITION)
        assertThat(EphemeralBurnLaw.phaseOf(0.149)).isEqualTo(EphemeralBurnPhase.IGNITION)
        assertThat(EphemeralBurnLaw.phaseOf(0.15)).isEqualTo(EphemeralBurnPhase.SPREAD)
        assertThat(EphemeralBurnLaw.phaseOf(0.79)).isEqualTo(EphemeralBurnPhase.SPREAD)
        assertThat(EphemeralBurnLaw.phaseOf(0.8)).isEqualTo(EphemeralBurnPhase.ASHES)
        assertThat(EphemeralBurnLaw.phaseOf(1.0)).isEqualTo(EphemeralBurnPhase.ASHES)
    }

    @Test
    fun `le cote suit l'auteur - le mien a droite, le leur a gauche`() {
        assertThat(EphemeralBurnSide.of(isMine = true)).isEqualTo(EphemeralBurnSide.MINE)
        assertThat(EphemeralBurnSide.of(isMine = false)).isEqualTo(EphemeralBurnSide.THEIRS)
    }

    @Test
    fun `une mort est fraiche tant qu'elle est plus jeune que la combustion moins 100 ms`() {
        assertThat(EphemeralBurnLaw.FRESH_DEATH_WINDOW_MILLIS).isEqualTo(1100L)
        assertThat(EphemeralBurnLaw.isFreshDeath(deathAtMillis = 10_000L, nowMillis = 10_000L)).isTrue()
        assertThat(EphemeralBurnLaw.isFreshDeath(deathAtMillis = 10_000L, nowMillis = 11_099L)).isTrue()
        assertThat(EphemeralBurnLaw.isFreshDeath(deathAtMillis = 10_000L, nowMillis = 11_100L)).isFalse()
    }
}
