package me.meeshy.app.stories

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.StoryGroup
import me.meeshy.sdk.model.StoryItem
import org.junit.Test
import java.time.Instant

class StoryTrayBuilderTest {

    private val now = Instant.parse("2026-06-17T12:00:00Z").toEpochMilli()

    private fun isoAgo(hours: Long) =
        Instant.ofEpochMilli(now - hours * 60 * 60 * 1000).toString()

    private fun group(
        id: String,
        viewed: Boolean,
        avatarURL: String? = null,
        createdHoursAgo: Long = 1,
        count: Int = 1,
    ) = StoryGroup(
        id = id,
        username = "user-$id",
        avatarColor = "FF6B6B",
        avatarURL = avatarURL,
        stories = (0 until count).map {
            StoryItem(
                id = "$id-$it",
                createdAt = isoAgo(createdHoursAgo),
                expiresAt = isoAgo(createdHoursAgo - 21),
                isViewed = viewed,
            )
        },
    )

    @Test
    fun `splits the current user into self and keeps the rest as others`() {
        val tray = StoryTrayBuilder.build(
            groups = listOf(group("me", viewed = false), group("u2", viewed = false)),
            currentUserId = "me",
            mediaBaseUrl = "https://gate.meeshy.me",
            nowMillis = now,
        )
        assertThat(tray.self?.userId).isEqualTo("me")
        assertThat(tray.self?.isMine).isTrue()
        assertThat(tray.others.map { it.userId }).containsExactly("u2")
    }

    @Test
    fun `self is null when the viewer has no story`() {
        val tray = StoryTrayBuilder.build(
            groups = listOf(group("u1", viewed = false)),
            currentUserId = "me",
            mediaBaseUrl = null,
            nowMillis = now,
        )
        assertThat(tray.self).isNull()
        assertThat(tray.others.single().userId).isEqualTo("u1")
    }

    @Test
    fun `fully expired groups are dropped from the tray`() {
        val expired = StoryGroup(
            id = "old",
            username = "old",
            avatarColor = "FF6B6B",
            stories = listOf(
                StoryItem(id = "old-0", createdAt = isoAgo(40), expiresAt = isoAgo(19), isViewed = false),
            ),
        )
        val tray = StoryTrayBuilder.build(
            groups = listOf(expired, group("u1", viewed = false)),
            currentUserId = null,
            mediaBaseUrl = null,
            nowMillis = now,
        )
        assertThat(tray.others.map { it.userId }).containsExactly("u1")
        assertThat(tray.isEmpty).isFalse()
    }

    @Test
    fun `relative avatar urls resolve against the media base url`() {
        val tray = StoryTrayBuilder.build(
            groups = listOf(group("u1", viewed = false, avatarURL = "/uploads/a.jpg")),
            currentUserId = null,
            mediaBaseUrl = "https://gate.meeshy.me/",
            nowMillis = now,
        )
        assertThat(tray.others.single().avatarUrl).isEqualTo("https://gate.meeshy.me/uploads/a.jpg")
    }

    @Test
    fun `absolute avatar urls are left untouched`() {
        val tray = StoryTrayBuilder.build(
            groups = listOf(group("u1", viewed = false, avatarURL = "https://cdn.me/a.jpg")),
            currentUserId = null,
            mediaBaseUrl = "https://gate.meeshy.me",
            nowMillis = now,
        )
        assertThat(tray.others.single().avatarUrl).isEqualTo("https://cdn.me/a.jpg")
    }

    @Test
    fun `ring carries unviewed state and story count`() {
        val tray = StoryTrayBuilder.build(
            groups = listOf(group("u1", viewed = false, count = 3)),
            currentUserId = null,
            mediaBaseUrl = null,
            nowMillis = now,
        )
        val ring = tray.others.single()
        assertThat(ring.hasUnviewed).isTrue()
        assertThat(ring.storyCount).isEqualTo(3)
        assertThat(ring.unviewedCount).isEqualTo(3)
    }

    @Test
    fun `ring counts only the unviewed stories for the count dots`() {
        val mixed = StoryGroup(
            id = "u1",
            username = "user-u1",
            avatarColor = "FF6B6B",
            stories = listOf(
                StoryItem(id = "u1-0", createdAt = isoAgo(3), expiresAt = isoAgo(-18), isViewed = true),
                StoryItem(id = "u1-1", createdAt = isoAgo(2), expiresAt = isoAgo(-19), isViewed = false),
                StoryItem(id = "u1-2", createdAt = isoAgo(1), expiresAt = isoAgo(-20), isViewed = false),
            ),
        )
        val tray = StoryTrayBuilder.build(
            groups = listOf(mixed),
            currentUserId = null,
            mediaBaseUrl = null,
            nowMillis = now,
        )
        val ring = tray.others.single()
        assertThat(ring.storyCount).isEqualTo(3)
        assertThat(ring.unviewedCount).isEqualTo(2)
    }
}
