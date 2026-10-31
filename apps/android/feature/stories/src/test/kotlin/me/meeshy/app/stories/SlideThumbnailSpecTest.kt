package me.meeshy.app.stories

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.StoryBackgroundValue
import org.junit.Test

class SlideThumbnailSpecTest {
    private fun spec(slide: StorySlide, backgroundKey: String? = null) =
        SlideThumbnailSpec.of(slide, backgroundKey = backgroundKey, accentHex = "#6366F1", widthPx = 74, heightPx = 132)

    @Test
    fun `a slide with nothing on it is blank`() {
        assertThat(spec(StorySlide(id = "a")).isBlank).isTrue()
    }

    @Test
    fun `a media, a colour, a text, a sticker or a stroke each make the scene non blank`() {
        assertThat(spec(StorySlide(id = "a"), backgroundKey = "https://x/y.jpg").isBlank).isFalse()
        assertThat(spec(StorySlide(id = "a", background = StoryBackgroundValue.Hex("#FF0000"))).isBlank).isFalse()
        assertThat(spec(StorySlide(id = "a", elements = listOf(StoryTextElement(id = "t", text = "Hi")))).isBlank).isFalse()
        assertThat(spec(StorySlide(id = "a", stickers = listOf(StoryStickerElement(id = "s", emoji = "🔥")))).isBlank).isFalse()
    }

    @Test
    fun `an empty text shell the tap leaves behind does not make the scene non blank`() {
        assertThat(spec(StorySlide(id = "a", elements = listOf(StoryTextElement(id = "t", text = "  ")))).isBlank).isTrue()
    }

    @Test
    fun `two renders of the same scene share a fingerprint, so the second is a cache hit`() {
        val slide = StorySlide(id = "a", elements = listOf(StoryTextElement(id = "t", text = "Hi")))
        assertThat(spec(slide)).isEqualTo(spec(slide.copy()))
    }

    @Test
    fun `moving a text changes the fingerprint, so the tile repaints`() {
        val slide = StorySlide(id = "a", elements = listOf(StoryTextElement(id = "t", text = "Hi")))
        val moved = slide.copy(elements = listOf(slide.elements.first().copy(x = 0.2f)))
        assertThat(spec(moved)).isNotEqualTo(spec(slide))
    }

    @Test
    fun `a media replaced by another changes the fingerprint through its key`() {
        val slide = StorySlide(id = "a")
        assertThat(spec(slide, "a.jpg")).isNotEqualTo(spec(slide, "b.jpg"))
    }

    @Test
    fun `the first image paints at once, an edit under the finger waits for the scene to settle`() {
        assertThat(SlideThumbnailRefresh.waits(isShowingImage = false, isCached = false, isBlank = false)).isFalse()
        assertThat(SlideThumbnailRefresh.waits(isShowingImage = true, isCached = true, isBlank = false)).isFalse()
        assertThat(SlideThumbnailRefresh.waits(isShowingImage = true, isCached = false, isBlank = true)).isFalse()
        assertThat(SlideThumbnailRefresh.waits(isShowingImage = true, isCached = false, isBlank = false)).isTrue()
    }

    @Test
    fun `the store is bounded in bytes and evicts the least recently used tile`() {
        val store = SlideThumbnailStore<String, Int>(maxBytes = 100, sizeOf = { it })
        store.put("a", 40); store.put("b", 40); store.get("a"); store.put("c", 40)
        assertThat(store.get("b")).isNull()
        assertThat(store.get("a")).isEqualTo(40)
        assertThat(store.get("c")).isEqualTo(40)
    }
}
