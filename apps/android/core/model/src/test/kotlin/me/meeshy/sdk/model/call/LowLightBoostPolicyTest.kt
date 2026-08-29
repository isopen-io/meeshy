package me.meeshy.sdk.model.call

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * Behavioural coverage of the automatic low-light-boost pass. Each case pins an
 * observable outcome of [LowLightBoostPolicy.plan] — a boost is absent above the
 * dark threshold, present and stronger the darker the frame, and clamped so a
 * degenerate reading never over-boosts. Nothing here recomputes the formula it
 * checks: the anchors are concrete values (max boost, no boost) and monotonic
 * relations. Faithful to iOS `VideoFilterPipeline.applyLowLightBoost`.
 */
class LowLightBoostPolicyTest {

    private val tol = 1e-4f

    // --- gate: no reading / bright frames yield no boost ------------------------

    @Test
    fun `a null brightness reading yields no boost`() {
        assertThat(LowLightBoostPolicy.plan(null)).isNull()
    }

    @Test
    fun `a fully bright frame yields no boost`() {
        assertThat(LowLightBoostPolicy.plan(255f)).isNull()
    }

    @Test
    fun `a frame just above the dark threshold yields no boost`() {
        // 77 / 255 ~= 0.302, just past the 0.3 trigger.
        assertThat(LowLightBoostPolicy.plan(77f)).isNull()
    }

    @Test
    fun `a frame just below the dark threshold yields a small boost`() {
        // 76 / 255 ~= 0.298, just under the 0.3 trigger.
        val boost = LowLightBoostPolicy.plan(76f)
        assertThat(boost).isNotNull()
        assertThat(boost!!.exposureEv).isGreaterThan(0f)
        assertThat(boost.exposureEv).isLessThan(0.05f)
    }

    // --- boost strength anchors -------------------------------------------------

    @Test
    fun `a pitch-black frame boosts at full strength`() {
        val boost = LowLightBoostPolicy.plan(0f)!!
        assertThat(boost.exposureEv).isWithin(tol).of(1.5f)
        assertThat(boost.noiseReductionLevel).isWithin(tol).of(0.02f)
        assertThat(boost.noiseReductionSharpness).isWithin(tol).of(0.4f)
        assertThat(boost.saturation).isWithin(tol).of(1.2f)
    }

    @Test
    fun `a half-dark frame boosts at half strength`() {
        // 38.25 / 255 = 0.15 -> boostFactor (0.3-0.15)/0.3 = 0.5.
        val boost = LowLightBoostPolicy.plan(38.25f)!!
        assertThat(boost.exposureEv).isWithin(tol).of(0.75f)
        assertThat(boost.noiseReductionLevel).isWithin(tol).of(0.01f)
        assertThat(boost.saturation).isWithin(tol).of(1.1f)
    }

    // --- behaviour: darker means stronger --------------------------------------

    @Test
    fun `a darker frame boosts more than a dimmer one`() {
        val darker = LowLightBoostPolicy.plan(10f)!!
        val dimmer = LowLightBoostPolicy.plan(60f)!!
        assertThat(darker.exposureEv).isGreaterThan(dimmer.exposureEv)
        assertThat(darker.saturation).isGreaterThan(dimmer.saturation)
        assertThat(darker.noiseReductionLevel).isGreaterThan(dimmer.noiseReductionLevel)
    }

    @Test
    fun `sharpness is constant across boost strengths`() {
        assertThat(LowLightBoostPolicy.plan(10f)!!.noiseReductionSharpness)
            .isWithin(tol).of(LowLightBoostPolicy.plan(60f)!!.noiseReductionSharpness)
    }

    @Test
    fun `any active boost raises saturation above neutral`() {
        assertThat(LowLightBoostPolicy.plan(70f)!!.saturation).isGreaterThan(1.0f)
    }

    // --- SOTA hardening: a degenerate negative reading never over-boosts --------

    @Test
    fun `a negative reading clamps to full strength rather than over-boosting`() {
        val boost = LowLightBoostPolicy.plan(-40f)!!
        assertThat(boost.exposureEv).isWithin(tol).of(1.5f)
        assertThat(boost.saturation).isWithin(tol).of(1.2f)
    }

    // --- folding FrameLuminance: the actuator's one-call seam -------------------

    @Test
    fun `a dark Y plane folded through FrameLuminance produces a boost`() {
        val dark = ByteArray(64 * 64) { 5.toByte() }
        val boost = LowLightBoostPolicy.planForFrame(dark, width = 64, height = 64)
        assertThat(boost).isNotNull()
        assertThat(boost!!.exposureEv).isGreaterThan(1.0f)
    }

    @Test
    fun `a bright Y plane folded through FrameLuminance produces no boost`() {
        val bright = ByteArray(64 * 64) { 200.toByte() }
        assertThat(LowLightBoostPolicy.planForFrame(bright, width = 64, height = 64)).isNull()
    }

    @Test
    fun `a degenerate frame geometry folds to no boost`() {
        val plane = ByteArray(16)
        assertThat(LowLightBoostPolicy.planForFrame(plane, width = 0, height = 64)).isNull()
    }
}
