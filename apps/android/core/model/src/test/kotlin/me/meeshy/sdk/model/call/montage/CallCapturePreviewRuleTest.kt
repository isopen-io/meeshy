package me.meeshy.sdk.model.call.montage

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.call.frames.CallLiveFrameRule
import org.junit.Test

/**
 * L'aperçu peint du mode Montage, aux mesures d'iOS (`CallCaptureController` : 540 × 960 toutes les
 * 200 ms, vignettes 108 × 192 refaites un tour sur cinq, à trois styles de part et d'autre du choisi) ;
 * un cadre servi en direct se montre sur le flux, rien ne se peint pour lui.
 */
class CallCapturePreviewRuleTest {

    private val live = CallCaptureLook.Frame(CallLiveFrameRule.frames().first())

    @Test
    fun `les mesures sont celles d'iOS`() {
        assertThat(CallCapturePreviewRule.INTERVAL_MILLIS).isEqualTo(200L)
        assertThat(CallCapturePreviewRule.THUMBNAIL_EVERY_PREVIEWS).isEqualTo(5)
        assertThat(CallCapturePreviewRule.THUMBNAIL_RADIUS).isEqualTo(3)
        assertThat(CallCapturePreviewRule.PREVIEW_WIDTH to CallCapturePreviewRule.PREVIEW_HEIGHT).isEqualTo(540 to 960)
        assertThat(CallCapturePreviewRule.THUMBNAIL_WIDTH to CallCapturePreviewRule.THUMBNAIL_HEIGHT).isEqualTo(108 to 192)
        assertThat(CallCapturePreviewRule.MAX_DIMENSION).isEqualTo(640)
    }

    @Test
    fun `la fenetre des vignettes entoure le choisi sans deborder du catalogue`() {
        val styles = CallMontageStyle.entries.toList()

        assertThat(CallCapturePreviewRule.window(CallMontageStyle.SCREEN, styles, 3)).isEqualTo(styles.take(4))
        assertThat(CallCapturePreviewRule.window(CallMontageStyle.POLAROID, styles, 3)).isEqualTo(styles.subList(3, 10))
        assertThat(CallCapturePreviewRule.window(CallMontageStyle.HEART, styles, 3)).isEqualTo(styles.takeLast(4))
        assertThat(CallCapturePreviewRule.window("absent", listOf("a", "b", "c"), 1)).isEqualTo(listOf("a", "b"))
        assertThat(CallCapturePreviewRule.window("a", emptyList(), 3)).isEmpty()
    }

    @Test
    fun `un classique peint son apercu et, au premier tour, les vignettes de son voisinage`() {
        val plan = CallCapturePreviewRule.plan(CallCaptureLook.Classic(CallMontageStyle.GRID), liveFrameShown = false, hasThumbnails = false, previewsSinceThumbnails = 0)

        assertThat(plan.preview).isTrue()
        assertThat(plan.thumbnails).isEqualTo(CallMontageStyle.entries.toList().subList(1, 8))
        assertThat(plan.isEmpty).isFalse()
    }

    @Test
    fun `les vignettes deja faites ne se refont qu'un tour sur cinq`() {
        val look = CallCaptureLook.Classic(CallMontageStyle.SCREEN)

        assertThat(CallCapturePreviewRule.plan(look, false, hasThumbnails = true, previewsSinceThumbnails = 4).thumbnails).isEmpty()
        assertThat(CallCapturePreviewRule.plan(look, false, hasThumbnails = true, previewsSinceThumbnails = 5).thumbnails).isNotEmpty()
    }

    @Test
    fun `un cadre servi en direct ne peint rien, un cadre suspendu peint son apercu sans vignette classique`() {
        assertThat(CallCapturePreviewRule.plan(live, liveFrameShown = true, hasThumbnails = false, previewsSinceThumbnails = 0).isEmpty).isTrue()

        val suspended = CallCapturePreviewRule.plan(live, liveFrameShown = false, hasThumbnails = false, previewsSinceThumbnails = 0)
        assertThat(suspended.preview).isTrue()
        assertThat(suspended.thumbnails).isEmpty()
    }

    @Test
    fun `la scene peinte recouvre l'appel pour un classique ou un cadre que le direct ne sert pas`() {
        assertThat(CallCapturePreviewRule.paintsPreview(CallCaptureLook.Classic(CallMontageStyle.SCREEN), liveFrameShown = true)).isTrue()
        assertThat(CallCapturePreviewRule.paintsPreview(live, liveFrameShown = true)).isFalse()
        assertThat(CallCapturePreviewRule.paintsPreview(live, liveFrameShown = false)).isTrue()
    }

    @Test
    fun `un cadre choisi refait les vignettes de son voisinage, jamais celles des classiques`() {
        val window = CallLiveFrameRule.frames().take(3)

        val first = CallCapturePreviewRule.plan(live, liveFrameShown = true, hasThumbnails = false, previewsSinceThumbnails = 0, frameWindow = window)
        assertThat(first.frames).isEqualTo(window)
        assertThat(first.thumbnails).isEmpty()
        assertThat(first.preview).isFalse()
        assertThat(first.isEmpty).isFalse()

        assertThat(CallCapturePreviewRule.plan(live, true, hasThumbnails = true, previewsSinceThumbnails = 2, frameWindow = window).isEmpty).isTrue()
        assertThat(CallCapturePreviewRule.plan(CallCaptureLook.Classic(CallMontageStyle.GRID), false, false, 0, frameWindow = window).frames).isEmpty()
    }
}
