package me.meeshy.ui.component.viewer

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * Décision de source pour le plein écran d'une image — port Kotlin du patron
 * iOS `FullscreenImageSource.resolve` / web `resolveFullscreenImageSource`
 * (#3871 → #3878). Deux cas, et deux seulement : le plein format est
 * RÉSIDENT (affiché tel quel, sans spinner ni fond) ou il se CHARGE (fond =
 * la vignette, floue, JAMAIS l'image affichée nette elle-même).
 */
class ImageViewerSourceTest {

    @Test
    fun `no full-resolution url yields no mount — the caller renders its empty state`() {
        assertThat(ImageViewerSource.resolve(fullUrl = null, thumbnailUrl = "t", isFullResident = false)).isNull()
        assertThat(ImageViewerSource.resolve(fullUrl = "", thumbnailUrl = "t", isFullResident = false)).isNull()
    }

    @Test
    fun `resident full image has no backdrop — cache non vide, jamais de spinner`() {
        val mount = ImageViewerSource.resolve(fullUrl = "full", thumbnailUrl = "thumb", isFullResident = true)

        assertThat(mount).isEqualTo(
            FullscreenImageMount(fullUrl = "full", backdropUrl = null, isResident = true),
        )
    }

    @Test
    fun `resident full image ignores the thumbnail entirely — never shown, even as backdrop`() {
        val mount = ImageViewerSource.resolve(fullUrl = "full", thumbnailUrl = "thumb", isFullResident = true)

        assertThat(mount?.backdropUrl).isNull()
    }

    @Test
    fun `non-resident full image uses the thumbnail as a blurred backdrop only, never as the displayed image`() {
        val mount = ImageViewerSource.resolve(fullUrl = "full", thumbnailUrl = "thumb", isFullResident = false)

        assertThat(mount).isEqualTo(
            FullscreenImageMount(fullUrl = "full", backdropUrl = "thumb", isResident = false),
        )
    }

    @Test
    fun `the mounted full url is always the full-resolution url, never the thumbnail`() {
        val mount = ImageViewerSource.resolve(fullUrl = "full", thumbnailUrl = "thumb", isFullResident = false)

        assertThat(mount?.fullUrl).isEqualTo("full")
        assertThat(mount?.fullUrl).isNotEqualTo("thumb")
    }

    @Test
    fun `non-resident with no thumbnail available yields no backdrop — never a fabricated fallback`() {
        val mount = ImageViewerSource.resolve(fullUrl = "full", thumbnailUrl = null, isFullResident = false)

        assertThat(mount?.backdropUrl).isNull()
    }
}
