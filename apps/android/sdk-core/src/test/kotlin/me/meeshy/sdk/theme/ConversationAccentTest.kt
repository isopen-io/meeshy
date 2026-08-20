package me.meeshy.sdk.theme

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.ApiConversationPreferences
import me.meeshy.sdk.model.ApiParticipant
import org.junit.Test

class ConversationAccentTest {

    @Test
    fun `accentHex is deterministic for the same conversation`() {
        val conversation = ApiConversation(id = "c1", title = "Team", type = "group")

        assertThat(conversation.accentHex()).isEqualTo(conversation.accentHex())
    }

    @Test
    fun `accentHex differs between conversation types`() {
        val direct = ApiConversation(id = "c1", title = "Team", type = "direct")
        val group = ApiConversation(id = "c2", title = "Team", type = "group")

        assertThat(direct.accentHex()).isNotEqualTo(group.accentHex())
    }

    @Test
    fun `accentColorPalette exposes the primary that accentHex returns plus a distinct secondary`() {
        val conversation = ApiConversation(id = "c1", title = "Team", type = "group")
        val palette = conversation.accentColorPalette()

        assertThat(palette.primary).isEqualTo(conversation.accentHex())
        assertThat(palette.secondary).isNotEqualTo(palette.primary)
    }

    @Test
    fun `accentColorPalette is deterministic for the same conversation`() {
        val conversation = ApiConversation(id = "c1", title = "Team", type = "group")

        assertThat(conversation.accentColorPalette()).isEqualTo(conversation.accentColorPalette())
    }

    @Test
    fun `displayTitle prefers the title then the custom name`() {
        val titled = ApiConversation(id = "c1", title = "Team")
        val custom = ApiConversation(
            id = "c2",
            title = " ",
            preferences = ApiConversationPreferences(customName = "Mon groupe"),
        )
        val bare = ApiConversation(id = "c3")

        assertThat(titled.displayTitle()).isEqualTo("Team")
        assertThat(custom.displayTitle()).isEqualTo("Mon groupe")
        assertThat(bare.displayTitle()).isEqualTo("Conversation")
    }

    @Test
    fun `displayTitle resolves the other participant for a titleless direct conversation`() {
        val direct = ApiConversation(
            id = "c4",
            type = "direct",
            participants = listOf(
                ApiParticipant(id = "p1", userId = "me", displayName = "Me"),
                ApiParticipant(id = "p2", userId = "other", displayName = "Andre Tabeth"),
            ),
        )

        assertThat(direct.displayTitle(currentUserId = "me")).isEqualTo("Andre Tabeth")
    }

    @Test
    fun `displayTitle falls back to the participant username when no display name`() {
        val direct = ApiConversation(
            id = "c5",
            type = "direct",
            participants = listOf(
                ApiParticipant(id = "p1", userId = "me", displayName = "Me"),
                ApiParticipant(id = "p2", userId = "other", username = "andre"),
            ),
        )

        assertThat(direct.displayTitle(currentUserId = "me")).isEqualTo("andre")
    }

    @Test
    fun `displayTitle stays Conversation for a direct conversation with no other participant`() {
        val direct = ApiConversation(id = "c6", type = "direct")

        assertThat(direct.displayTitle(currentUserId = "me")).isEqualTo("Conversation")
    }

    @Test
    fun `resolvedPreferences reads the server userPreferences row`() {
        val conv = ApiConversation(
            id = "c7",
            userPreferences = listOf(ApiConversationPreferences(isPinned = true, customName = "Sany")),
        )

        assertThat(conv.resolvedPreferences?.isPinned).isTrue()
        assertThat(conv.resolvedPreferences?.customName).isEqualTo("Sany")
    }

    @Test
    fun `resolvedPreferences lets an optimistic override win over the server row`() {
        val conv = ApiConversation(
            id = "c8",
            preferences = ApiConversationPreferences(isPinned = false),
            userPreferences = listOf(ApiConversationPreferences(isPinned = true)),
        )

        assertThat(conv.resolvedPreferences?.isPinned).isFalse()
    }

    @Test
    fun `displayTitle uses the customName from userPreferences`() {
        val conv = ApiConversation(
            id = "c9",
            userPreferences = listOf(ApiConversationPreferences(customName = "Sany")),
        )

        assertThat(conv.displayTitle()).isEqualTo("Sany")
    }

    @Test
    fun `otherParticipantUserId resolves the other participant's id in a direct conversation`() {
        val direct = ApiConversation(
            id = "c10",
            type = "direct",
            participants = listOf(
                ApiParticipant(id = "p1", userId = "me", displayName = "Me"),
                ApiParticipant(id = "p2", userId = "other", displayName = "Andre Tabeth"),
            ),
        )

        assertThat(direct.otherParticipantUserId(currentUserId = "me")).isEqualTo("other")
    }

    @Test
    fun `otherParticipantUserId is null for a group conversation`() {
        val group = ApiConversation(
            id = "c11",
            type = "group",
            participants = listOf(
                ApiParticipant(id = "p1", userId = "me", displayName = "Me"),
                ApiParticipant(id = "p2", userId = "other", displayName = "Andre Tabeth"),
            ),
        )

        assertThat(group.otherParticipantUserId(currentUserId = "me")).isNull()
    }

    @Test
    fun `otherParticipantUserId is null for a direct conversation with no other participant`() {
        val direct = ApiConversation(id = "c12", type = "direct")

        assertThat(direct.otherParticipantUserId(currentUserId = "me")).isNull()
    }

    @Test
    fun `otherParticipantUserId ignores a participant with no userId`() {
        val direct = ApiConversation(
            id = "c13",
            type = "direct",
            participants = listOf(
                ApiParticipant(id = "p1", userId = "me", displayName = "Me"),
                ApiParticipant(id = "p2", userId = null, displayName = "Ghost"),
            ),
        )

        assertThat(direct.otherParticipantUserId(currentUserId = "me")).isNull()
    }
}
