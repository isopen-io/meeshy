package me.meeshy.app.conversations

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.ApiParticipant
import me.meeshy.sdk.model.StoryGroup
import me.meeshy.sdk.model.StoryItem
import me.meeshy.ui.component.StoryRingState
import org.junit.Test

/**
 * Pure port of iOS `StoryViewModel.storyRingState(forUserId:)` +
 * `ConversationListView.storyRingState(for:)` (SSOT:
 * `apps/ios/Meeshy/Features/Main/ViewModels/StoryViewModel.swift:1351`,
 * `apps/ios/Meeshy/Features/Main/Views/ConversationListView.swift:690`).
 *
 * The per-user rule, first match wins:
 *   1. no group for the user, or the group is fully expired → [StoryRingState.None]
 *   2. the group has at least one unviewed story           → [StoryRingState.Unread]
 *   3. otherwise (all viewed, still active)                → [StoryRingState.Read]
 *
 * The row rule adds the direct-only gate: only a direct conversation with a
 * resolvable other participant can carry a ring; groups/communities never do.
 */
class ConversationStoryRingTest {

    private val now = 1_700_000_000_000L
    private val future = "2099-01-01T00:00:00Z"
    private val past = "2000-01-01T00:00:00Z"

    private fun story(id: String, expiresAt: String, isViewed: Boolean): StoryItem =
        StoryItem(id = id, expiresAt = expiresAt, isViewed = isViewed)

    private fun group(userId: String, vararg stories: StoryItem): StoryGroup =
        StoryGroup(id = userId, stories = stories.toList())

    // ---- per-user rule --------------------------------------------------

    @Test
    fun `null user id yields no ring`() {
        val groups = listOf(group("u1", story("s1", future, isViewed = false)))
        assertThat(ConversationStoryRing.ringFor(userId = null, groups = groups, nowMillis = now))
            .isEqualTo(StoryRingState.None)
    }

    @Test
    fun `no group for the user yields no ring`() {
        val groups = listOf(group("someone-else", story("s1", future, isViewed = false)))
        assertThat(ConversationStoryRing.ringFor(userId = "u1", groups = groups, nowMillis = now))
            .isEqualTo(StoryRingState.None)
    }

    @Test
    fun `empty groups yield no ring`() {
        assertThat(ConversationStoryRing.ringFor(userId = "u1", groups = emptyList(), nowMillis = now))
            .isEqualTo(StoryRingState.None)
    }

    @Test
    fun `a fully expired group yields no ring even with an unviewed story`() {
        val groups = listOf(group("u1", story("s1", past, isViewed = false)))
        assertThat(ConversationStoryRing.ringFor(userId = "u1", groups = groups, nowMillis = now))
            .isEqualTo(StoryRingState.None)
    }

    @Test
    fun `an active group with an unviewed story is unread`() {
        val groups = listOf(
            group("u1", story("s1", future, isViewed = true), story("s2", future, isViewed = false)),
        )
        assertThat(ConversationStoryRing.ringFor(userId = "u1", groups = groups, nowMillis = now))
            .isEqualTo(StoryRingState.Unread)
    }

    @Test
    fun `an active group with every story viewed is read`() {
        val groups = listOf(group("u1", story("s1", future, isViewed = true)))
        assertThat(ConversationStoryRing.ringFor(userId = "u1", groups = groups, nowMillis = now))
            .isEqualTo(StoryRingState.Read)
    }

    @Test
    fun `a group active only because one story survives is read when that story is viewed`() {
        // one expired-viewed + one active-viewed → not fully expired, all viewed → Read.
        val groups = listOf(
            group("u1", story("s1", past, isViewed = true), story("s2", future, isViewed = true)),
        )
        assertThat(ConversationStoryRing.ringFor(userId = "u1", groups = groups, nowMillis = now))
            .isEqualTo(StoryRingState.Read)
    }

    @Test
    fun `the matching user's group is chosen among several`() {
        val groups = listOf(
            group("other-a", story("s1", future, isViewed = false)),
            group("u1", story("s2", future, isViewed = true)),
            group("other-b", story("s3", future, isViewed = false)),
        )
        assertThat(ConversationStoryRing.ringFor(userId = "u1", groups = groups, nowMillis = now))
            .isEqualTo(StoryRingState.Read)
    }

    // ---- row rule (direct-only gate) ------------------------------------

    private fun direct(otherUserId: String?): ApiConversation =
        ApiConversation(
            id = "c1",
            type = "direct",
            participants = listOfNotNull(
                ApiParticipant(id = "p-me", userId = "me", displayName = "Me"),
                otherUserId?.let { ApiParticipant(id = "p-other", userId = it, displayName = "Other") },
            ),
        )

    @Test
    fun `a direct conversation surfaces the other participant's ring`() {
        val groups = listOf(group("other", story("s1", future, isViewed = false)))
        val ring = ConversationStoryRing.ringFor(
            conversation = direct(otherUserId = "other"),
            currentUserId = "me",
            groups = groups,
            nowMillis = now,
        )
        assertThat(ring).isEqualTo(StoryRingState.Unread)
    }

    @Test
    fun `a group conversation never carries a ring`() {
        val groups = listOf(group("other", story("s1", future, isViewed = false)))
        val groupConversation = ApiConversation(
            id = "c2",
            type = "group",
            participants = listOf(
                ApiParticipant(id = "p-me", userId = "me", displayName = "Me"),
                ApiParticipant(id = "p-other", userId = "other", displayName = "Other"),
            ),
        )
        val ring = ConversationStoryRing.ringFor(
            conversation = groupConversation,
            currentUserId = "me",
            groups = groups,
            nowMillis = now,
        )
        assertThat(ring).isEqualTo(StoryRingState.None)
    }

    @Test
    fun `a direct conversation with no resolvable other participant carries no ring`() {
        val groups = listOf(group("other", story("s1", future, isViewed = false)))
        val ring = ConversationStoryRing.ringFor(
            conversation = direct(otherUserId = null),
            currentUserId = "me",
            groups = groups,
            nowMillis = now,
        )
        assertThat(ring).isEqualTo(StoryRingState.None)
    }

    @Test
    fun `a direct conversation whose peer has no active story carries no ring`() {
        val ring = ConversationStoryRing.ringFor(
            conversation = direct(otherUserId = "other"),
            currentUserId = "me",
            groups = emptyList(),
            nowMillis = now,
        )
        assertThat(ring).isEqualTo(StoryRingState.None)
    }
}
