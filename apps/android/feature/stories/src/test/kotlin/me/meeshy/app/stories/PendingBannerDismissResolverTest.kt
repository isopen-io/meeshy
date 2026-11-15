package me.meeshy.app.stories

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class PendingBannerDismissResolverTest {

    @Test
    fun `un glissement vers le haut au-dela de 24 dp ecarte la banniere`() {
        assertThat(PendingBannerDismissResolver.shouldDismiss(0f, -30f)).isTrue()
    }

    @Test
    fun `un glissement vers la gauche ou la droite au-dela de 24 dp ecarte la banniere`() {
        assertThat(PendingBannerDismissResolver.shouldDismiss(-25f, 0f)).isTrue()
        assertThat(PendingBannerDismissResolver.shouldDismiss(25f, 3f)).isTrue()
    }

    @Test
    fun `vers le bas rien n'est ecarte, meme tres loin`() {
        assertThat(PendingBannerDismissResolver.shouldDismiss(0f, 400f)).isFalse()
    }

    @Test
    fun `le seuil lui-meme n'ecarte pas`() {
        assertThat(PendingBannerDismissResolver.shouldDismiss(24f, -24f)).isFalse()
    }

    @Test
    fun `la banniere suit le doigt sans jamais descendre`() {
        assertThat(PendingBannerDismissResolver.followOffsetDp(10f, 20f)).isEqualTo(10f to 0f)
        assertThat(PendingBannerDismissResolver.followOffsetDp(-8f, -12f)).isEqualTo(-8f to -12f)
    }

    @Test
    fun `la banniere s'efface avec la distance`() {
        assertThat(PendingBannerDismissResolver.fadeAlpha(0f, 0f)).isEqualTo(1f)
        assertThat(PendingBannerDismissResolver.fadeAlpha(0f, -24f)).isWithin(0.001f).of(0.5f)
        assertThat(PendingBannerDismissResolver.fadeAlpha(60f, 0f)).isEqualTo(0f)
        assertThat(PendingBannerDismissResolver.fadeAlpha(0f, 50f)).isEqualTo(1f)
    }
}
