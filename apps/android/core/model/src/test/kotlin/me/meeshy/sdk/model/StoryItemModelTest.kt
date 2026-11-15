package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import org.junit.Test

class StoryItemModelTest {

    private val json = Json {
        ignoreUnknownKeys = true
        isLenient = true
        explicitNulls = false
        coerceInputValues = true
    }

    @Test
    fun `un ancien cache sans les nouveaux champs se decode avec des defauts nuls`() {
        val item = json.decodeFromString<StoryItem>("""{"id":"s1","content":"hi","isViewed":true,"reactionCount":2}""")
        assertThat(item.visibilityUserIds).isNull()
        assertThat(item.viewedAt).isNull()
        assertThat(item.updatedAt).isNull()
        assertThat(item.contentEditedAt).isNull()
        assertThat(item.viewCount).isNull()
        assertThat(item.currentUserReactions).isNull()
        assertThat(item.referenceAccess).isNull()
        assertThat(item.mentions).isNull()
        assertThat(item.trackingLinks).isNull()
        assertThat(item.validMentionUsernames).isNull()
        assertThat(item.trackedLinkMap).isEmpty()
        assertThat(item.reactionCount).isEqualTo(2)
    }

    @Test
    fun `un ancien groupe sans presence ni anneau se decode`() {
        val group = json.decodeFromString<StoryGroup>("""{"id":"g","username":"u","avatarColor":"AA","stories":[]}""")
        assertThat(group.authorPresence).isNull()
        assertThat(group.authorRing).isNull()
    }

    @Test
    fun `une story complete fait l'aller-retour sans perte`() {
        val item = StoryItem(
            id = "s1",
            visibilityUserIds = listOf("u1", "u2"),
            viewedAt = "2026-10-22T10:00:00Z",
            updatedAt = "2026-10-22T11:00:00Z",
            contentEditedAt = "2026-10-22T09:00:00Z",
            shareCount = 1, viewCount = 2, impressionCount = 3, anonymousViewCount = 4, repostCount = 5,
            currentUserReactions = listOf("❤️"),
            referenceAccess = ReferenceAccess.GRANTED,
            mentions = listOf(PostReference(userId = "u9", username = "Alice", display = PostReferenceDisplay.PINNED)),
            trackingLinks = listOf(TrackedLink(url = "https://a.b", token = "tok")),
        )
        val group = StoryGroup(
            id = "g", stories = listOf(item),
            authorPresence = UserPresence(isOnline = true, lastActiveAt = "2026-10-22T11:00:00Z"),
            authorRing = PostServedRing(pack = "p", item = "i"),
        )
        val encoder = Json { encodeDefaults = true; explicitNulls = false }
        val back = json.decodeFromString<StoryGroup>(encoder.encodeToString(group))
        assertThat(back).isEqualTo(group)
    }

    @Test
    fun `referenceAccess est lu tel que servi`() {
        val item = json.decodeFromString<StoryItem>("""{"id":"s","expiresAt":"2020-01-01T00:00:00Z","referenceAccess":"granted"}""")
        assertThat(item.referenceAccess).isEqualTo(ReferenceAccess.GRANTED)
        val unknown = json.decodeFromString<StoryItem>("""{"id":"s","referenceAccess":"surprise"}""")
        assertThat(unknown.referenceAccess).isEqualTo(ReferenceAccess.NONE)
    }

    @Test
    fun `les derives lisent mentions, liens suivis et reactions`() {
        val item = StoryItem(
            id = "s",
            mentions = listOf(PostReference(userId = "1", username = "Bob")),
            trackingLinks = listOf(TrackedLink("https://x.y", "t")),
            currentUserReactions = listOf("🔥"),
        )
        assertThat(item.validMentionUsernames).containsExactly("bob")
        assertThat(item.trackedLinkMap).containsExactly("https://x.y", "t")
        assertThat(item.currentUserHasReacted).isTrue()
        assertThat(StoryItem(id = "s", currentUserReactions = emptyList()).currentUserHasReacted).isFalse()
    }

    @Test
    fun `le TTL par defaut d'une story est de 20 heures`() {
        assertThat(StoryItem.DEFAULT_EXPIRY_MILLIS).isEqualTo(20L * 3_600_000L)
    }
}
