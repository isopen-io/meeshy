package me.meeshy.app.stories

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.FeedMedia
import me.meeshy.sdk.model.FeedMediaType
import me.meeshy.sdk.model.StoryEffects
import me.meeshy.sdk.model.StoryItem
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.JUnit4

/**
 * Behavioural spec for the pure blur-placeholder resolver — the ThumbHash the
 * story viewer decodes into an instant blur behind a background image while it
 * loads (no black flash on cold load), mirroring iOS `StorySlideRenderer`'s use
 * of `StorySlide.effects.thumbHash`. The resolver only PICKS the hash string;
 * decoding (`ThumbHash.decodeBase64`) and painting are the viewer's Compose glue.
 * No Android, no Compose, no I/O.
 */
@RunWith(JUnit4::class)
class StorySlidePlaceholderTest {

    private fun image(url: String? = "https://cdn/img.jpg", thumbHash: String? = "HASH") =
        FeedMedia(id = "m", type = FeedMediaType.IMAGE, url = url, thumbHash = thumbHash)

    private fun video(thumbHash: String? = "VHASH") =
        FeedMedia(id = "v", type = FeedMediaType.VIDEO, url = "https://cdn/clip.mp4", thumbHash = thumbHash)

    // --- granular cascade: effects (slide-level) beats background (flat media) ---

    @Test
    fun `slide-level effects hash wins over the background image hash`() {
        val result = StorySlidePlaceholder.resolve(
            effectsThumbHash = "SLIDE",
            backgroundImageThumbHash = "BG",
        )
        assertThat(result).isEqualTo("SLIDE")
    }

    @Test
    fun `a null effects hash falls back to the background image hash`() {
        val result = StorySlidePlaceholder.resolve(
            effectsThumbHash = null,
            backgroundImageThumbHash = "BG",
        )
        assertThat(result).isEqualTo("BG")
    }

    @Test
    fun `a blank effects hash falls through to the background image hash`() {
        val result = StorySlidePlaceholder.resolve(
            effectsThumbHash = "   ",
            backgroundImageThumbHash = "BG",
        )
        assertThat(result).isEqualTo("BG")
    }

    @Test
    fun `both hashes absent resolves to no placeholder`() {
        val result = StorySlidePlaceholder.resolve(
            effectsThumbHash = null,
            backgroundImageThumbHash = null,
        )
        assertThat(result).isNull()
    }

    @Test
    fun `both hashes blank resolves to no placeholder`() {
        val result = StorySlidePlaceholder.resolve(
            effectsThumbHash = "",
            backgroundImageThumbHash = "  ",
        )
        assertThat(result).isNull()
    }

    @Test
    fun `a surrounding-whitespace hash is trimmed before use`() {
        val result = StorySlidePlaceholder.resolve(
            effectsThumbHash = "  SLIDE  ",
            backgroundImageThumbHash = null,
        )
        assertThat(result).isEqualTo("SLIDE")
    }

    // --- item overload: reads storyEffects then the flat background image ---

    @Test
    fun `an item with a slide-level effects hash resolves to it`() {
        val item = StoryItem(id = "s", storyEffects = StoryEffects(thumbHash = "SLIDE"))
        assertThat(StorySlidePlaceholder.resolve(item)).isEqualTo("SLIDE")
    }

    @Test
    fun `an item with no effects hash falls back to the flat image media hash`() {
        val item = StoryItem(id = "s", media = listOf(image(thumbHash = "BG")))
        assertThat(StorySlidePlaceholder.resolve(item)).isEqualTo("BG")
    }

    @Test
    fun `a video background is skipped in favour of the flat image media hash`() {
        val item = StoryItem(id = "s", media = listOf(video(), image(thumbHash = "IMG")))
        assertThat(StorySlidePlaceholder.resolve(item)).isEqualTo("IMG")
    }

    @Test
    fun `a flat image media without a url is not chosen as the placeholder source`() {
        val item = StoryItem(id = "s", media = listOf(image(url = null, thumbHash = "ORPHAN")))
        assertThat(StorySlidePlaceholder.resolve(item)).isNull()
    }

    @Test
    fun `a flat image media with a blank hash resolves to no placeholder`() {
        val item = StoryItem(id = "s", media = listOf(image(thumbHash = " ")))
        assertThat(StorySlidePlaceholder.resolve(item)).isNull()
    }

    @Test
    fun `an item with neither effects nor media resolves to no placeholder`() {
        val item = StoryItem(id = "s")
        assertThat(StorySlidePlaceholder.resolve(item)).isNull()
    }

    @Test
    fun `an item with a null storyEffects still reads the flat image media hash`() {
        val item = StoryItem(id = "s", storyEffects = null, media = listOf(image(thumbHash = "BG")))
        assertThat(StorySlidePlaceholder.resolve(item)).isEqualTo("BG")
    }
}
