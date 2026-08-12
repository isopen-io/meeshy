package me.meeshy.app.widget

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.ApiConversationLastMessage
import me.meeshy.sdk.model.ApiConversationPreferences
import me.meeshy.sdk.model.ApiParticipant
import me.meeshy.sdk.theme.accentHex
import org.junit.Test

/**
 * Pure state derivation for [FavoriteContactsWidget] — mirrors iOS
 * `WidgetDataManager.publishFavoriteContacts` (pinned direct conversations only,
 * capped at 8). The Glance `@Composable` content itself is UI glue (exempt,
 * `TDD-COVERAGE.md`); this is the decision worth covering on the JVM.
 */
class FavoriteContactsWidgetPresentationTest {

    private fun conversation(
        id: String,
        type: String = "direct",
        title: String? = null,
        participants: List<ApiParticipant> = listOf(
            ApiParticipant(id = "p-me", userId = "me", displayName = "Me"),
            ApiParticipant(id = "p-other", userId = "other-$id", displayName = "Contact $id"),
        ),
        isPinned: Boolean = true,
        lastMessage: ApiConversationLastMessage? = ApiConversationLastMessage(
            id = "m-$id",
            createdAt = "2026-08-01T00:00:00.000Z",
        ),
    ) = ApiConversation(
        id = id,
        type = type,
        title = title,
        participants = participants,
        lastMessage = lastMessage,
        preferences = ApiConversationPreferences(isPinned = isPinned),
    )

    @Test
    fun `an empty conversation list resolves to an empty presentation`() {
        val presentation = FavoriteContactsWidgetPresentation.from(
            conversations = emptyList(),
            currentUserId = "me",
        )

        assertThat(presentation.isEmpty).isTrue()
        assertThat(presentation.rows).isEmpty()
    }

    @Test
    fun `a pinned direct conversation resolves the other participant's name`() {
        val presentation = FavoriteContactsWidgetPresentation.from(
            conversations = listOf(conversation(id = "c1")),
            currentUserId = "me",
        )

        assertThat(presentation.rows.single().name).isEqualTo("Contact c1")
    }

    @Test
    fun `an unpinned direct conversation is not a favorite`() {
        val presentation = FavoriteContactsWidgetPresentation.from(
            conversations = listOf(conversation(id = "c1", isPinned = false)),
            currentUserId = "me",
        )

        assertThat(presentation.rows).isEmpty()
    }

    @Test
    fun `a pinned group conversation is not a favorite contact`() {
        val presentation = FavoriteContactsWidgetPresentation.from(
            conversations = listOf(conversation(id = "c1", type = "group", title = "Team", isPinned = true)),
            currentUserId = "me",
        )

        assertThat(presentation.rows).isEmpty()
    }

    @Test
    fun `among favorites, the most recently active sorts first`() {
        val older = conversation(id = "older", lastMessage = ApiConversationLastMessage(createdAt = "2026-01-01T00:00:00.000Z"))
        val newer = conversation(id = "newer", lastMessage = ApiConversationLastMessage(createdAt = "2026-08-01T00:00:00.000Z"))

        val presentation = FavoriteContactsWidgetPresentation.from(
            conversations = listOf(older, newer),
            currentUserId = "me",
        )

        assertThat(presentation.rows.map { it.id }).containsExactly("newer", "older").inOrder()
    }

    @Test
    fun `the presentation caps at 8 rows even with more favorites cached`() {
        val conversations = (1..12).map { conversation(id = "c$it") }

        val presentation = FavoriteContactsWidgetPresentation.from(
            conversations = conversations,
            currentUserId = "me",
        )

        assertThat(presentation.rows).hasSize(8)
    }

    @Test
    fun `a row's accent color matches the conversation's deterministic accent`() {
        val convo = conversation(id = "c1")

        val presentation = FavoriteContactsWidgetPresentation.from(
            conversations = listOf(convo),
            currentUserId = "me",
        )

        assertThat(presentation.rows.single().accentHex).isEqualTo(convo.accentHex())
    }

    @Test
    fun `a mix of favorites and non-favorites keeps only the favorites`() {
        val favorite = conversation(id = "fav", isPinned = true)
        val pinnedGroup = conversation(id = "pinned-group", type = "group", title = "Team", isPinned = true)
        val unpinnedDirect = conversation(id = "unpinned", isPinned = false)

        val presentation = FavoriteContactsWidgetPresentation.from(
            conversations = listOf(favorite, pinnedGroup, unpinnedDirect),
            currentUserId = "me",
        )

        assertThat(presentation.rows.map { it.id }).containsExactly("fav")
    }
}
