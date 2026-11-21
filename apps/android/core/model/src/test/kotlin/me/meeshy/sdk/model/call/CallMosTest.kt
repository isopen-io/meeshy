package me.meeshy.sdk.model.call

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * #19895 — le MOS d'un appel, miroir de `CallMOS.estimate` (MeeshySDK) et
 * d'`estimateCallMos` (`packages/shared/utils/call-mos.ts`) : les six cas et
 * les valeurs attendues sont ceux de `CallMOSTests.swift`, pour qu'un même lien
 * rende la même note sur iOS, le web et Android.
 */
class CallMosTest {

    @Test
    fun `un lien propre est excellent`() {
        assertThat(CallMos.estimate(roundTripTimeMs = 0.0, jitterMs = 0.0, packetLossPercent = 0.0)).isGreaterThan(4.3)
    }

    @Test
    fun `un lien mobile ordinaire est bon`() {
        val mos = CallMos.estimate(roundTripTimeMs = 200.0, jitterMs = 20.0, packetLossPercent = 2.0)
        assertThat(mos).isWithin(0.05).of(3.76)
    }

    @Test
    fun `un lien casse est mauvais`() {
        assertThat(CallMos.estimate(roundTripTimeMs = 600.0, jitterMs = 50.0, packetLossPercent = 10.0)).isLessThan(1.5)
    }

    @Test
    fun `la note baisse a chaque palier de perte`() {
        val pertes = listOf(0.0, 1.0, 3.0, 8.0, 20.0)
            .map { CallMos.estimate(roundTripTimeMs = 100.0, jitterMs = 10.0, packetLossPercent = it) }
        assertThat(pertes).isEqualTo(pertes.sortedDescending())
        assertThat(pertes.toSet()).hasSize(pertes.size)
    }

    @Test
    fun `la note baisse quand le delai monte`() {
        val delais = listOf(50.0, 200.0, 400.0, 800.0)
            .map { CallMos.estimate(roundTripTimeMs = it, jitterMs = 10.0, packetLossPercent = 1.0) }
        assertThat(delais).isEqualTo(delais.sortedDescending())
    }

    @Test
    fun `la note reste dans l'intervalle que la passerelle accepte, meme sur des mesures aberrantes`() {
        val extremes = listOf(
            CallMos.estimate(roundTripTimeMs = -50.0, jitterMs = -1.0, packetLossPercent = -3.0),
            CallMos.estimate(roundTripTimeMs = 100_000.0, jitterMs = 10_000.0, packetLossPercent = 100.0),
            CallMos.estimate(roundTripTimeMs = Double.NaN, jitterMs = 0.0, packetLossPercent = 0.0),
            CallMos.estimate(roundTripTimeMs = Double.POSITIVE_INFINITY, jitterMs = Double.NaN, packetLossPercent = Double.NEGATIVE_INFINITY),
        )
        extremes.forEach {
            assertThat(it).isAtLeast(1.0)
            assertThat(it).isAtMost(CallMos.CEILING)
        }
    }
}
