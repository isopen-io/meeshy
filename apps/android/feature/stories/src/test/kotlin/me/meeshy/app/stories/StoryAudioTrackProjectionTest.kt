package me.meeshy.app.stories

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.FeedMedia
import me.meeshy.sdk.model.FeedMediaType
import me.meeshy.sdk.model.StoryAudioPlayerObject
import me.meeshy.sdk.model.StoryEffects
import me.meeshy.sdk.model.StoryItem
import org.junit.Test

class StoryAudioTrackProjectionTest {
    private fun project(item: StoryItem) = StorySlideProjector(null).project(item, "6366F1", NoContentPreferences)

    private val audio = FeedMedia(id = "m1", type = FeedMediaType.AUDIO, url = "https://cdn.meeshy.me/m1")

    @Test
    fun `la piste de premier plan porte son id pour que sa pastille la coupe`() {
        val slide = project(
            StoryItem(
                id = "s",
                media = listOf(audio),
                storyEffects = StoryEffects(audioPlayerObjects = listOf(StoryAudioPlayerObject("track", postMediaId = "m1"))),
            ),
        )
        assertThat(slide.foregroundAudioId).isEqualTo("track")
        assertThat(slide.unresolvedAudioIds).isEmpty()
    }

    @Test
    fun `un audio sans url est signale pour etre journalise`() {
        val slide = project(
            StoryItem(
                id = "s",
                storyEffects = StoryEffects(audioPlayerObjects = listOf(StoryAudioPlayerObject("orphan", postMediaId = "absent"))),
            ),
        )
        assertThat(slide.foregroundAudioUrl).isNull()
        assertThat(slide.unresolvedAudioIds).containsExactly("orphan")
    }
}
