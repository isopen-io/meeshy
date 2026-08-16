package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class MemberRosterTest {

    private fun member(
        id: String,
        userId: String? = id,
        role: String? = "member",
        displayName: String? = "Name $id",
    ) = PaginatedParticipant(
        id = id,
        userId = userId,
        displayName = displayName,
        conversationRole = role,
    )

    private fun page(
        members: List<PaginatedParticipant>,
        nextCursor: String? = null,
        hasMore: Boolean = false,
        totalCount: Int? = null,
    ) = MemberRosterPage(
        members = members,
        nextCursor = nextCursor,
        hasMore = hasMore,
        totalCount = totalCount,
    )

    @Test
    fun the_first_page_replaces_whatever_was_loaded_before() {
        val stale = MemberRoster.EMPTY.withFirstPage(page(listOf(member("a"), member("b"))))

        val fresh = stale.withFirstPage(page(listOf(member("c"))))

        assertThat(fresh.members.map { it.id }).containsExactly("c")
    }

    @Test
    fun a_next_page_is_appended_after_the_members_already_loaded() {
        val first = MemberRoster.EMPTY.withFirstPage(
            page(listOf(member("a"), member("b")), nextCursor = "b", hasMore = true),
        )

        val second = first.withNextPage(page(listOf(member("c"), member("d"))))

        assertThat(second.members.map { it.id }).containsExactly("a", "b", "c", "d").inOrder()
    }

    @Test
    fun a_next_page_repeating_an_already_loaded_member_does_not_duplicate_it() {
        val first = MemberRoster.EMPTY.withFirstPage(
            page(listOf(member("a"), member("b")), nextCursor = "b", hasMore = true),
        )

        val second = first.withNextPage(page(listOf(member("b"), member("c"))))

        assertThat(second.members.map { it.id }).containsExactly("a", "b", "c").inOrder()
    }

    @Test
    fun a_page_claiming_more_results_without_a_cursor_ends_the_pagination() {
        val roster = MemberRoster.EMPTY.withFirstPage(
            page(listOf(member("a")), nextCursor = null, hasMore = true),
        )

        assertThat(roster.hasMore).isFalse()
    }

    @Test
    fun a_page_carrying_a_cursor_and_more_results_keeps_the_pagination_open() {
        val roster = MemberRoster.EMPTY.withFirstPage(
            page(listOf(member("a")), nextCursor = "a", hasMore = true),
        )

        assertThat(roster.hasMore).isTrue()
        assertThat(roster.nextCursor).isEqualTo("a")
    }

    @Test
    fun the_last_page_closes_the_pagination_and_drops_the_cursor() {
        val first = MemberRoster.EMPTY.withFirstPage(
            page(listOf(member("a")), nextCursor = "a", hasMore = true),
        )

        val last = first.withNextPage(page(listOf(member("b")), nextCursor = null, hasMore = false))

        assertThat(last.hasMore).isFalse()
        assertThat(last.nextCursor).isNull()
    }

    @Test
    fun removing_a_member_by_user_id_drops_the_row() {
        val roster = MemberRoster.EMPTY.withFirstPage(
            page(listOf(member(id = "p1", userId = "u1"), member(id = "p2", userId = "u2"))),
        )

        assertThat(roster.withoutUser("u1").members.map { it.id }).containsExactly("p2")
    }

    @Test
    fun removing_a_member_by_participant_id_drops_the_row_too() {
        val roster = MemberRoster.EMPTY.withFirstPage(
            page(listOf(member(id = "p1", userId = "u1"), member(id = "p2", userId = "u2"))),
        )

        assertThat(roster.withoutUser("p1").members.map { it.id }).containsExactly("p2")
    }

    @Test
    fun removing_an_unknown_member_leaves_the_roster_untouched() {
        val roster = MemberRoster.EMPTY.withFirstPage(page(listOf(member("p1")), totalCount = 1))

        assertThat(roster.withoutUser("ghost")).isEqualTo(roster)
    }

    @Test
    fun removing_a_member_decrements_the_server_total() {
        val roster = MemberRoster.EMPTY.withFirstPage(
            page(listOf(member(id = "p1", userId = "u1")), totalCount = 12),
        )

        assertThat(roster.withoutUser("u1").totalCount).isEqualTo(11)
    }

    @Test
    fun the_displayed_count_prefers_the_server_total_over_the_loaded_page_size() {
        val roster = MemberRoster.EMPTY.withFirstPage(
            page(listOf(member("a"), member("b")), nextCursor = "b", hasMore = true, totalCount = 40),
        )

        assertThat(roster.displayCount).isEqualTo(40)
    }

    @Test
    fun the_displayed_count_falls_back_to_the_loaded_members_when_the_server_sent_no_total() {
        val roster = MemberRoster.EMPTY.withFirstPage(page(listOf(member("a"), member("b"))))

        assertThat(roster.displayCount).isEqualTo(2)
    }

    @Test
    fun promoting_a_member_by_user_id_rewrites_only_that_row_s_role() {
        val roster = MemberRoster.EMPTY.withFirstPage(
            page(
                listOf(
                    member(id = "p1", userId = "u1", role = "member"),
                    member(id = "p2", userId = "u2", role = "member"),
                ),
            ),
        )

        val promoted = roster.withRole("u1", MemberRole.ADMIN)

        assertThat(promoted.members.first { it.id == "p1" }.conversationRole).isEqualTo("admin")
        assertThat(promoted.members.first { it.id == "p2" }.conversationRole).isEqualTo("member")
    }

    @Test
    fun changing_the_role_of_an_unknown_member_leaves_the_roster_untouched() {
        val roster = MemberRoster.EMPTY.withFirstPage(page(listOf(member("p1"))))

        assertThat(roster.withRole("ghost", MemberRole.ADMIN)).isEqualTo(roster)
    }

    @Test
    fun a_roster_that_never_loaded_a_page_is_empty_and_closed() {
        assertThat(MemberRoster.EMPTY.members).isEmpty()
        assertThat(MemberRoster.EMPTY.hasMore).isFalse()
        assertThat(MemberRoster.EMPTY.nextCursor).isNull()
        assertThat(MemberRoster.EMPTY.displayCount).isEqualTo(0)
    }
}
