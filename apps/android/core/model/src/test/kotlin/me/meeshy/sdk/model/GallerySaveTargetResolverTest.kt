package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * Behavioural coverage of [GallerySaveTargetResolver] — the pure derivation that
 * turns a media URL (+ optional MIME hint) into the [GallerySaveTarget] a
 * MediaStore insert needs: a sanitized display name (with a real extension), the
 * resolved MIME, and the album relative path. Android counterpart of iOS's pure
 * `MediaSaveDestination` (feature-parity §C "save to gallery"): the platform
 * constraint — the gallery only holds images and videos, images land under
 * `Pictures/Meeshy`, videos under `Movies/Meeshy` — is encoded here, off any
 * Android runtime, so the branch table is fully JVM-testable.
 */
class GallerySaveTargetResolverTest {

    private fun resolve(url: String, mimeHint: String? = null) =
        GallerySaveTargetResolver.resolve(url = url, mimeHint = mimeHint)

    // --- happy path: URL carries a known image extension -----------------------

    @Test
    fun keepsAKnownJpegNameAndPutsItInThePicturesAlbum() {
        val target = resolve("https://cdn.meeshy.me/media/photo.jpg")

        assertThat(target).isEqualTo(
            GallerySaveTarget(
                displayName = "photo.jpg",
                mimeType = "image/jpeg",
                relativePath = "Pictures/Meeshy",
            ),
        )
    }

    @Test
    fun mapsEachKnownImageExtensionToItsMime() {
        assertThat(resolve("https://x/a.jpeg").mimeType).isEqualTo("image/jpeg")
        assertThat(resolve("https://x/a.png").mimeType).isEqualTo("image/png")
        assertThat(resolve("https://x/a.gif").mimeType).isEqualTo("image/gif")
        assertThat(resolve("https://x/a.webp").mimeType).isEqualTo("image/webp")
        assertThat(resolve("https://x/a.heic").mimeType).isEqualTo("image/heic")
    }

    @Test
    fun mapsAVideoExtensionToTheMoviesAlbum() {
        val target = resolve("https://cdn.meeshy.me/media/clip.mp4")

        assertThat(target).isEqualTo(
            GallerySaveTarget(
                displayName = "clip.mp4",
                mimeType = "video/mp4",
                relativePath = "Movies/Meeshy",
            ),
        )
    }

    @Test
    fun mapsAQuicktimeExtensionToTheMoviesAlbum() {
        val target = resolve("https://x/clip.mov")

        assertThat(target.mimeType).isEqualTo("video/quicktime")
        assertThat(target.relativePath).isEqualTo("Movies/Meeshy")
    }

    // --- URL cleaning: strip query + fragment ---------------------------------

    @Test
    fun stripsAQueryStringBeforeReadingTheName() {
        val target = resolve("https://cdn/pic.png?width=100&sig=abcdef")

        assertThat(target.displayName).isEqualTo("pic.png")
        assertThat(target.mimeType).isEqualTo("image/png")
    }

    @Test
    fun stripsAFragmentBeforeReadingTheName() {
        val target = resolve("https://cdn/pic.gif#preview")

        assertThat(target.displayName).isEqualTo("pic.gif")
        assertThat(target.mimeType).isEqualTo("image/gif")
    }

    @Test
    fun stripsBothQueryAndFragment() {
        val target = resolve("https://cdn/pic.webp?token=xyz#frag")

        assertThat(target.displayName).isEqualTo("pic.webp")
        assertThat(target.mimeType).isEqualTo("image/webp")
    }

    // --- extension is case-insensitive, the visible name keeps its case --------

    @Test
    fun resolvesTheMimeFromAnUppercaseExtensionButKeepsTheNameCasing() {
        val target = resolve("https://cdn/HOLIDAY.PNG")

        assertThat(target.mimeType).isEqualTo("image/png")
        assertThat(target.displayName).isEqualTo("HOLIDAY.PNG")
    }

    // --- no extension in the URL: append the MIME's canonical extension --------

    @Test
    fun appendsTheCanonicalExtensionWhenTheUrlNameHasNone() {
        val target = resolve("https://cdn/media/blob", mimeHint = "image/png")

        assertThat(target.displayName).isEqualTo("blob.png")
        assertThat(target.mimeType).isEqualTo("image/png")
    }

    @Test
    fun defaultsToJpegWhenThereIsNeitherExtensionNorHint() {
        val target = resolve("https://cdn/media/blob")

        assertThat(target).isEqualTo(
            GallerySaveTarget(
                displayName = "blob.jpg",
                mimeType = "image/jpeg",
                relativePath = "Pictures/Meeshy",
            ),
        )
    }

    @Test
    fun appendsTheVideoExtensionAndUsesTheMoviesAlbumForAVideoHint() {
        val target = resolve("https://cdn/media/clip", mimeHint = "video/mp4")

        assertThat(target).isEqualTo(
            GallerySaveTarget(
                displayName = "clip.mp4",
                mimeType = "video/mp4",
                relativePath = "Movies/Meeshy",
            ),
        )
    }

    // --- MIME hint precedence + normalisation ---------------------------------

    @Test
    fun aKnownHintWinsOverTheUrlExtension() {
        val target = resolve("https://cdn/frame.jpg", mimeHint = "image/webp")

        assertThat(target.mimeType).isEqualTo("image/webp")
    }

    @Test
    fun normalisesAParameterisedHint() {
        val target = resolve("https://cdn/blob", mimeHint = "IMAGE/JPEG; charset=binary")

        assertThat(target.mimeType).isEqualTo("image/jpeg")
        assertThat(target.displayName).isEqualTo("blob.jpg")
    }

    @Test
    fun ignoresABlankHintAndFallsBackToTheExtension() {
        val target = resolve("https://cdn/pic.webp", mimeHint = "   ")

        assertThat(target.mimeType).isEqualTo("image/webp")
    }

    @Test
    fun ignoresAnUnknownHintFamilyAndFallsBackToTheExtension() {
        val target = resolve("https://cdn/pic.png", mimeHint = "application/octet-stream")

        assertThat(target.mimeType).isEqualTo("image/png")
    }

    @Test
    fun ignoresAnUnknownImageSubtypeHintAndFallsBackToTheExtension() {
        val target = resolve("https://cdn/pic.gif", mimeHint = "image/x-fancy")

        assertThat(target.mimeType).isEqualTo("image/gif")
    }

    // --- unknown extension: keep the name, default the MIME --------------------

    @Test
    fun keepsAnUnknownExtensionNameButDefaultsTheMime() {
        val target = resolve("https://cdn/archive.xyz")

        assertThat(target.displayName).isEqualTo("archive.xyz")
        assertThat(target.mimeType).isEqualTo("image/jpeg")
    }

    // --- sanitisation of the display name -------------------------------------

    @Test
    fun sanitisesIllegalFilenameCharacters() {
        val target = resolve("https://cdn/a:b*c.png")

        assertThat(target.displayName).isEqualTo("a_b_c.png")
        assertThat(target.mimeType).isEqualTo("image/png")
    }

    // --- degenerate URLs fall back to a stable default name --------------------

    @Test
    fun usesADefaultNameForATrailingSlashUrl() {
        val target = resolve("https://cdn/album/")

        assertThat(target.displayName).isEqualTo("meeshy-image.jpg")
    }

    @Test
    fun usesADefaultNameForABlankUrl() {
        val target = resolve("")

        assertThat(target).isEqualTo(
            GallerySaveTarget(
                displayName = "meeshy-image.jpg",
                mimeType = "image/jpeg",
                relativePath = "Pictures/Meeshy",
            ),
        )
    }

    @Test
    fun usesADefaultNameWhenEveryCharacterIsIllegal() {
        val target = resolve("https://cdn/<*:|>")

        assertThat(target.displayName).isEqualTo("meeshy-image.jpg")
    }

    @Test
    fun usesTheDefaultVideoNameForABareVideoHint() {
        val target = resolve("https://cdn/album/", mimeHint = "video/mp4")

        assertThat(target.displayName).isEqualTo("meeshy-image.mp4")
        assertThat(target.relativePath).isEqualTo("Movies/Meeshy")
    }

    // --- a name with several dots keeps the last segment as the extension ------

    @Test
    fun treatsTheLastDotSegmentAsTheExtension() {
        val target = resolve("https://cdn/my.holiday.photo.png")

        assertThat(target.displayName).isEqualTo("my.holiday.photo.png")
        assertThat(target.mimeType).isEqualTo("image/png")
    }
}
