package me.meeshy.sdk.model.story

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.FeedMedia
import me.meeshy.sdk.model.StoryEffects
import me.meeshy.sdk.model.StoryItem
import org.junit.Test

class StoryReaderFloorTest {
    @Test
    fun `sans media le fond est celui de l'auteur, avec un media il est noir`() {
        assertThat(StoryReaderFloor.backdrop(false, "gradient:FF0000:0000FF")).isEqualTo(StoryReaderBackdrop.Author("gradient:FF0000:0000FF"))
        assertThat(StoryReaderFloor.backdrop(false, " ")).isEqualTo(StoryReaderBackdrop.Author(null))
        assertThat(StoryReaderFloor.backdrop(true, "FF0000")).isEqualTo(StoryReaderBackdrop.Black)
    }

    @Test
    fun `le voile suit la carte et le flou exige l'API 31`() {
        assertThat(StoryReaderFloor.veil(expanded = false)).isEqualTo(0.18f)
        assertThat(StoryReaderFloor.veil(expanded = true)).isEqualTo(0f)
        assertThat(StoryReaderFloor.supportsBlur(30)).isFalse()
        assertThat(StoryReaderFloor.supportsBlur(31)).isTrue()
    }

    @Test
    fun `l'empreinte est celle de la slide puis du premier media qui en porte une`() {
        val media = listOf(FeedMedia(id = "a", thumbHash = ""), FeedMedia(id = "b", thumbHash = "HASH"))
        assertThat(StoryReaderFloor.backdropHash(StoryItem(id = "s", media = media))).isEqualTo("HASH")
        assertThat(StoryReaderFloor.backdropHash(StoryItem(id = "s", media = media, storyEffects = StoryEffects(thumbHash = "SLIDE")))).isEqualTo("SLIDE")
        assertThat(StoryReaderFloor.backdropHash(StoryItem(id = "s"))).isNull()
    }
}
