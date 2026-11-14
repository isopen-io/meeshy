package me.meeshy.app.navigation

import androidx.compose.animation.core.SnapSpec
import androidx.compose.animation.core.SpringSpec
import androidx.compose.animation.core.TweenSpec
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import com.google.common.truth.Truth.assertThat
import me.meeshy.app.sync.PendingBannerMotion
import me.meeshy.ui.theme.MeeshyMotion
import org.junit.Test

/**
 * #18387 — les couches de la racine (bandeau de lien en attente, bandeau ambre, visage du bouton Flux) entrent et
 * sortent animées, et passent au fondu court, sans dépliage ni glissé, sous « Réduire les animations ».
 */
class RootLayersReduceMotionTest {

    @Test
    fun `sous reduction le bandeau de lien en attente apparait et part en fondu seul`() {
        assertThat(pendingLinkBannerEnter(reduce = true)).isEqualTo(fadeIn(tween(150)))
        assertThat(pendingLinkBannerExit(reduce = true)).isEqualTo(fadeOut(tween(150)))
    }

    @Test
    fun `hors reduction le bandeau de lien en attente se deplie toujours`() {
        assertThat(pendingLinkBannerEnter(reduce = false)).isNotEqualTo(fadeIn(tween(150)))
        assertThat(pendingLinkBannerExit(reduce = false)).isNotEqualTo(fadeOut(tween(150)))
    }

    @Test
    fun `sous reduction le bandeau ambre apparait et part en fondu seul`() {
        assertThat(PendingBannerMotion.enter(reduce = true)).isEqualTo(fadeIn(tween(150)))
        assertThat(PendingBannerMotion.exit(reduce = true)).isEqualTo(fadeOut(tween(150)))
    }

    @Test
    fun `hors reduction le bandeau ambre entre et sort sur le meme ressort 0,4 et 0,8 d'iOS`() {
        val spec = PendingBannerMotion.spring<Float>() as SpringSpec<Float>
        assertThat(spec.dampingRatio).isEqualTo(0.8f)
        assertThat(spec.stiffness).isWithin(0.01f).of(MeeshyMotion.stiffnessForResponse(0.4f))
        assertThat(PendingBannerMotion.enter(reduce = false)).isNotEqualTo(fadeIn(tween(150)))
        assertThat(PendingBannerMotion.exit(reduce = false)).isNotEqualTo(fadeOut(tween(150)))
    }

    @Test
    fun `le visage du bouton Flux se fond en 200 ms, et change aussitot sous reduction`() {
        assertThat((feedButtonFaceSpec(reduce = false) as TweenSpec<Float>).durationMillis).isEqualTo(200)
        assertThat(feedButtonFaceSpec(reduce = true)).isInstanceOf(SnapSpec::class.java)
    }
}
