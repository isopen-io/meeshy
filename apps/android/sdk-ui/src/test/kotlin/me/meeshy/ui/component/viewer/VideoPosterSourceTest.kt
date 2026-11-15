package me.meeshy.ui.component.viewer

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * Poster plein écran d'une vidéo — port Kotlin du patron iOS
 * `VideoPosterResolver`/`VideoPosterPlan` / web `resolveFullscreenVideoPoster`
 * (#3871 → #3878). La vignette ne sert JAMAIS de poster net : c'est un fond
 * flou assumé tant que la première image RÉELLE de la vidéo n'est pas
 * extraite ([VideoFirstFrameExtractor], `MediaMetadataRetriever`) ou pas
 * encore résidente.
 */
class VideoPosterSourceTest {

    @Test
    fun `an extracted sharp frame wins — the thumbnail is never shown alongside it`() {
        val mount = VideoPosterSource.resolve(
            extractedFrameUrl = "sharp-frame",
            thumbnailUrl = "thumb",
            isExtractedResident = false,
        )

        assertThat(mount).isEqualTo(
            FullscreenVideoPosterMount(posterUrl = "sharp-frame", backdropUrl = null, isResident = false),
        )
    }

    @Test
    fun `propagates residency of the extracted frame — resident extraction needs no re-fetch`() {
        val mount = VideoPosterSource.resolve(
            extractedFrameUrl = "sharp-frame",
            thumbnailUrl = null,
            isExtractedResident = true,
        )

        assertThat(mount.isResident).isTrue()
    }

    @Test
    fun `no extracted frame yet — the thumbnail becomes the blurred backdrop only, never the poster`() {
        val mount = VideoPosterSource.resolve(
            extractedFrameUrl = null,
            thumbnailUrl = "thumb",
            isExtractedResident = false,
        )

        assertThat(mount).isEqualTo(
            FullscreenVideoPosterMount(posterUrl = null, backdropUrl = "thumb", isResident = false),
        )
    }

    @Test
    fun `neither an extracted frame nor a thumbnail — nothing to show`() {
        val mount = VideoPosterSource.resolve(
            extractedFrameUrl = null,
            thumbnailUrl = null,
            isExtractedResident = false,
        )

        assertThat(mount).isEqualTo(
            FullscreenVideoPosterMount(posterUrl = null, backdropUrl = null, isResident = false),
        )
    }

    @Test
    fun `an empty extracted frame url is treated as absent, falling back to the thumbnail backdrop`() {
        val mount = VideoPosterSource.resolve(
            extractedFrameUrl = "",
            thumbnailUrl = "thumb",
            isExtractedResident = false,
        )

        assertThat(mount.posterUrl).isNull()
        assertThat(mount.backdropUrl).isEqualTo("thumb")
    }
}
