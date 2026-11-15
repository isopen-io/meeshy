package me.meeshy.sdk.model.call

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/** Les effets de visage du mode « Effets » — miroir de `CallFaceEffectTests` (iOS). */
class CallFaceEffectTest {

    @Test
    fun `les six effets suivent l ordre du carrousel et leurs identifiants analytiques ne bougent pas`() {
        assertThat(CallFaceEffect.entries.map { it.id })
            .containsExactly("none", "smoothing", "toad", "angel", "demon", "volcano").inOrder()
    }

    @Test
    fun `seuls les effets ludiques sont stylises`() {
        assertThat(CallFaceEffect.entries.filter { it.isStylized })
            .containsExactly(CallFaceEffect.Toad, CallFaceEffect.Angel, CallFaceEffect.Demon, CallFaceEffect.Volcano)
    }

    @Test
    fun `le volcan et aucun effet se passent de visage, les autres en demandent un`() {
        assertThat(CallFaceEffect.Volcano.needsFace).isFalse()
        assertThat(CallFaceEffect.None.needsFace).isFalse()
        assertThat(listOf(CallFaceEffect.Smoothing, CallFaceEffect.Toad, CallFaceEffect.Angel, CallFaceEffect.Demon).all { it.needsFace }).isTrue()
    }

    @Test
    fun `le nom analytique est prefixe face et absent sans effet`() {
        assertThat(CallFaceEffect.None.analyticsName).isNull()
        assertThat(CallFaceEffect.Demon.analyticsName).isEqualTo("face:demon")
    }

    @Test
    fun `choisir Peau lissee allume son drapeau, choisir un effet stylise l eteint`() {
        val smoothing = VideoFilterConfig().selectingFaceEffect(CallFaceEffect.Smoothing)
        assertThat(smoothing.skinSmoothingEnabled).isTrue()
        assertThat(smoothing.activeFaceEffect).isEqualTo(CallFaceEffect.Smoothing)

        val toad = smoothing.selectingFaceEffect(CallFaceEffect.Toad)
        assertThat(toad.skinSmoothingEnabled).isFalse()
        assertThat(toad.activeFaceEffect).isEqualTo(CallFaceEffect.Toad)
    }

    @Test
    fun `l ancien drapeau de lissage se lit comme Peau lissee, un effet stylise l emporte`() {
        assertThat(VideoFilterConfig(skinSmoothingEnabled = true).activeFaceEffect).isEqualTo(CallFaceEffect.Smoothing)
        assertThat(VideoFilterConfig(skinSmoothingEnabled = true, faceEffect = CallFaceEffect.Angel).activeFaceEffect)
            .isEqualTo(CallFaceEffect.Angel)
    }

    @Test
    fun `aucun effet eteint tout et un effet stylise seul compte comme filtre avance`() {
        val off = VideoFilterConfig().selectingFaceEffect(CallFaceEffect.Volcano).selectingFaceEffect(CallFaceEffect.None)
        assertThat(off.activeFaceEffect).isEqualTo(CallFaceEffect.None)
        assertThat(off.hasAdvancedFilters).isFalse()
        assertThat(VideoFilterConfig().selectingFaceEffect(CallFaceEffect.Demon).hasAdvancedFilters).isTrue()
    }

    @Test
    fun `appliquer une teinte garde l effet de visage choisi`() {
        val config = VideoFilterConfig().selectingFaceEffect(CallFaceEffect.Angel).applyingPreset(VideoFilterPreset.Warm)
        assertThat(config.faceEffect).isEqualTo(CallFaceEffect.Angel)
        assertThat(config.activePreset).isEqualTo(VideoFilterPreset.Warm)
    }
}
