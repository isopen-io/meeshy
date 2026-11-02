package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class MyStoryCardFromStoryTest {

    private val created = "2026-10-27T10:00:00Z"

    @Test fun `la miniature du premier media prime sur son url`() {
        val story = StoryItem(
            id = "s",
            createdAt = created,
            media = listOf(FeedMedia(id = "m", url = "https://x/full.jpg", thumbnailUrl = "https://x/t.jpg")),
        )
        assertThat(MyStoryCardRules.fromStory(story, 3).thumbnailSource)
            .isEqualTo(MyStoryThumbnailSource.RemoteUrl("https://x/t.jpg"))
    }

    @Test fun `sans media le fond de la scene fait la vignette`() {
        val story = StoryItem(id = "s", createdAt = created, storyEffects = StoryEffects(background = "FF8800"))
        assertThat(MyStoryCardRules.fromStory(story, 0).thumbnailSource)
            .isEqualTo(MyStoryThumbnailSource.Background("FF8800"))
    }

    @Test fun `l expiration sans valeur serveur retombe sur vingt heures`() {
        val story = StoryItem(id = "s", createdAt = created)
        val card = MyStoryCardRules.fromStory(story, 0)
        assertThat(card.expiresAtEpochMillis).isEqualTo(card.dateEpochMillis + StoryItem.DEFAULT_EXPIRY_MILLIS)
    }

    @Test fun `les compteurs viennent de la story et des vues passees`() {
        val story = StoryItem(id = "s", createdAt = created, reactionCount = 2, commentCount = 0)
        val card = MyStoryCardRules.fromStory(story, 7)
        assertThat(card.counts).containsExactly(MyStoryGlyph.VIEWS_AND_REACTIONS, 7, MyStoryGlyph.REACTIONS, 2)
    }
}
