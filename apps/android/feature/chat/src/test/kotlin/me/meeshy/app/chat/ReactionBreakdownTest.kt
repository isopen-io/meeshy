package me.meeshy.app.chat

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.ReactionGroup
import me.meeshy.sdk.model.ReactionSyncResponse
import me.meeshy.sdk.model.ReactionUserDetail
import org.junit.Test

class ReactionBreakdownTest {

    private fun user(id: String, username: String = id, avatar: String? = null) =
        ReactionUserDetail(userId = id, username = username, avatar = avatar)

    private fun response(vararg groups: ReactionGroup) =
        ReactionSyncResponse(messageId = "m1", reactions = groups.toList())

    @Test
    fun an_empty_response_produces_an_empty_breakdown_with_no_tabs() {
        val breakdown = ReactionBreakdown.of(response(), currentUserId = "me")

        assertThat(breakdown.isEmpty).isTrue()
        assertThat(breakdown.tabs).isEmpty()
    }

    @Test
    fun a_group_with_a_blank_emoji_is_dropped() {
        val breakdown = ReactionBreakdown.of(
            response(ReactionGroup(emoji = "   ", count = 1, users = listOf(user("a")))),
            currentUserId = "me",
        )

        assertThat(breakdown.isEmpty).isTrue()
    }

    @Test
    fun a_group_with_no_reactors_and_no_count_is_dropped() {
        val breakdown = ReactionBreakdown.of(
            response(ReactionGroup(emoji = "👍", count = 0, users = emptyList())),
            currentUserId = "me",
        )

        assertThat(breakdown.isEmpty).isTrue()
    }

    @Test
    fun a_single_emoji_reaction_yields_one_emoji_tab_and_no_all_tab() {
        val breakdown = ReactionBreakdown.of(
            response(ReactionGroup(emoji = "👍", count = 1, users = listOf(user("a", "Alice")))),
            currentUserId = "me",
        )

        assertThat(breakdown.tabs).hasSize(1)
        val tab = breakdown.tabs.single()
        assertThat(tab).isInstanceOf(ReactionTab.Emoji::class.java)
        assertThat((tab as ReactionTab.Emoji).emoji).isEqualTo("👍")
        assertThat(tab.count).isEqualTo(1)
        assertThat(tab.reactors.map { it.displayName }).containsExactly("Alice")
        assertThat(tab.reactors.single().emoji).isEqualTo("👍")
    }

    @Test
    fun a_blank_username_falls_back_to_the_user_id() {
        val breakdown = ReactionBreakdown.of(
            response(ReactionGroup(emoji = "👍", count = 1, users = listOf(user("a", "   ")))),
            currentUserId = "me",
        )

        assertThat(breakdown.tabs.single().reactors.single().displayName).isEqualTo("a")
    }

    @Test
    fun a_username_is_trimmed() {
        val breakdown = ReactionBreakdown.of(
            response(ReactionGroup(emoji = "👍", count = 1, users = listOf(user("a", "  Alice  ")))),
            currentUserId = "me",
        )

        assertThat(breakdown.tabs.single().reactors.single().displayName).isEqualTo("Alice")
    }

    @Test
    fun the_current_user_is_flagged_as_self() {
        val breakdown = ReactionBreakdown.of(
            response(ReactionGroup(emoji = "👍", count = 1, users = listOf(user("me", "Me")))),
            currentUserId = "me",
        )

        assertThat(breakdown.tabs.single().reactors.single().isSelf).isTrue()
    }

    @Test
    fun a_blank_current_user_id_flags_nobody_as_self() {
        val breakdown = ReactionBreakdown.of(
            response(ReactionGroup(emoji = "👍", count = 1, users = listOf(user("me", "Me")))),
            currentUserId = "   ",
        )

        assertThat(breakdown.tabs.single().reactors.single().isSelf).isFalse()
    }

    @Test
    fun self_floats_to_the_top_of_a_tab_preserving_the_order_of_the_rest() {
        val breakdown = ReactionBreakdown.of(
            response(
                ReactionGroup(
                    emoji = "👍",
                    count = 3,
                    users = listOf(user("a", "Alice"), user("me", "Me"), user("b", "Bob")),
                ),
            ),
            currentUserId = "me",
        )

        assertThat(breakdown.tabs.single().reactors.map { it.displayName })
            .containsExactly("Me", "Alice", "Bob")
            .inOrder()
    }

    @Test
    fun emoji_tabs_are_ordered_by_count_descending() {
        val breakdown = ReactionBreakdown.of(
            response(
                ReactionGroup(emoji = "👍", count = 1, users = listOf(user("a"))),
                ReactionGroup(emoji = "❤️", count = 3, users = listOf(user("b"), user("c"), user("d"))),
                ReactionGroup(emoji = "😂", count = 2, users = listOf(user("e"), user("f"))),
            ),
            currentUserId = "me",
        )

        val emojiTabs = breakdown.tabs.filterIsInstance<ReactionTab.Emoji>()
        assertThat(emojiTabs.map { it.emoji }).containsExactly("❤️", "😂", "👍").inOrder()
    }

    @Test
    fun ties_in_count_preserve_the_original_group_order() {
        val breakdown = ReactionBreakdown.of(
            response(
                ReactionGroup(emoji = "👍", count = 2, users = listOf(user("a"), user("b"))),
                ReactionGroup(emoji = "❤️", count = 2, users = listOf(user("c"), user("d"))),
            ),
            currentUserId = "me",
        )

        val emojiTabs = breakdown.tabs.filterIsInstance<ReactionTab.Emoji>()
        assertThat(emojiTabs.map { it.emoji }).containsExactly("👍", "❤️").inOrder()
    }

    @Test
    fun multiple_emojis_add_a_leading_all_tab_summing_counts() {
        val breakdown = ReactionBreakdown.of(
            response(
                ReactionGroup(emoji = "👍", count = 1, users = listOf(user("a"))),
                ReactionGroup(emoji = "❤️", count = 2, users = listOf(user("b"), user("c"))),
            ),
            currentUserId = "me",
        )

        val first = breakdown.tabs.first()
        assertThat(first).isInstanceOf(ReactionTab.All::class.java)
        assertThat(first.count).isEqualTo(3)
    }

    @Test
    fun the_all_tab_concatenates_reactors_across_tabs_in_tab_order() {
        val breakdown = ReactionBreakdown.of(
            response(
                ReactionGroup(emoji = "👍", count = 1, users = listOf(user("a", "Alice"))),
                ReactionGroup(emoji = "❤️", count = 2, users = listOf(user("b", "Bob"), user("c", "Cara"))),
            ),
            currentUserId = "me",
        )

        val all = breakdown.tabs.first() as ReactionTab.All
        // ❤️ has the higher count so its tab sorts first; All follows that order.
        assertThat(all.reactors.map { it.displayName })
            .containsExactly("Bob", "Cara", "Alice")
            .inOrder()
        assertThat(all.reactors.map { it.emoji }).containsExactly("❤️", "❤️", "👍").inOrder()
    }

    @Test
    fun self_reacting_with_several_emojis_appears_once_per_emoji_and_floats_first_in_all() {
        val breakdown = ReactionBreakdown.of(
            response(
                ReactionGroup(emoji = "👍", count = 2, users = listOf(user("a", "Alice"), user("me", "Me"))),
                ReactionGroup(emoji = "❤️", count = 1, users = listOf(user("me", "Me"))),
            ),
            currentUserId = "me",
        )

        val all = breakdown.tabs.first() as ReactionTab.All
        // Both self entries float to the front, preserving tab order (👍 has higher count → first).
        assertThat(all.reactors.take(2).map { it.emoji }).containsExactly("👍", "❤️").inOrder()
        assertThat(all.reactors.take(2).all { it.isSelf }).isTrue()
        assertThat(all.reactors.drop(2).map { it.displayName }).containsExactly("Alice")
    }

    @Test
    fun the_count_falls_back_to_the_reactor_size_when_the_server_count_is_absent() {
        val breakdown = ReactionBreakdown.of(
            response(ReactionGroup(emoji = "👍", count = 0, users = listOf(user("a"), user("b")))),
            currentUserId = "me",
        )

        assertThat(breakdown.tabs.single().count).isEqualTo(2)
    }

    @Test
    fun a_group_with_a_positive_count_but_no_listed_reactors_keeps_its_tab_with_an_empty_list() {
        val breakdown = ReactionBreakdown.of(
            response(ReactionGroup(emoji = "👍", count = 5, users = emptyList())),
            currentUserId = "me",
        )

        val tab = breakdown.tabs.single()
        assertThat(tab.count).isEqualTo(5)
        assertThat(tab.reactors).isEmpty()
    }

    @Test
    fun a_duplicated_reactor_within_a_group_is_collapsed_to_the_first_occurrence() {
        val breakdown = ReactionBreakdown.of(
            response(
                ReactionGroup(
                    emoji = "👍",
                    count = 2,
                    users = listOf(user("a", "Alice"), user("a", "Alice2")),
                ),
            ),
            currentUserId = "me",
        )

        val reactors = breakdown.tabs.single().reactors
        assertThat(reactors).hasSize(1)
        assertThat(reactors.single().displayName).isEqualTo("Alice")
    }

    @Test
    fun the_reactor_carries_its_avatar_and_user_id() {
        val breakdown = ReactionBreakdown.of(
            response(
                ReactionGroup(
                    emoji = "👍",
                    count = 1,
                    users = listOf(user("a", "Alice", avatar = "https://cdn/a.png")),
                ),
            ),
            currentUserId = "me",
        )

        val reactor = breakdown.tabs.single().reactors.single()
        assertThat(reactor.userId).isEqualTo("a")
        assertThat(reactor.avatarUrl).isEqualTo("https://cdn/a.png")
    }

    @Test
    fun a_blank_avatar_is_normalised_to_null() {
        val breakdown = ReactionBreakdown.of(
            response(
                ReactionGroup(emoji = "👍", count = 1, users = listOf(user("a", "Alice", avatar = "  "))),
            ),
            currentUserId = "me",
        )

        assertThat(breakdown.tabs.single().reactors.single().avatarUrl).isNull()
    }
}
