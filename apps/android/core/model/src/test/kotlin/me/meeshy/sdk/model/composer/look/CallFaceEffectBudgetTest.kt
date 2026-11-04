package me.meeshy.sdk.model.composer.look

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/** Ce que les effets de visage dépensent — miroir de `CallFaceEffectBudget` (iOS). */
class CallFaceEffectBudgetTest {

    @Test
    fun `au regime plein, vingt huit braises, six verrues, lueur permise, detection toutes les cinq images`() {
        assertThat(CallFaceEffectBudget.emberCount(isDegraded = false)).isEqualTo(28)
        assertThat(CallFaceEffectBudget.wartCount(isDegraded = false)).isEqualTo(6)
        assertThat(CallFaceEffectBudget.allowsBloom(isDegraded = false)).isTrue()
        assertThat(CallFaceEffectBudget.detectionStride(isDegraded = false)).isEqualTo(5)
    }

    @Test
    fun `sous contrainte, braises et verrues reduites, plus de lueur, detection espacee`() {
        assertThat(CallFaceEffectBudget.emberCount(isDegraded = true)).isEqualTo(12)
        assertThat(CallFaceEffectBudget.wartCount(isDegraded = true)).isEqualTo(3)
        assertThat(CallFaceEffectBudget.allowsBloom(isDegraded = true)).isFalse()
        assertThat(CallFaceEffectBudget.detectionStride(isDegraded = true)).isEqualTo(10)
    }

    @Test
    fun `les constantes de lissage, d oubli et de lueur sont celles d iOS`() {
        assertThat(CallFaceEffectBudget.LANDMARK_SMOOTHING).isEqualTo(0.5f)
        assertThat(CallFaceEffectBudget.MISSES_BEFORE_LOSING_FACE).isEqualTo(3)
        assertThat(CallFaceEffectBudget.GLOW_REDUCTION).isEqualTo(0.25f)
        assertThat(CallFaceEffectBudget.EMBER_OPACITY_LEVELS).isEqualTo(5)
    }
}
