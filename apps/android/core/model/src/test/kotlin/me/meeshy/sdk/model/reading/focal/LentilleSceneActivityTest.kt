package me.meeshy.sdk.model.reading.focal

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class LentilleSceneActivityTest {

    private val rest = LentilleSceneActivity.State()

    @Test
    fun `la scene est a plat au repos et monte au premier defilement en un quart de seconde`() {
        assertThat(LentilleSceneActivity.targetLevel(rest, 0)).isEqualTo(0.0)
        val scrolled = LentilleSceneActivity.noteScroll(rest, offset = 120.0, nowMs = 1_000)
        assertThat(LentilleSceneActivity.targetLevel(scrolled, 1_000)).isEqualTo(1.0)
        assertThat(scrolled.offset).isEqualTo(120.0)
        assertThat(LentilleSceneActivity.transitionDurationMs(1.0)).isEqualTo(250)
    }

    @Test
    fun `la scene retombe en 0,45 s apres 4,5 s de repos et chaque tick rearme le compte a rebours`() {
        val first = LentilleSceneActivity.noteScroll(rest, 10.0, 1_000)
        assertThat(LentilleSceneActivity.flattenAtMs(first)).isEqualTo(5_500)
        assertThat(LentilleSceneActivity.targetLevel(first, 5_499)).isEqualTo(1.0)
        assertThat(LentilleSceneActivity.targetLevel(first, 5_500)).isEqualTo(0.0)
        val rearmed = LentilleSceneActivity.noteScroll(first, 20.0, 5_000)
        assertThat(LentilleSceneActivity.targetLevel(rearmed, 5_500)).isEqualTo(1.0)
        assertThat(LentilleSceneActivity.transitionDurationMs(0.0)).isEqualTo(450)
    }

    @Test
    fun `aplatir remet la scene au repos sans attendre`() {
        val flat = LentilleSceneActivity.flatten(LentilleSceneActivity.noteScroll(rest, 10.0, 1_000))
        assertThat(LentilleSceneActivity.isActive(flat, 1_001)).isFalse()
        assertThat(LentilleSceneActivity.flattenAtMs(flat)).isNull()
    }

    @Test
    fun `le fondu interpole entre l identite et la loi et borne le niveau`() {
        val law = FocalFocusCurve.Result(alpha = 0.5, scale = 0.8)
        assertThat(LentilleSceneActivity.blend(law, 0.0)).isEqualTo(FocalFocusCurve.Result.IDENTITY)
        assertThat(LentilleSceneActivity.blend(law, 1.0)).isEqualTo(law)
        val half = LentilleSceneActivity.blend(law, 0.5)
        assertThat(half.alpha).isWithin(1e-9).of(0.75)
        assertThat(half.scale).isWithin(1e-9).of(0.9)
        assertThat(LentilleSceneActivity.blend(law, 7.0)).isEqualTo(law)
        assertThat(LentilleSceneActivity.blend(law, -3.0)).isEqualTo(FocalFocusCurve.Result.IDENTITY)
    }

    @Test
    fun `la meta de la liste ne se revele qu au defilement et s efface 900 ms apres`() {
        var state = LentilleRowMetaReveal.State()
        assertThat(LentilleRowMetaReveal.isRevealed(state, 0)).isFalse()
        state = LentilleRowMetaReveal.noteScroll(state, 1_000)
        assertThat(LentilleRowMetaReveal.isRevealed(state, 1_899)).isTrue()
        assertThat(LentilleRowMetaReveal.isRevealed(state, 1_900)).isFalse()
        assertThat(LentilleRowMetaReveal.FADE_DURATION_MS).isEqualTo(180)
    }

    @Test
    fun `a l ouverture la premiere rangee posee revele la meta une seule fois`() {
        var state = LentilleRowMetaReveal.armOpening(LentilleRowMetaReveal.State())
        state = LentilleRowMetaReveal.noteRowShown(state, 100)
        assertThat(LentilleRowMetaReveal.isRevealed(state, 500)).isTrue()
        val after = LentilleRowMetaReveal.noteRowShown(state, 5_000)
        assertThat(LentilleRowMetaReveal.isRevealed(after, 5_100)).isFalse()
        val unarmed = LentilleRowMetaReveal.noteRowShown(LentilleRowMetaReveal.State(), 100)
        assertThat(LentilleRowMetaReveal.isRevealed(unarmed, 200)).isFalse()
    }
}
