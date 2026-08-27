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

    private fun resolve(
        fullUrl: String?,
        thumbnailUrl: String?,
        isFullResident: Boolean,
        canRenderBlurredBackdrop: Boolean = true,
    ) = ImageViewerSource.resolve(
        fullUrl = fullUrl,
        thumbnailUrl = thumbnailUrl,
        isFullResident = isFullResident,
        canRenderBlurredBackdrop = canRenderBlurredBackdrop,
    )

    @Test
    fun `no full-resolution url yields no mount — the caller renders its empty state`() {
        assertThat(resolve(fullUrl = null, thumbnailUrl = "t", isFullResident = false)).isNull()
        assertThat(resolve(fullUrl = "", thumbnailUrl = "t", isFullResident = false)).isNull()
    }

    @Test
    fun `resident full image has no backdrop — cache non vide, jamais de spinner`() {
        val mount = resolve(fullUrl = "full", thumbnailUrl = "thumb", isFullResident = true)

        assertThat(mount).isEqualTo(
            FullscreenImageMount(fullUrl = "full", backdropUrl = null, isResident = true),
        )
    }

    @Test
    fun `resident full image ignores the thumbnail entirely — never shown, even as backdrop`() {
        val mount = resolve(fullUrl = "full", thumbnailUrl = "thumb", isFullResident = true)

        assertThat(mount?.backdropUrl).isNull()
    }

    @Test
    fun `non-resident full image uses the thumbnail as a blurred backdrop only, never as the displayed image`() {
        val mount = resolve(fullUrl = "full", thumbnailUrl = "thumb", isFullResident = false)

        assertThat(mount).isEqualTo(
            FullscreenImageMount(fullUrl = "full", backdropUrl = "thumb", isResident = false),
        )
    }

    @Test
    fun `the mounted full url is always the full-resolution url, never the thumbnail`() {
        val mount = resolve(fullUrl = "full", thumbnailUrl = "thumb", isFullResident = false)

        assertThat(mount?.fullUrl).isEqualTo("full")
        assertThat(mount?.fullUrl).isNotEqualTo("thumb")
    }

    @Test
    fun `non-resident with no thumbnail available yields no backdrop — never a fabricated fallback`() {
        val mount = resolve(fullUrl = "full", thumbnailUrl = null, isFullResident = false)

        assertThat(mount?.backdropUrl).isNull()
    }

    // Un hôte qui ne sait pas flouter (API < 31 : `Modifier.blur` est un
    // no-op, `RenderEffect` n'existe qu'à partir de S) rendrait la vignette
    // NETTE, plein écran — précisément ce que #3878 interdit. Le fond est
    // alors refusé : la règle prime sur l'agrément.

    @Test
    fun `a host that cannot blur gets no backdrop at all — a sharp thumbnail is worse than none`() {
        val mount = resolve(
            fullUrl = "full",
            thumbnailUrl = "thumb",
            isFullResident = false,
            canRenderBlurredBackdrop = false,
        )

        assertThat(mount).isEqualTo(
            FullscreenImageMount(fullUrl = "full", backdropUrl = null, isResident = false),
        )
    }

    @Test
    fun `a host that cannot blur still mounts the full-resolution image — only the backdrop is dropped`() {
        val mount = resolve(
            fullUrl = "full",
            thumbnailUrl = "thumb",
            isFullResident = false,
            canRenderBlurredBackdrop = false,
        )

        assertThat(mount?.fullUrl).isEqualTo("full")
    }

    @Test
    fun `blur capability never resurrects a backdrop for a resident image`() {
        val mount = resolve(
            fullUrl = "full",
            thumbnailUrl = "thumb",
            isFullResident = true,
            canRenderBlurredBackdrop = true,
        )

        assertThat(mount?.backdropUrl).isNull()
    }
}
