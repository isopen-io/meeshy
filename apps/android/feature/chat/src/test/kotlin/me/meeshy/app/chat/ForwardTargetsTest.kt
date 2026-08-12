package me.meeshy.app.chat

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.ApiParticipant
import me.meeshy.sdk.theme.accentHex
import org.junit.Test

class ForwardTargetsTest {

    private fun group(
        id: String,
        title: String? = null,
        avatar: String? = null,
        members: Int = 2,
    ) = ApiConversation(
        id = id,
        type = "group",
        title = title,
        avatar = avatar,
        participants = (1..members).map { ApiParticipant(id = "$id-p$it", userId = "$id-u$it") },
    )

    private fun direct(id: String, vararg participants: ApiParticipant) =
        ApiConversation(id = id, type = "direct", title = null, participants = participants.toList())

    @Test
    fun no_conversations_yields_no_targets() {
        assertThat(ForwardTargets.of(emptyList(), sourceConversationId = "c1", query = "")).isEmpty()
    }

    @Test
    fun the_source_conversation_is_never_a_target() {
        val targets = ForwardTargets.of(listOf(group("c1", "Team")), sourceConversationId = "c1", query = "")
        assertThat(targets).isEmpty()
    }

    @Test
    fun every_conversation_except_the_source_is_a_target_on_a_blank_query() {
        val targets = ForwardTargets.of(
            listOf(group("c1", "Source"), group("c2", "Alpha"), group("c3", "Beta")),
            sourceConversationId = "c1",
            query = "",
        )
        assertThat(targets.map { it.conversationId }).containsExactly("c2", "c3").inOrder()
    }

    @Test
    fun a_whitespace_only_query_is_treated_as_blank() {
        val targets = ForwardTargets.of(
            listOf(group("c2", "Alpha"), group("c3", "Beta")),
            sourceConversationId = "c1",
            query = "   ",
        )
        assertThat(targets.map { it.conversationId }).containsExactly("c2", "c3").inOrder()
    }

    @Test
    fun a_query_matches_the_title_case_insensitively() {
        val targets = ForwardTargets.of(
            listOf(group("c2", "Alpha Squad"), group("c3", "Beta")),
            sourceConversationId = "c1",
            query = "alpha",
        )
        assertThat(targets.map { it.conversationId }).containsExactly("c2")
    }

    @Test
    fun a_query_is_trimmed_before_matching() {
        val targets = ForwardTargets.of(
            listOf(group("c2", "Alpha"), group("c3", "Beta")),
            sourceConversationId = "c1",
            query = "  beta  ",
        )
        assertThat(targets.map { it.conversationId }).containsExactly("c3")
    }

    @Test
    fun a_query_with_no_match_yields_no_targets() {
        val targets = ForwardTargets.of(
            listOf(group("c2", "Alpha"), group("c3", "Beta")),
            sourceConversationId = "c1",
            query = "zeta",
        )
        assertThat(targets).isEmpty()
    }

    @Test
    fun input_order_is_preserved() {
        val targets = ForwardTargets.of(
            listOf(group("c3", "Gamma"), group("c2", "Beta"), group("c4", "Alpha")),
            sourceConversationId = "c1",
            query = "",
        )
        assertThat(targets.map { it.conversationId }).containsExactly("c3", "c2", "c4").inOrder()
    }

    @Test
    fun a_direct_conversation_resolves_the_other_participant_as_the_title_and_is_searchable_by_it() {
        val dm = direct(
            "c2",
            ApiParticipant(id = "p-me", userId = "me", displayName = "Me"),
            ApiParticipant(id = "p-bob", userId = "bob", displayName = "Bob Marley"),
        )
        val targets = ForwardTargets.of(
            listOf(dm),
            sourceConversationId = "c1",
            query = "bob",
            currentUserId = "me",
        )
        assertThat(targets).hasSize(1)
        assertThat(targets.single().title).isEqualTo("Bob Marley")
    }

    @Test
    fun a_blank_avatar_degrades_to_null_and_a_present_one_is_carried() {
        val targets = ForwardTargets.of(
            listOf(group("c2", "Alpha", avatar = "  "), group("c3", "Beta", avatar = "https://a/x.png")),
            sourceConversationId = "c1",
            query = "",
        )
        assertThat(targets.first { it.conversationId == "c2" }.avatar).isNull()
        assertThat(targets.first { it.conversationId == "c3" }.avatar).isEqualTo("https://a/x.png")
    }

    @Test
    fun the_target_carries_the_deterministic_conversation_accent_and_member_count() {
        val conv = group("c2", "Alpha", members = 5)
        val target = ForwardTargets.of(listOf(conv), sourceConversationId = "c1", query = "").single()

        assertThat(target.accentHex).isEqualTo(conv.accentHex())
        assertThat(target.memberCount).isEqualTo(5)
        assertThat(target.type).isEqualTo("group")
    }
}
