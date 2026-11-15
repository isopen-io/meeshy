package me.meeshy.ui.motion

import androidx.compose.animation.core.SnapSpec
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.scaleOut
import androidx.compose.animation.togetherWith
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.accessibility.MotionSpecs
import me.meeshy.sdk.model.call.CallChromeStow
import me.meeshy.ui.theme.MeeshyMotion
import org.junit.Test

class ReducedMotionTransitionsTest {

    private val slide = scaleIn(MeeshyMotion.springDefault(), initialScale = 0.5f)
    private val slideOut = scaleOut(MeeshyMotion.springDefault(), targetScale = 0.5f)

    @Test
    fun `le fondu reduit dure 150 ms, comme MeeshyMotion reducedFade d'iOS`() {
        assertThat(MotionSpecs.REDUCED_FADE_MILLIS).isEqualTo(150)
        assertThat(meeshyReducedFadeIn()).isEqualTo(fadeIn(tween(150)))
        assertThat(meeshyReducedFadeOut()).isEqualTo(fadeOut(tween(150)))
    }

    @Test
    fun `les appels lisent la meme valeur reduite que le reste de l'app`() {
        assertThat(CallChromeStow.REDUCED_FADE_MILLIS).isEqualTo(MotionSpecs.REDUCED_FADE_MILLIS)
    }

    @Test
    fun `sous reduction l'entree et la sortie deviennent le fondu court`() {
        assertThat(meeshyEnter(reduce = true, full = slide)).isEqualTo(fadeIn(tween(150)))
        assertThat(meeshyExit(reduce = true, full = slideOut)).isEqualTo(fadeOut(tween(150)))
    }

    @Test
    fun `hors reduction l'entree et la sortie restent celles de l'appelant`() {
        assertThat(meeshyEnter(reduce = false, full = slide)).isEqualTo(slide)
        assertThat(meeshyExit(reduce = false, full = slideOut)).isEqualTo(slideOut)
    }

    @Test
    fun `sous reduction un ressort devient un snap, hors reduction il reste`() {
        val spring = MeeshyMotion.springFast<Float>()
        assertThat(meeshySpec(reduce = true, full = spring)).isInstanceOf(SnapSpec::class.java)
        assertThat(meeshySpec(reduce = false, full = spring)).isSameInstanceAs(spring)
    }

    @Test
    fun `sous reduction un AnimatedContent permute en fondu court, hors reduction il garde sa transformation`() {
        val full = slide togetherWith slideOut
        val reduced = meeshyContentTransform(reduce = true, full = full)
        assertThat(reduced.targetContentEnter).isEqualTo(fadeIn(tween(150)))
        assertThat(reduced.initialContentExit).isEqualTo(fadeOut(tween(150)))
        assertThat(meeshyContentTransform(reduce = false, full = full)).isSameInstanceAs(full)
    }

    @Test
    fun `le zoom garde son propre fondu de 120 ms`() {
        assertThat(meeshyZoomEnter(reduce = true)).isEqualTo(fadeIn(tween(120)))
        assertThat(meeshyZoomExit(reduce = true)).isEqualTo(fadeOut(tween(120)))
    }
}
