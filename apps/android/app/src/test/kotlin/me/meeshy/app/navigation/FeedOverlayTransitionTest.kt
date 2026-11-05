package me.meeshy.app.navigation

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.feed.FeedOverlayAppearance
import org.junit.Test

/** Le Flux est une surcouche de la liste : asymétrique vers une racine, poussée commune vers un écran empilé. */
class FeedOverlayTransitionTest {

    @Test
    fun `vers la liste des conversations la sortie est celle de la surcouche`() {
        assertThat(FeedOverlayTransition.kindFor(Routes.CONVERSATIONS)).isEqualTo(FeedOverlayTransition.Kind.OVERLAY)
    }

    @Test
    fun `vers un detail de post ou les reels le flux garde la poussee commune`() {
        assertThat(FeedOverlayTransition.kindFor(Routes.POST_DETAIL)).isEqualTo(FeedOverlayTransition.Kind.STACKED)
        assertThat(FeedOverlayTransition.kindFor(Routes.NEARBY_DISCOVERY)).isEqualTo(FeedOverlayTransition.Kind.STACKED)
        assertThat(FeedOverlayTransition.kindFor(Routes.REELS)).isEqualTo(FeedOverlayTransition.Kind.STACKED)
    }

    @Test
    fun `l'entree et la sortie sont asymetriques et reduire les animations ne laisse qu'un fondu`() {
        val full = FeedOverlayAppearance.motion(reduceMotion = false)
        val reduced = FeedOverlayAppearance.motion(reduceMotion = true)

        assertThat(full.exitScale).isLessThan(1f)
        assertThat(full.entersFromBottom).isTrue()
        assertThat(reduced.exitScale).isEqualTo(1f)
        assertThat(reduced.entersFromBottom).isFalse()
        assertThat(reduced.fades).isTrue()
    }
}
