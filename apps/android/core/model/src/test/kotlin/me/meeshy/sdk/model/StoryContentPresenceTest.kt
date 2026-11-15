package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class StoryContentPresenceTest {

    private fun story(
        content: String? = null,
        media: List<FeedMedia> = emptyList(),
        audioUrl: String? = null,
        repostOfId: String? = null,
        effects: StoryEffects? = null,
    ) = StoryItem(id = "s", content = content, media = media, audioUrl = audioUrl, repostOfId = repostOfId, storyEffects = effects)

    @Test
    fun `a story with nothing at all is not renderable`() {
        assertThat(StoryContentPresence.hasRenderableContent(story())).isFalse()
        assertThat(StoryContentPresence.hasRenderableContent(story(effects = StoryEffects()))).isFalse()
    }

    @Test
    fun `blank strings do not count as content`() {
        val blank = story(content = "   ", audioUrl = " ", repostOfId = "", effects = StoryEffects(background = "  ", textObjects = listOf(StoryTextObject(id = "t", text = "\n"))))
        assertThat(StoryContentPresence.hasRenderableContent(blank)).isFalse()
    }

    @Test
    fun `any carrying field makes the story renderable`() {
        assertThat(StoryContentPresence.hasRenderableContent(story(content = "Salut"))).isTrue()
        assertThat(StoryContentPresence.hasRenderableContent(story(media = listOf(FeedMedia(id = "m"))))).isTrue()
        assertThat(StoryContentPresence.hasRenderableContent(story(audioUrl = "https://a/b.m4a"))).isTrue()
        assertThat(StoryContentPresence.hasRenderableContent(story(repostOfId = "orig"))).isTrue()
        assertThat(StoryContentPresence.hasRenderableContent(story(effects = StoryEffects(background = "#112233")))).isTrue()
        assertThat(StoryContentPresence.hasRenderableContent(story(effects = StoryEffects(textObjects = listOf(StoryTextObject(id = "t", text = "Hi")))))).isTrue()
    }

    @Test
    fun `an audio only story is still a message`() {
        assertThat(StoryContentPresence.hasRenderableContent(story(effects = StoryEffects(backgroundAudioId = "track")))).isTrue()
    }
}
