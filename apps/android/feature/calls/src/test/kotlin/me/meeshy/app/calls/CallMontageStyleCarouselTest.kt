package me.meeshy.app.calls

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.call.frames.CallFrameCatalogue
import me.meeshy.sdk.model.call.frames.CallFrameMood
import me.meeshy.sdk.model.call.frames.CallFrameScope
import me.meeshy.sdk.model.call.frames.CallFrameSpotlightRule
import me.meeshy.sdk.model.call.frames.CallFrameStyleRule
import me.meeshy.sdk.model.call.montage.CallCapturePreviewRule
import me.meeshy.sdk.model.call.montage.CallMontageChoice
import me.meeshy.sdk.model.call.montage.CallMontagePick
import me.meeshy.sdk.model.call.montage.CallMontagePickRule
import me.meeshy.sdk.model.call.montage.CallMontageStyle
import org.junit.Test

/** Le coût du carrousel ne grandit pas avec le catalogue : seules les vignettes proches du choix se peignent. */
class CallMontageStyleCarouselTest {

    private val duo = 2

    @Test
    fun `seules les vignettes proches du style classique choisi se peignent`() {
        val window = CallCapturePreviewRule.window(CallMontageStyle.NEON, CallMontageStyle.entries.toList(), CallCapturePreviewRule.THUMBNAIL_RADIUS)

        assertThat(window).hasSize(2 * CallCapturePreviewRule.THUMBNAIL_RADIUS + 1)
        assertThat(window).contains(CallMontageStyle.NEON)
    }

    @Test
    fun `la fenetre des cadres reste bornee meme quand tout le catalogue est ouvert`() {
        val frames = CallFrameSpotlightRule.frames(duo, CallFrameMood.SIGNATURE, CallFrameScope.ALL)
        val first = frames.first()
        val pick = CallMontagePickRule.settingScope(
            CallMontagePickRule.selecting(CallMontagePick(), CallMontageChoice.Frame(first.id)),
            CallFrameScope.ALL,
            duo,
        )

        val window = CallMontagePickRule.frameWindow(pick, duo)

        val bound = 2 * CallCapturePreviewRule.THUMBNAIL_RADIUS + 1 + CallFrameStyleRule.declinations(first.id).size
        assertThat(window.size).isAtMost(bound)
        assertThat(window.size).isLessThan(CallFrameCatalogue.all.size)
        assertThat(window.map { it.id }).contains(first.id)
    }

    @Test
    fun `un classique choisi ne demande aucune vignette de cadre`() {
        assertThat(CallMontagePickRule.frameWindow(CallMontagePick(), duo)).isEmpty()
    }
}
