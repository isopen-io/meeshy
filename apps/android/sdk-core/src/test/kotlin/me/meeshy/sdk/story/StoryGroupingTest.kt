package me.meeshy.sdk.story

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.ApiAuthor
import me.meeshy.sdk.model.ApiMediaCaptionTranslationEntry
import me.meeshy.sdk.model.ApiPost
import me.meeshy.sdk.model.ApiPostMedia
import me.meeshy.sdk.model.ApiRepostOf
import org.junit.Test
import java.time.Instant

/**
 * Faithful port of `StoryModelsTests` grouping/ordering/expiry coverage
 * (`Array<APIPost>.toStoryGroups`, `StoryGroup.hasUnviewed/latestStory`,
 * `StoryItem.isExpired`). Pure logic — `now` is injected.
 */
class StoryGroupingTest {

    private val now = Instant.parse("2026-06-17T12:00:00Z").toEpochMilli()

    private fun storyPost(
        id: String,
        authorId: String,
        authorName: String = authorId,
        createdAt: String,
        viewed: Boolean = false,
        expiresAt: String? = null,
        type: String = "STORY",
    ) = ApiPost(
        id = id,
        type = type,
        content = "hello",
        createdAt = createdAt,
        expiresAt = expiresAt,
        author = ApiAuthor(id = authorId, username = authorName),
        isViewedByMe = viewed,
    )

    private fun isoAgo(hours: Long): String =
        Instant.ofEpochMilli(now - hours * 60 * 60 * 1000).toString()

    @Test
    fun `non-story posts are filtered out`() {
        val posts = listOf(
            storyPost("p1", "u1", createdAt = isoAgo(1)),
            storyPost("p2", "u2", createdAt = isoAgo(1), type = "POST"),
            storyPost("p3", "u3", createdAt = isoAgo(1), type = "STATUS"),
        )
        val groups = posts.toStoryGroups(nowMillis = now)
        assertThat(groups.map { it.id }).containsExactly("u1")
    }

    @Test
    fun `posts group by author and sort stories oldest-first`() {
        val posts = listOf(
            storyPost("b", "u1", createdAt = isoAgo(1)),
            storyPost("a", "u1", createdAt = isoAgo(3)),
            storyPost("c", "u1", createdAt = isoAgo(2)),
        )
        val groups = posts.toStoryGroups(nowMillis = now)
        assertThat(groups).hasSize(1)
        assertThat(groups[0].stories.map { it.id }).containsExactly("a", "c", "b").inOrder()
        assertThat(groups[0].latestStory()?.id).isEqualTo("b")
    }

    @Test
    fun `current user group is pinned first`() {
        val posts = listOf(
            storyPost("p1", "other", createdAt = isoAgo(1)),
            storyPost("p2", "me", createdAt = isoAgo(5), viewed = true),
        )
        val groups = posts.toStoryGroups(currentUserId = "me", nowMillis = now)
        assertThat(groups.first().id).isEqualTo("me")
    }

    @Test
    fun `unviewed groups sort before fully-viewed groups`() {
        val posts = listOf(
            storyPost("p1", "seen", createdAt = isoAgo(1), viewed = true),
            storyPost("p2", "fresh", createdAt = isoAgo(5), viewed = false),
        )
        val groups = posts.toStoryGroups(nowMillis = now)
        assertThat(groups.map { it.id }).containsExactly("fresh", "seen").inOrder()
    }

    @Test
    fun `groups with equal viewed-state sort by latest story descending`() {
        val posts = listOf(
            storyPost("p1", "old", createdAt = isoAgo(10)),
            storyPost("p2", "new", createdAt = isoAgo(2)),
        )
        val groups = posts.toStoryGroups(nowMillis = now)
        assertThat(groups.map { it.id }).containsExactly("new", "old").inOrder()
    }

    @Test
    fun `hasUnviewed is true when any story is unseen`() {
        val groups = listOf(
            storyPost("p1", "u1", createdAt = isoAgo(1), viewed = true),
            storyPost("p2", "u1", createdAt = isoAgo(2), viewed = false),
        ).toStoryGroups(nowMillis = now)
        assertThat(groups[0].hasUnviewed()).isTrue()
    }

    @Test
    fun `a repost projects the source author's username as the attribution handle`() {
        val post = storyPost("p1", "u1", createdAt = isoAgo(1)).copy(
            repostOf = ApiRepostOf(
                id = "src-story",
                author = ApiAuthor(id = "orig", username = "alice", displayName = "Alice W."),
            ),
        )
        val item = post.toStoryItem()
        assertThat(item.repostOfId).isEqualTo("src-story")
        assertThat(item.repostAuthorUsername).isEqualTo("alice")
        assertThat(item.repostAuthorName).isEqualTo("Alice W.")
    }

    @Test
    fun `toStoryItem carries a media's caption and its captionTranslations, flattened (#6280)`() {
        val post = storyPost("p1", "u1", createdAt = isoAgo(1)).copy(
            media = listOf(
                ApiPostMedia(
                    id = "m1",
                    mimeType = "image/jpeg",
                    caption = "Bonjour",
                    captionLanguage = "fr",
                    captionTranslations = mapOf(
                        "en" to ApiMediaCaptionTranslationEntry(text = "Hello"),
                        "es" to ApiMediaCaptionTranslationEntry(text = "   "), // blank, must be dropped
                    ),
                ),
            ),
        )
        val media = post.toStoryItem().media.single()
        assertThat(media.caption).isEqualTo("Bonjour")
        assertThat(media.captionLanguage).isEqualTo("fr")
        assertThat(media.captionTranslations).isEqualTo(mapOf("en" to "Hello"))
    }

    @Test
    fun `toStoryItem carries a media's alt text verbatim (#6739)`() {
        val post = storyPost("p1", "u1", createdAt = isoAgo(1)).copy(
            media = listOf(ApiPostMedia(id = "m1", mimeType = "image/jpeg", alt = "A red bicycle")),
        )
        val media = post.toStoryItem().media.single()
        assertThat(media.alt).isEqualTo("A red bicycle")
    }

    @Test
    fun `toStoryItem projects null captionTranslations when the media has none`() {
        val post = storyPost("p1", "u1", createdAt = isoAgo(1)).copy(
            media = listOf(ApiPostMedia(id = "m1", mimeType = "image/jpeg", caption = "Bonjour")),
        )
        val media = post.toStoryItem().media.single()
        assertThat(media.caption).isEqualTo("Bonjour")
        assertThat(media.captionTranslations).isNull()
    }

    @Test
    fun `a non-repost projects null repost attribution fields`() {
        val item = storyPost("p1", "u1", createdAt = isoAgo(1)).toStoryItem()
        assertThat(item.repostOfId).isNull()
        assertThat(item.repostAuthorUsername).isNull()
        assertThat(item.repostAuthorName).isNull()
    }

    @Test
    fun `a repost whose source author has a blank username projects a null username`() {
        val post = storyPost("p1", "u1", createdAt = isoAgo(1)).copy(
            repostOf = ApiRepostOf(
                id = "src-story",
                author = ApiAuthor(id = "orig", username = "   ", displayName = "Alice W."),
            ),
        )
        val item = post.toStoryItem()
        assertThat(item.repostAuthorUsername).isNull()
        assertThat(item.repostAuthorName).isEqualTo("Alice W.")
    }

    @Test
    fun `story with explicit past expiry is expired`() {
        val item = listOf(
            storyPost("p1", "u1", createdAt = isoAgo(2), expiresAt = isoAgo(1)),
        ).toStoryGroups(nowMillis = now)[0].stories[0]
        assertThat(item.isExpired(now)).isTrue()
    }

    @Test
    fun `story without explicit expiry uses 20h window so a 1h-old story is live`() {
        val groups = listOf(
            storyPost("p1", "u1", createdAt = isoAgo(1)),
        ).toStoryGroups(nowMillis = now)
        assertThat(groups[0].stories[0].isExpired(now)).isFalse()
        assertThat(groups[0].isFullyExpired(now)).isFalse()
    }

    @Test
    fun `a group whose stories are all past the 20h window is fully expired`() {
        val groups = listOf(
            storyPost("p1", "u1", createdAt = isoAgo(30)),
        ).toStoryGroups(nowMillis = now)
        assertThat(groups[0].stories[0].isExpired(now)).isTrue()
        assertThat(groups[0].isFullyExpired(now)).isTrue()
    }

    @Test
    fun `a story 20h30 old without expiry is expired while 19h30 is live`() {
        val old = storyPost("p1", "u1", createdAt = isoAgo(21)).toStoryItem()
        val recent = storyPost("p2", "u1", createdAt = isoAgo(19)).toStoryItem()
        assertThat(old.isExpired(now)).isTrue()
        assertThat(recent.isExpired(now)).isFalse()
    }

    @Test
    fun `purge keeps the author's own expired stories but drops others'`() {
        val groups = listOf(
            storyPost("m1", "me", createdAt = isoAgo(30)),
            storyPost("o1", "other", createdAt = isoAgo(30)),
            storyPost("o2", "other2", createdAt = isoAgo(1)),
        ).toStoryGroups(currentUserId = "me", nowMillis = now)
        val purged = groups.purgingDeadStories(currentUserId = "me", nowMillis = now)
        assertThat(purged.map { it.id }).containsExactly("me", "other2").inOrder()
        assertThat(groups.deadStoryIds(currentUserId = "me", nowMillis = now)).containsExactly("o1")
    }

    @Test
    fun `purge removes an explicitly deleted story even for the author and skips expiry when now is null`() {
        val groups = listOf(
            storyPost("m1", "me", createdAt = isoAgo(30)),
            storyPost("o1", "other", createdAt = isoAgo(30)),
        ).toStoryGroups(currentUserId = "me", nowMillis = now)
        val targeted = groups.purgingDeadStories(currentUserId = "me", deletedIds = setOf("m1"), nowMillis = null)
        assertThat(targeted.map { it.id }).containsExactly("other")
    }

    @Test
    fun `groups sort author first then unviewed then most recent`() {
        val groups = listOf(
            storyPost("a", "viewedNew", createdAt = isoAgo(1), viewed = true),
            storyPost("b", "unviewedOld", createdAt = isoAgo(5)),
            storyPost("c", "unviewedNew", createdAt = isoAgo(2)),
            storyPost("d", "me", createdAt = isoAgo(9), viewed = true),
        ).toStoryGroups(currentUserId = "me", nowMillis = now)
        assertThat(groups.map { it.id }).containsExactly("me", "unviewedNew", "unviewedOld", "viewedNew").inOrder()
    }

    @Test
    fun `the post bridge carries the served fields and reads referenceAccess as served`() {
        val post = storyPost("p", "u1", createdAt = isoAgo(40), expiresAt = isoAgo(20)).copy(
            referenceAccess = me.meeshy.sdk.model.ReferenceAccess.GRANTED,
            visibilityUserIds = listOf("x"),
            viewCount = 7,
            currentUserReactions = listOf("❤️"),
            contentEditedAt = isoAgo(3),
        )
        val item = post.toStoryItem()
        assertThat(item.referenceAccess).isEqualTo(me.meeshy.sdk.model.ReferenceAccess.GRANTED)
        assertThat(item.isExpired(now)).isTrue()
        assertThat(item.visibilityUserIds).containsExactly("x")
        assertThat(item.viewCount).isEqualTo(7)
        assertThat(item.currentUserReactions).containsExactly("❤️")
        assertThat(item.contentEditedAt).isEqualTo(isoAgo(3))
    }

    @Test
    fun `a repost without own content falls back on the source media effects and audio`() {
        val sourceEffects = me.meeshy.sdk.model.StoryEffects(background = "SRC")
        val post = storyPost("p", "u1", createdAt = isoAgo(1)).copy(
            repostOf = ApiRepostOf(
                id = "orig", type = "STORY", storyEffects = sourceEffects, audioUrl = "https://a/s.mp3",
                media = listOf(ApiPostMedia(id = "m-src", mimeType = "video/mp4", fileUrl = "https://v")),
            ),
        )
        val item = post.toStoryItem()
        assertThat(item.media.map { it.id }).containsExactly("m-src")
        assertThat(item.storyEffects).isEqualTo(sourceEffects)
        assertThat(item.audioUrl).isEqualTo("https://a/s.mp3")
    }

    @Test
    fun `a repost with own media merges the source media pool deduplicated by id`() {
        val own = me.meeshy.sdk.model.StoryEffects(background = "OWN")
        val post = storyPost("p", "u1", createdAt = isoAgo(1)).copy(
            storyEffects = own,
            media = listOf(ApiPostMedia(id = "m1", fileUrl = "https://1")),
            repostOf = ApiRepostOf(
                id = "orig", type = "STORY",
                media = listOf(ApiPostMedia(id = "m1"), ApiPostMedia(id = "m2", fileUrl = "https://2")),
            ),
        )
        val item = post.toStoryItem()
        assertThat(item.media.map { it.id }).containsExactly("m1", "m2").inOrder()
        assertThat(item.storyEffects).isEqualTo(own)
    }

    @Test
    fun `the group carries the author presence and ring when served and none otherwise`() {
        val served = storyPost("p", "u1", createdAt = isoAgo(1)).let {
            it.copy(author = it.author!!.copy(isOnline = true, lastActiveAt = isoAgo(0)))
        }
        val group = listOf(served).toStoryGroups(nowMillis = now)[0]
        assertThat(group.authorPresence?.isOnline).isTrue()
        val absent = listOf(storyPost("q", "u2", createdAt = isoAgo(1))).toStoryGroups(nowMillis = now)[0]
        assertThat(absent.authorPresence).isNull()
    }
}
