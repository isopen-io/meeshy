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
    fun `displayTitle prefers the title then the custom name for a group`() {
        val titled = ApiConversation(id = "c1", type = "group", title = "Team")
        val custom = ApiConversation(
            id = "c2",
            type = "group",
            title = " ",
            preferences = ApiConversationPreferences(customName = "Mon groupe"),
        )
        val bare = ApiConversation(id = "c3", type = "group")

        assertThat(titled.displayTitle()).isEqualTo("Team")
        assertThat(custom.displayTitle()).isEqualTo("Mon groupe")
        assertThat(bare.displayTitle()).isEqualTo("Conversation")
    }

    @Test
    fun `displayTitle never falls back to a stored title for a direct conversation`() {
        // #6790 — a legacy client composed a "X et Y" title at creation time
        // for a DM. It must never surface, even when no participant is known
        // (the shape GET /sync serves: no `participants` on the row).
        val direct = ApiConversation(id = "c11", type = "direct", title = "Alice et Bob")

        assertThat(direct.displayTitle(currentUserId = "me")).isEqualTo("Conversation")
    }

    @Test
    fun `displayTitle prefers the other participant over a stored title for a direct conversation`() {
        val direct = ApiConversation(
            id = "c12",
            type = "direct",
            title = "Alice et Bob",
            participants = listOf(
                ApiParticipant(id = "p1", userId = "me", displayName = "Me"),
                ApiParticipant(id = "p2", userId = "other", displayName = "Bob"),
            ),
        )

        assertThat(direct.displayTitle(currentUserId = "me")).isEqualTo("Bob")
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

    // #11615 — l'élection se fait CONTRE le lecteur ; un lecteur inconnu n'élit personne.

    private fun directWithReaderServedFirst() = ApiConversation(
        id = "c14",
        type = "direct",
        participants = listOf(
            ApiParticipant(id = "p1", userId = "me", displayName = "Moi"),
            ApiParticipant(id = "p2", userId = "other", displayName = "Andre Tabeth"),
        ),
    )

    @Test
    fun `otherParticipantUserId elects nobody for an unknown reader`() {
        val direct = directWithReaderServedFirst()

        assertThat(direct.otherParticipantUserId(currentUserId = null)).isNull()
        assertThat(direct.otherParticipantUserId(currentUserId = "")).isNull()
    }

    @Test
    fun `displayTitle never shows the reader's own name when the reader is unknown`() {
        val direct = directWithReaderServedFirst()

        assertThat(direct.displayTitle(currentUserId = null)).isEqualTo("Conversation")
        assertThat(direct.displayTitle(currentUserId = "")).isEqualTo("Conversation")
    }

    @Test
    fun `otherParticipantUserId skips the reader whichever way the roster is ordered`() {
        val readerLast = directWithReaderServedFirst().let { it.copy(participants = it.participants.reversed()) }

        assertThat(directWithReaderServedFirst().otherParticipantUserId(currentUserId = "me")).isEqualTo("other")
        assertThat(readerLast.otherParticipantUserId(currentUserId = "me")).isEqualTo("other")
    }

    @Test
    fun `otherParticipantUserId picks the first non-reader among several participants`() {
        val three = directWithReaderServedFirst().let {
            it.copy(participants = it.participants + ApiParticipant(id = "p3", userId = "third", displayName = "Zoe"))
        }

        assertThat(three.otherParticipantUserId(currentUserId = "me")).isEqualTo("other")
    }

    @Test
    fun `name and peer id come from the same election`() {
        val direct = directWithReaderServedFirst()

        assertThat(direct.displayTitle(currentUserId = "me")).isEqualTo("Andre Tabeth")
        assertThat(direct.otherParticipantUserId(currentUserId = "me")).isEqualTo("other")
    }

    @Test
    fun `a local rename still wins over the elected peer name`() {
        val renamed = directWithReaderServedFirst()
            .copy(preferences = ApiConversationPreferences(customName = "Mon ami"))

        assertThat(renamed.displayTitle(currentUserId = "me")).isEqualTo("Mon ami")
    }
}
