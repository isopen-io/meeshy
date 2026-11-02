package me.meeshy.sdk.story

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.FeedMedia
import me.meeshy.sdk.model.FeedPost
import me.meeshy.sdk.model.RepostContent
import me.meeshy.sdk.model.StoryEffects
import me.meeshy.sdk.model.TrackedLink
import org.junit.Test

class StoryFeedPostBridgeTest {

    private val sourceEffects = StoryEffects(background = "SRC")
    private val source = RepostContent(
        id = "orig", author = "Alice", authorUsername = "alice", type = "STORY",
        audioUrl = "https://a/src.mp3", storyEffects = sourceEffects,
        media = listOf(FeedMedia(id = "m-src")),
    )

    @Test
    fun `un repost sans contenu propre joue la story source`() {
        val item = FeedPost(id = "p", type = "STORY", repost = source, timestamp = "2026-10-22T10:00:00Z").toStoryItem()
        assertThat(item.media.map { it.id }).containsExactly("m-src")
        assertThat(item.storyEffects).isEqualTo(sourceEffects)
        assertThat(item.audioUrl).isEqualTo("https://a/src.mp3")
        assertThat(item.repostOfId).isEqualTo("orig")
        assertThat(item.repostAuthorName).isEqualTo("Alice")
        assertThat(item.repostAuthorUsername).isEqualTo("alice")
        assertThat(item.expiresAt).isNull()
        assertThat(item.createdAt).isEqualTo("2026-10-22T10:00:00Z")
    }

    @Test
    fun `un repost avec ses propres medias garde medias et effets propres, jamais melanges`() {
        val own = StoryEffects(background = "OWN")
        val item = FeedPost(
            id = "p", repost = source, media = listOf(FeedMedia(id = "m-own")), storyEffects = own,
            audioUrl = "https://a/own.mp3",
        ).toStoryItem()
        assertThat(item.media.map { it.id }).containsExactly("m-own")
        assertThat(item.storyEffects).isEqualTo(own)
        assertThat(item.audioUrl).isEqualTo("https://a/own.mp3")
    }

    @Test
    fun `des medias propres sans effets gardent la decision couplee sur le propre contenu`() {
        val item = FeedPost(id = "p", repost = source, media = listOf(FeedMedia(id = "m-own"))).toStoryItem()
        assertThat(item.media.map { it.id }).containsExactly("m-own")
        assertThat(item.storyEffects).isNull()
    }

    @Test
    fun `un repost d'un post qui n'est pas une story ne retombe sur rien`() {
        val item = FeedPost(id = "p", repost = source.copy(type = "POST")).toStoryItem()
        assertThat(item.media).isEmpty()
        assertThat(item.repostOfId).isNull()
        assertThat(item.storyEffects).isNull()
    }

    @Test
    fun `les liens suivis voyagent`() {
        val item = FeedPost(id = "p", trackingLinks = listOf(TrackedLink("https://x", "t"))).toStoryItem()
        assertThat(item.trackingLinks).containsExactly(TrackedLink("https://x", "t"))
    }
}
